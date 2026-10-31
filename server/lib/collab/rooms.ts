/**
 * In-memory rooms: one room per diagram, one entry per live socket.
 *
 * Presence is deliberately ephemeral. The relay holds nothing but the sockets
 * in the room and the last cursor each one reported, and those exist only while
 * the process does — a restart empties every room, which is the right outcome
 * for data that describes who is looking right now.
 *
 * The sockets are injected as a tiny interface so a test can drive rooms with
 * fakes instead of starting a web server.
 */
import {
  COLLAB_MAX_PEERS_PER_ROOM,
  assignColor,
  serializeServerMessage,
  type CollabPeerState,
  type CollabServerMessage,
} from "./protocol.js";

/** The only thing rooms need from a connection. */
export interface CollabSocket {
  send(data: string): void;
  close(): void;
}

export interface CollabPeer extends CollabPeerState {
  socket: CollabSocket;
  joinedAt: number;
}

export type CollabJoinResult =
  | { ok: true; peer: CollabPeer }
  | { ok: false; reason: "room_full" };

export interface CollabRoomsOptions {
  maxPeers?: number;
  newId?: () => string;
  random?: () => number;
  now?: () => number;
}

/** What the wire needs to describe a peer, without the socket. */
export function toPeerState(peer: CollabPeer): CollabPeerState {
  const state: CollabPeerState = { id: peer.id, name: peer.name, color: peer.color };
  if (peer.x !== undefined && peer.y !== undefined) {
    state.x = peer.x;
    state.y = peer.y;
  }
  return state;
}

const defaultNewId = (): string => {
  // Structural, not the DOM `Crypto` type: this module is compiled for the
  // server, where the DOM lib is not part of the program.
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `peer-${Math.random().toString(36).slice(2, 10)}`;
};

export class CollabRooms {
  private readonly rooms = new Map<string, Map<string, CollabPeer>>();
  private readonly maxPeers: number;
  private readonly newId: () => string;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(options: CollabRoomsOptions = {}) {
    this.maxPeers = options.maxPeers ?? COLLAB_MAX_PEERS_PER_ROOM;
    this.newId = options.newId ?? defaultNewId;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  /**
   * Seat a socket in a room. The id is always minted here so a client can never
   * claim another peer's identity, and the colour avoids the ones already in
   * use unless the visitor asked for a free one.
   */
  join(key: string, identity: { name: string; color?: string }, socket: CollabSocket): CollabJoinResult {
    const room = this.roomFor(key);
    if (room.size >= this.maxPeers) return { ok: false, reason: "room_full" };

    const used = new Set<string>();
    for (const existing of room.values()) used.add(existing.color);
    const color = identity.color && !used.has(identity.color) ? identity.color : assignColor(used, this.random);

    const peer: CollabPeer = {
      id: this.newId(),
      name: identity.name,
      color,
      socket,
      joinedAt: this.now(),
    };
    room.set(peer.id, peer);
    return { ok: true, peer };
  }

  leave(key: string, peerId: string): void {
    const room = this.rooms.get(key);
    if (!room) return;
    room.delete(peerId);
    // Empty rooms are dropped: a diagram nobody watches must not keep a key.
    if (room.size === 0) this.rooms.delete(key);
  }

  peers(key: string): CollabPeer[] {
    return [...(this.rooms.get(key)?.values() ?? [])];
  }

  peerCount(key: string): number {
    return this.rooms.get(key)?.size ?? 0;
  }

  totalPeers(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return total;
  }

  moveCursor(key: string, peerId: string, x: number, y: number): boolean {
    const peer = this.rooms.get(key)?.get(peerId);
    if (!peer) return false;
    peer.x = x;
    peer.y = y;
    return true;
  }

  /** Send to every peer in the room except the one that caused the message. */
  broadcast(key: string, exceptPeerId: string | null, message: CollabServerMessage): void {
    const room = this.rooms.get(key);
    if (!room) return;

    const payload = serializeServerMessage(message);
    for (const peer of room.values()) {
      if (peer.id === exceptPeerId) continue;
      try {
        peer.socket.send(payload);
      } catch {
        // One dead socket must not stop the relay for the rest of the room.
      }
    }
  }

  sendTo(key: string, peerId: string, message: CollabServerMessage): void {
    const peer = this.rooms.get(key)?.get(peerId);
    if (!peer) return;
    try {
      peer.socket.send(serializeServerMessage(message));
    } catch {
      // Ignored for the same reason as broadcast.
    }
  }

  private roomFor(key: string): Map<string, CollabPeer> {
    let room = this.rooms.get(key);
    if (!room) {
      room = new Map();
      this.rooms.set(key, room);
    }
    return room;
  }
}
