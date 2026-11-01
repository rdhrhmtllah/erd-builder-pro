/**
 * The collaboration relay's wire format and its limits.
 *
 * Presence is ephemeral: a room is a set of live sockets, the server never
 * stores a cursor and never sees diagram content. Everything that arrives from
 * a browser is untrusted — it is written into the DOM of every other peer in
 * the room — so every field is validated here, once, before it is relayed.
 *
 * The client mirror of this file is `src/lib/collab/presence.ts`; the shapes
 * are pinned together by `src/lib/collab/__tests__/collab-contract.test.ts`,
 * which parses real payloads built by this module.
 */

/** How many cursors a single diagram may show at once. */
export const COLLAB_MAX_PEERS_PER_ROOM = 25;

/** Display names are rendered next to every cursor in the room. */
export const COLLAB_MAX_NAME_LENGTH = 32;

/** ws closes a connection whose frame exceeds this. */
export const COLLAB_MAX_MESSAGE_BYTES = 4096;

/** Flow coordinates further out than this are nonsense, not a cursor. */
export const COLLAB_MAX_COORDINATE = 1_000_000;

/** Sustained message rate per connection, and the burst already allowed. */
export const COLLAB_RATE_PER_SECOND = 30;
export const COLLAB_RATE_BURST = 80;

/**
 * Cursor colours, assigned by the server so two peers in one room never share
 * one. The client renders what it is told instead of picking its own.
 */
export const COLLAB_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

export interface CollabPeerState {
  id: string;
  name: string;
  color: string;
  /** Last known cursor in flow coordinates; absent until the peer moves. */
  x?: number;
  y?: number;
}

export type CollabClientMessage =
  | { t: "hello"; name: string; color?: string }
  | { t: "cursor"; x: number; y: number }
  | { t: "ping" };

export type CollabErrorCode =
  | "not_found"
  | "private"
  | "expired"
  | "token_required"
  | "room_full"
  | "rate_limited"
  | "invalid_message"
  | "unavailable";

export type CollabServerMessage =
  | { t: "welcome"; id: string; name: string; color: string; peers: CollabPeerState[] }
  | { t: "peer-join"; peer: CollabPeerState }
  | { t: "peer-leave"; id: string }
  | { t: "cursor"; id: string; x: number; y: number }
  | { t: "content-change"; id: string; version: number; editorName?: string }
  | { t: "error"; code: CollabErrorCode; message: string };

/** Human-readable text for a code the client shows to the visitor. */
export const COLLAB_ERROR_MESSAGES: Record<CollabErrorCode, string> = {
  not_found: "This diagram is no longer available.",
  private: "This diagram is not shared.",
  expired: "This share link has expired.",
  token_required: "This share link needs its access token.",
  room_full: "This diagram already has the maximum number of viewers.",
  rate_limited: "Too many updates from this connection.",
  invalid_message: "Unsupported message.",
  unavailable: "Live presence is unavailable on this instance.",
};

/**
 * A display name is user text that lands in other people's DOM: strip control
 * characters (newlines would break the badge), collapse runs of whitespace, and
 * cap by code point so an emoji is never cut in half.
 */
export function sanitizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, COLLAB_MAX_NAME_LENGTH).join("");
}

/** Only a plain #rrggbb is relayed; anything else becomes the server's choice. */
export function normalizeColor(raw: unknown): string | undefined {
  return typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : undefined;
}

/** Cursor coordinates must be finite and sane; they are relayed as integers. */
export function normalizeCursor(
  x: unknown,
  y: unknown,
): { x: number; y: number } | null {
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > COLLAB_MAX_COORDINATE || Math.abs(y) > COLLAB_MAX_COORDINATE) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Prefer the colour the visitor's browser suggested, but never hand two peers
 * in the same room the same one — a shared colour makes cursors unusable.
 */
export function assignColor(used: Iterable<string>, random: () => number = Math.random): string {
  const taken = new Set(used);
  const free = COLLAB_COLORS.filter((color) => !taken.has(color));
  const pool = free.length > 0 ? free : [...COLLAB_COLORS];
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/** Parse one client frame; anything unexpected is dropped, never relayed. */
export function parseClientMessage(raw: string): CollabClientMessage | null {
  if (typeof raw !== "string" || raw.length > COLLAB_MAX_MESSAGE_BYTES) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const message = value as Record<string, unknown>;
  switch (message.t) {
    case "hello": {
      const name = sanitizeDisplayName(message.name);
      return name === null ? null : { t: "hello", name, color: normalizeColor(message.color) };
    }
    case "cursor": {
      const cursor = normalizeCursor(message.x, message.y);
      return cursor === null ? null : { t: "cursor", ...cursor };
    }
    case "ping":
      return { t: "ping" };
    default:
      return null;
  }
}

export function serializeServerMessage(message: CollabServerMessage): string {
  return JSON.stringify(message);
}
