/**
 * Live presence for one ERD canvas: who else is here, and where their pointer is.
 *
 * The relay is a plain WebSocket on the app's own origin (see
 * `server/lib/collab/server.ts`). Everything here is deliberately ephemeral:
 * peers exist only while their socket does, and nothing about a cursor is ever
 * written anywhere. Read-only visitors take part too — seeing where someone
 * else is looking is the whole point, and a guest cursor changes no document.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl, getAuthToken } from '../lib/api';
import {
  CURSOR_THROTTLE_MS,
  FATAL_PRESENCE_CODES,
  PRESENCE_KEEPALIVE_MS,
  afterDisconnect,
  collabSocketUrl,
  emptyPresence,
  nextPresenceState,
  parseCollabServerMessage,
  type PresenceSnapshot,
} from '../lib/collab/presence';

/** How many times an unexpected close is retried before giving up. */
const MAX_RECONNECT_ATTEMPTS = 4;

export interface ErdPresenceOptions {
  /** Diagram uid — the room key. Empty means there is no canvas yet. */
  diagramUid?: string | null;
  /**
   * Display name. null holds the connection back entirely, which is how a guest
   * who has not given a name yet stays out of the room.
   */
  name?: string | null;
  shareToken?: string | null;
  /** Set false for surfaces that are not a collaboration canvas (the DB client). */
  enabled?: boolean;
}

export interface ErdPresence extends PresenceSnapshot {
  /** Report a pointer position in flow coordinates; throttled internally. */
  publishCursor: (x: number, y: number) => void;
  /**
   * Whether anyone else is in the room. Lets the canvas skip even converting a
   * pointer position when nobody is watching, which is the common case.
   */
  isWatching: () => boolean;
}

export function useErdPresence(options: ErdPresenceOptions): ErdPresence {
  const { diagramUid = null, name = null, shareToken = null, enabled = true } = options;

  const [state, setState] = useState<PresenceSnapshot>(emptyPresence);

  const socketRef = useRef<WebSocket | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const watchedByRef = useRef(0);
  // Remembered from the room so a reconnect keeps the same colour, instead of
  // reappearing to everyone else as a different person.
  const preferredColorRef = useRef<string | null>(null);
  const throttleRef = useRef<{ lastSentAt: number; timer: ReturnType<typeof setTimeout> | null }>({
    lastSentAt: 0,
    timer: null,
  });

  const active = Boolean(enabled && diagramUid && name);

  useEffect(() => {
    if (!active || !diagramUid || !name) {
      setState(emptyPresence());
      return;
    }

    let disposed = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

    function connect() {
      if (disposed) return;

      const url = collabSocketUrl({
        uid: diagramUid,
        apiBaseUrl: getApiBaseUrl(),
        pageOrigin: window.location.origin,
        shareToken,
        authToken: getAuthToken(),
      });
      if (!url) {
        setState({ ...emptyPresence(), status: 'error', error: 'Live presence is unavailable here.' });
        return;
      }

      setState((current) => ({ ...current, status: current.selfId ? current.status : 'connecting' }));

      // The socket is held locally as well as in the ref: a reconnect replaces
      // the ref, and a late handler on the old socket must not act on the new
      // one.
      const connection = new WebSocket(url);
      socketRef.current = connection;

      connection.onopen = () => {
        attempts = 0;
        const color = preferredColorRef.current;
        connection.send(JSON.stringify(color ? { t: 'hello', name, color } : { t: 'hello', name }));
        // An idle socket is closed by intermediaries long before it is idle in
        // any way a person would notice.
        keepaliveTimer = setInterval(() => {
          if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ t: 'ping' }));
        }, PRESENCE_KEEPALIVE_MS);
      };

      connection.onmessage = (event) => {
        const message = parseCollabServerMessage(typeof event.data === 'string' ? event.data : '');
        if (!message) return;

        setState((current) => nextPresenceState(current, message));

        if (message.t === 'welcome') {
          attempts = 0;
          preferredColorRef.current = message.color;
        }
        if (message.t === 'error' && FATAL_PRESENCE_CODES.has(message.code)) {
          // The relay drops the socket right after a refusal; do not come back.
          attempts = MAX_RECONNECT_ATTEMPTS;
          try {
            connection.close();
          } catch {
            // Already closing.
          }
        }
      };

      connection.onclose = () => {
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer);
          keepaliveTimer = null;
        }
        if (disposed) return;
        setState(afterDisconnect);
        scheduleReconnect();
      };

      connection.onerror = () => {
        // Nothing to add: a failed handshake ends as a close event, and the
        // close handler decides whether to try again.
      };
    }

    function scheduleReconnect() {
      if (disposed || attempts >= MAX_RECONNECT_ATTEMPTS) return;
      attempts += 1;
      reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** (attempts - 1), 15000));
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      const current = socketRef.current;
      socketRef.current = null;
      if (current) {
        // Readers of this socket are gone with the effect; drop the handlers so
        // a late close cannot schedule a reconnect for an unmounted canvas.
        current.onclose = null;
        current.onerror = null;
        current.onmessage = null;
        current.onopen = null;
        try {
          current.close();
        } catch {
          // Already gone.
        }
      }
    };
  }, [active, diagramUid, name, shareToken]);

  // Stable across renders, so a canvas that only reports cursors never
  // re-renders because of them.
  const publishCursor = useCallback((x: number, y: number) => {
    pendingCursorRef.current = { x: Math.round(x), y: Math.round(y) };
    const throttle = throttleRef.current;
    if (throttle.timer !== null) return;

    const flush = () => {
      throttle.timer = null;
      const pending = pendingCursorRef.current;
      pendingCursorRef.current = null;
      const socket = socketRef.current;
      if (!pending || socket?.readyState !== WebSocket.OPEN) return;
      throttle.lastSentAt = Date.now();
      socket.send(JSON.stringify({ t: 'cursor', x: pending.x, y: pending.y }));
    };

    const wait = Math.max(0, CURSOR_THROTTLE_MS - (Date.now() - throttle.lastSentAt));
    if (wait === 0) flush();
    else throttle.timer = setTimeout(flush, wait);
  }, []);

  // Kept in a ref so the answer never re-renders the canvas that asks.
  useEffect(() => {
    watchedByRef.current = state.peers.length;
  }, [state.peers]);

  const isWatching = useCallback(() => watchedByRef.current > 0, []);

  return { ...state, publishCursor, isWatching };
}
