/**
 * The presence relay — one WebSocket endpoint, no stored state, no content.
 *
 * Why a relay on our own server and not a hosted realtime service: this
 * deployment (and the desktop and CLI builds) can run with no Supabase
 * configured at all, so anything that needs a third-party realtime backend
 * would simply be dark on the instance that serves `pairfob`-style share links.
 * A few hundred lines of relay keeps presence working everywhere the app runs.
 *
 * What the relay never does: read a frame's contents, keep a cursor after its
 * socket leaves, or accept an identity from the client.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  COLLAB_ERROR_MESSAGES,
  COLLAB_MAX_MESSAGE_BYTES,
  COLLAB_RATE_BURST,
  COLLAB_RATE_PER_SECOND,
  parseClientMessage,
  serializeServerMessage,
  type CollabErrorCode,
  type CollabServerMessage,
} from "./protocol.js";
import { CollabRooms, toPeerState, type CollabPeer, type CollabSocket } from "./rooms.js";
import { authorizeCollabRoom, type CollabRoomAccess, type CollabRoomRequest } from "./authorize.js";

/** The only upgrade path this module answers. */
export const COLLAB_WS_PATH = "/api/collab";

/** How long a peer may go quiet before the ping stops believing it is alive. */
const DEFAULT_HEARTBEAT_MS = 30_000;

/** Frames held while the room lookup runs; a client cannot queue forever. */
const MAX_QUEUED_FRAMES = 32;

export interface CollabServerOptions {
  /** Injected by tests; defaults to the real database-backed check. */
  authorize?: (request: CollabRoomRequest) => Promise<CollabRoomAccess>;
  rooms?: CollabRooms;
  heartbeatMs?: number;
  rate?: { burst: number; perSecond: number };
}

/**
 * Attach the relay to an already-listening HTTP server. The caller keeps
 * ownership of the server; this only adds an `upgrade` listener, and only for
 * `/api/collab`, so Vite's HMR socket and anything else that upgrades is left
 * exactly as it was.
 */

let globalRooms: CollabRooms | null = null;

export function broadcastCollabEvent(roomKey: string, message: CollabServerMessage, excludePeerId?: string): void {
  if (!globalRooms) return;
  globalRooms.broadcast(roomKey, excludePeerId ?? "__system__", message);
}

export function attachCollabWebSocket(server: HttpServer, options: CollabServerOptions = {}): void {
  const rooms = options.rooms ?? new CollabRooms();
  globalRooms = rooms;
  const authorize = options.authorize ?? authorizeCollabRoom;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const burst = options.rate?.burst ?? COLLAB_RATE_BURST;
  const perSecond = options.rate?.perSecond ?? COLLAB_RATE_PER_SECOND;

  const wss = new WebSocketServer({ noServer: true, maxPayload: COLLAB_MAX_MESSAGE_BYTES });
  const alive = new WeakMap<object, boolean>();

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://localhost");
    } catch {
      return;
    }
    if (url.pathname !== COLLAB_WS_PATH) return;

    wss.handleUpgrade(request, socket, head, (ws) => {
      void startSession(ws, url, request);
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (alive.get(client) === false) {
        client.terminate();
        continue;
      }
      alive.set(client, false);
      try {
        client.ping();
      } catch {
        // A socket that cannot be pinged is caught by the next sweep.
      }
    }
  }, heartbeatMs);
  // Never hold the process open just to send pings.
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));

  async function startSession(ws: WebSocket, url: URL, request: IncomingMessage): Promise<void> {
    alive.set(ws, true);

    let closed = false;
    let authorized = false;
    let peer: CollabPeer | null = null;
    let roomKey: string | null = null;
    const queued: string[] = [];

    let allowance = burst;
    let lastRefill = Date.now();

    const safeSend = (message: CollabServerMessage): void => {
      if (closed) return;
      try {
        ws.send(serializeServerMessage(message));
      } catch {
        // The socket is already going away; nothing to do but forget it.
      }
    };

    const refuse = (code: CollabErrorCode, detail?: string): void => {
      safeSend({ t: "error", code, message: detail?.trim() || COLLAB_ERROR_MESSAGES[code] });
      // Stop the room relaying to a socket that is about to be dropped.
      closed = true;
      try {
        ws.close(1008, code);
      } catch {
        // Already closing.
      }
    };

    const takeToken = (): boolean => {
      const now = Date.now();
      allowance = Math.min(burst, allowance + ((now - lastRefill) / 1000) * perSecond);
      lastRefill = now;
      if (allowance < 1) return false;
      allowance -= 1;
      return true;
    };

    const socket: CollabSocket = {
      send: (data: string) => {
        if (closed) return;
        try {
          ws.send(data);
        } catch {
          // Ignored: a failed relay must not break the loop for other peers.
        }
      },
      close: () => {
        try {
          ws.close();
        } catch {
          // Ignored.
        }
      },
    };

    function onMessage(raw: string): void {
      if (!roomKey) return;

      const message = parseClientMessage(raw);
      if (!message) {
        safeSend({ t: "error", code: "invalid_message", message: COLLAB_ERROR_MESSAGES.invalid_message });
        return;
      }
      if (message.t === "ping") return;

      if (message.t === "hello") {
        // One identity per connection: a later hello cannot rename or
        // re-identify a socket that is already in the room.
        if (peer) return;

        const result = rooms.join(roomKey, { name: message.name, color: message.color }, socket);
        // `=== false` rather than `!result.ok`: narrowing a boolean literal needs
        // strictNullChecks, which this project compiles without.
        if (result.ok === false) {
          refuse("room_full");
          return;
        }

        const joined = result.peer;
        peer = joined;
        rooms.sendTo(roomKey, joined.id, {
          t: "welcome",
          id: joined.id,
          name: joined.name,
          color: joined.color,
          peers: rooms
            .peers(roomKey)
            .filter((other) => other.id !== joined.id)
            .map(toPeerState),
        });
        rooms.broadcast(roomKey, joined.id, { t: "peer-join", peer: toPeerState(joined) });
        return;
      }

      // A cursor/action that belongs to no peer is unattributable; drop it.
      if (!peer) return;
      if (message.t === "cursor") {
        if (!rooms.moveCursor(roomKey, peer.id, message.x, message.y)) return;
        rooms.broadcast(roomKey, peer.id, { t: "cursor", id: peer.id, x: message.x, y: message.y });
        return;
      }
      if (message.t === "cursor-chat") {
        rooms.broadcast(roomKey, peer.id, { t: "cursor-chat", id: peer.id, text: message.text });
        return;
      }
      if (message.t === "viewport") {
        rooms.broadcast(roomKey, peer.id, { t: "viewport", id: peer.id, x: message.x, y: message.y, zoom: message.zoom });
        return;
      }
    }

    ws.on("message", (data, isBinary) => {
      if (isBinary) return; // Presence is text only; binary frames are not part of it.
      if (!takeToken()) {
        refuse("rate_limited");
        return;
      }

      const raw = data.toString();
      // The room lookup is async, so the first frames — normally the hello —
      // arrive before we know whether this visitor may be here at all.
      if (!authorized) {
        if (queued.length < MAX_QUEUED_FRAMES) queued.push(raw);
        return;
      }
      onMessage(raw);
    });

    ws.on("pong", () => alive.set(ws, true));

    ws.on("close", () => {
      closed = true;
      alive.delete(ws);
      if (!roomKey || !peer) return;
      rooms.broadcast(roomKey, peer.id, { t: "peer-leave", id: peer.id });
      rooms.leave(roomKey, peer.id);
    });

    ws.on("error", () => {
      try {
        ws.terminate();
      } catch {
        // Ignored.
      }
    });

    const access = await authorize({
      diagramUid: url.searchParams.get("diagram"),
      authToken: url.searchParams.get("token"),
      shareToken: url.searchParams.get("share_token"),
      cookieHeader: request.headers.cookie ?? null,
    }).catch((): CollabRoomAccess => ({ ok: false, code: "unavailable", detail: COLLAB_ERROR_MESSAGES.unavailable }));

    if (access.ok === false) {
      refuse(access.code, access.detail);
      return;
    }

    roomKey = access.roomKey;
    authorized = true;
    for (const raw of queued.splice(0)) onMessage(raw);
  }
}
