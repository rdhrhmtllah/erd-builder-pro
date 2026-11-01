/**
 * Browser side of the presence protocol.
 *
 * Mirrors `server/lib/collab/protocol.ts`, which owns the authoritative rules —
 * names, colours and coordinates are validated there before they reach any
 * other visitor. This side validates the server's frames as well, because a
 * frame is still untrusted input at the point it is rendered.
 *
 * `src/lib/collab/__tests__/collab-contract.test.ts` parses payloads built by
 * the server module, so the two descriptions cannot drift apart silently.
 */

/** One other person on the canvas. */
export interface PresencePeer {
  id: string;
  name: string;
  color: string;
  /** Flow coordinates of their last cursor, or null before they moved. */
  x: number | null;
  y: number | null;
}

export type PresenceStatus = "idle" | "connecting" | "open" | "closed" | "denied" | "error";

/** What the server sends to one peer of a diagram's presence room. */
export interface ServerPeerState {
  id: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
}

export type CollabServerMessage =
  | { t: "welcome"; id: string; name: string; color: string; peers: ServerPeerState[] }
  | { t: "peer-join"; peer: ServerPeerState }
  | { t: "peer-leave"; id: string }
  | { t: "cursor"; id: string; x: number; y: number }
  | { t: "content-change"; id: string; version: number; editorName?: string }
  | { t: "error"; code: string; message: string };

/** How often a moving pointer may reach the relay. */
export const CURSOR_THROTTLE_MS = 40;

/** Keeps an idle socket from being reaped by a proxy in front of the relay. */
export const PRESENCE_KEEPALIVE_MS = 25_000;

/** Codes that will not change on their own: retrying would only spam the log. */
export const FATAL_PRESENCE_CODES = new Set([
  "not_found",
  "private",
  "expired",
  "token_required",
  "room_full",
  "unavailable",
]);

const COORDINATE_LIMIT = 1_000_000;

/** Where the relay lives, relative to whatever base the API is reached at. */
export const COLLAB_SOCKET_PATH = "/api/collab";

/**
 * The WebSocket form of the API URL.
 *
 * `apiBaseUrl` is '' for the same-origin web build, an explicit host in the
 * desktop shell (a different port, which is why the auth token can travel as a
 * query parameter at all — the WebSocket API cannot set a header), and a proxy
 * origin under Vite. Returns null when there is nothing to connect to.
 */
export function collabSocketUrl(input: {
  uid: string;
  apiBaseUrl: string;
  pageOrigin?: string;
  shareToken?: string | null;
  authToken?: string | null;
}): string | null {
  if (!input.uid) return null;
  const base = input.apiBaseUrl || input.pageOrigin || "";
  if (!base) return null;

  let url: URL;
  try {
    url = new URL(COLLAB_SOCKET_PATH + `?diagram=${encodeURIComponent(input.uid)}`, base);
  } catch {
    return null;
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (input.shareToken) url.searchParams.set("share_token", input.shareToken);
  if (input.authToken) url.searchParams.set("token", input.authToken);
  return url.toString();
}

/** A display name is user text headed for other people's screens. */
export function normalizeGuestName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(cleaned).slice(0, 32).join("");
}

function normalizePeer(raw: unknown): ServerPeerState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const peer = raw as Record<string, unknown>;
  if (typeof peer.id !== "string" || !peer.id) return null;

  const name = normalizeGuestName(peer.name);
  const color = typeof peer.color === "string" && /^#[0-9a-fA-F]{6}$/.test(peer.color) ? peer.color : "#6b7280";

  const state: ServerPeerState = { id: peer.id, name: name || "Tamu", color };
  if (isCoordinate(peer.x) && isCoordinate(peer.y)) {
    state.x = Math.round(peer.x as number);
    state.y = Math.round(peer.y as number);
  }
  return state;
}

function isCoordinate(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= COORDINATE_LIMIT;
}

/** Parse one server frame; anything unrecognised is ignored rather than shown. */
export function parseCollabServerMessage(raw: unknown): CollabServerMessage | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const message = value as Record<string, unknown>;
  switch (message.t) {
    case "welcome": {
      const self = normalizePeer(message);
      if (!self) return null;
      const peers = Array.isArray(message.peers)
        ? message.peers.map(normalizePeer).filter((peer): peer is ServerPeerState => peer !== null)
        : [];
      return { t: "welcome", id: self.id, name: self.name, color: self.color, peers };
    }
    case "peer-join": {
      const peer = normalizePeer(message.peer);
      return peer ? { t: "peer-join", peer } : null;
    }
    case "peer-leave":
      return typeof message.id === "string" && message.id ? { t: "peer-leave", id: message.id } : null;
    case "cursor":
      if (typeof message.id !== "string" || !message.id) return null;
      if (!isCoordinate(message.x) || !isCoordinate(message.y)) return null;
      return { t: "cursor", id: message.id, x: Math.round(message.x as number), y: Math.round(message.y as number) };
    case "content-change":
      return typeof message.version === "number"
        ? { t: "content-change", id: String(message.id || ""), version: message.version, editorName: typeof message.editorName === "string" ? message.editorName : undefined }
        : null;
    case "error":
      return typeof message.code === "string"
        ? { t: "error", code: message.code, message: typeof message.message === "string" ? message.message : "" }
        : null;
    default:
      return null;
  }
}

/** Turn a server peer into the shape the canvas draws. */
export function toPresencePeer(peer: ServerPeerState): PresencePeer {
  return {
    id: peer.id,
    name: peer.name,
    color: peer.color,
    x: peer.x ?? null,
    y: peer.y ?? null,
  };
}

/** Everything the canvas knows about the people around it. */
export interface PresenceSnapshot {
  status: PresenceStatus;
  error: string | null;
  selfId: string | null;
  selfColor: string | null;
  peers: PresencePeer[];
}

export function emptyPresence(): PresenceSnapshot {
  return { status: 'idle', error: null, selfId: null, selfColor: null, peers: [] };
}

/**
 * Fold one server frame into the snapshot. Pure, so the interesting cases — a
 * cursor before its join, a duplicate join, a refusal — are testable without a
 * socket.
 */
export function nextPresenceState(current: PresenceSnapshot, message: CollabServerMessage): PresenceSnapshot {
  switch (message.t) {
    case 'welcome':
      return {
        status: 'open',
        error: null,
        selfId: message.id,
        selfColor: message.color,
        peers: message.peers.map(toPresencePeer),
      };
    case 'peer-join':
      if (current.peers.some((peer) => peer.id === message.peer.id)) return current;
      return { ...current, peers: [...current.peers, toPresencePeer(message.peer)] };
    case 'peer-leave':
      return { ...current, peers: current.peers.filter((peer) => peer.id !== message.id) };
    case 'cursor':
      // A cursor from a peer whose join we never saw has no name to draw.
      if (!current.peers.some((peer) => peer.id === message.id)) return current;
      return {
        ...current,
        peers: current.peers.map((peer) => (peer.id === message.id ? { ...peer, x: message.x, y: message.y } : peer)),
      };
    case 'error': {
      const fatal = FATAL_PRESENCE_CODES.has(message.code);
      return {
        ...current,
        status: fatal ? 'denied' : 'error',
        error: message.message || null,
        // A recoverable complaint (a frame the relay did not understand) leaves
        // the room as it was; only a refusal empties it.
        ...(fatal ? { selfId: null, selfColor: null, peers: [] as PresencePeer[] } : {}),
      };
    }
    default:
      return current;
  }
}

/** A close that was not asked for: keep the door open for a retry. */
export function afterDisconnect(current: PresenceSnapshot): PresenceSnapshot {
  if (current.status !== 'open' && current.status !== 'connecting') return current;
  return { ...current, status: 'closed', selfId: null, selfColor: null, peers: [] };
}

/**
 * The name a guest already gave in this tab. Kept in sessionStorage so a reload
 * does not ask again, while a new visit gets asked once.
 */
const NAME_KEY_PREFIX = "creatool:presence-name:";
const SKIP_KEY_PREFIX = "creatool:presence-skipped:";

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private browsing with storage disabled: presence still works this page.
  }
}

export function readGuestName(uid: string | null | undefined): string | null {
  if (!uid) return null;
  const stored = readSession(NAME_KEY_PREFIX + uid);
  return stored ? normalizeGuestName(stored) || null : null;
}

export function rememberGuestName(uid: string, name: string): void {
  writeSession(NAME_KEY_PREFIX + uid, normalizeGuestName(name));
}

export function hasSkippedPresence(uid: string | null | undefined): boolean {
  return Boolean(uid && readSession(SKIP_KEY_PREFIX + uid));
}

export function rememberSkippedPresence(uid: string): void {
  writeSession(SKIP_KEY_PREFIX + uid, "1");
}

/**
 * The share token of a protected link, as App records it when a visitor enters
 * one. The presence socket needs it for the same reason every API call does.
 */
export function readShareToken(uid: string | null | undefined): string | null {
  if (!uid) return null;
  return readSession(`share_token_${uid}`);
}
