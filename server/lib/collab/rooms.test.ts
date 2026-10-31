import { describe, expect, it } from "vitest";
import { CollabRooms, toPeerState, type CollabSocket } from "./rooms.js";

function fakeSocket(failOnSend = false) {
  const sent: string[] = [];
  return {
    sent,
    socket: {
      send: (data: string) => {
        if (failOnSend) throw new Error("socket gone");
        sent.push(data);
      },
      close: () => {},
    } satisfies CollabSocket,
  };
}

const ids = () => {
  let n = 0;
  return () => `peer-${++n}`;
};

describe("CollabRooms", () => {
  it("seats peers with a server-minted id and a distinct colour", () => {
    const rooms = new CollabRooms({ newId: ids(), random: () => 0 });
    const a = rooms.join("d1", { name: "Budi" }, fakeSocket().socket);
    const b = rooms.join("d1", { name: "Rina" }, fakeSocket().socket);

    expect(a).toMatchObject({ ok: true, peer: { id: "peer-1", name: "Budi" } });
    expect(b.ok && b.peer.id).toBe("peer-2");
    expect(a.ok && b.ok && a.peer.color).not.toBe(b.ok ? b.peer.color : "");
  });

  it("honours a requested colour only while it is free", () => {
    const rooms = new CollabRooms({ newId: ids(), random: () => 0 });
    const first = rooms.join("d1", { name: "Budi", color: "#123456" }, fakeSocket().socket);
    const second = rooms.join("d1", { name: "Rina", color: "#123456" }, fakeSocket().socket);

    expect(first.ok && first.peer.color).toBe("#123456");
    expect(second.ok && second.peer.color).not.toBe("#123456");
  });

  it("refuses a peer once the room is full", () => {
    const rooms = new CollabRooms({ newId: ids(), maxPeers: 1 });
    rooms.join("d1", { name: "Budi" }, fakeSocket().socket);
    expect(rooms.join("d1", { name: "Rina" }, fakeSocket().socket)).toEqual({ ok: false, reason: "room_full" });
  });

  it("keeps rooms independent", () => {
    const rooms = new CollabRooms({ newId: ids() });
    rooms.join("d1", { name: "Budi" }, fakeSocket().socket);
    rooms.join("d2", { name: "Rina" }, fakeSocket().socket);

    expect(rooms.peerCount("d1")).toBe(1);
    expect(rooms.peerCount("d2")).toBe(1);
    expect(rooms.totalPeers()).toBe(2);
  });

  it("relays a cursor to everyone but its author", () => {
    const rooms = new CollabRooms({ newId: ids() });
    const author = fakeSocket();
    const other = fakeSocket();
    const a = rooms.join("d1", { name: "Budi" }, author.socket);
    rooms.join("d1", { name: "Rina" }, other.socket);
    if (!a.ok) throw new Error("unreachable");

    rooms.moveCursor("d1", a.peer.id, 12, 34);
    rooms.broadcast("d1", a.peer.id, { t: "cursor", id: a.peer.id, x: 12, y: 34 });

    expect(author.sent).toEqual([]);
    expect(other.sent.map((raw) => JSON.parse(raw))).toEqual([{ t: "cursor", id: "peer-1", x: 12, y: 34 }]);
  });

  it("never remembers a cursor for a peer that does not exist", () => {
    const rooms = new CollabRooms();
    expect(rooms.moveCursor("d1", "ghost", 1, 2)).toBe(false);
  });

  it("reports the last cursor in a peer's state, and omits it before the first move", () => {
    const rooms = new CollabRooms({ newId: ids() });
    const a = rooms.join("d1", { name: "Budi" }, fakeSocket().socket);
    if (!a.ok) throw new Error("unreachable");

    expect(toPeerState(a.peer)).toEqual({ id: "peer-1", name: "Budi", color: a.peer.color });
    rooms.moveCursor("d1", "peer-1", 3, 4);
    expect(toPeerState(rooms.peers("d1")[0])).toMatchObject({ x: 3, y: 4 });
  });

  it("drops an empty room instead of leaking its key", () => {
    const rooms = new CollabRooms({ newId: ids() });
    const a = rooms.join("d1", { name: "Budi" }, fakeSocket().socket);
    if (!a.ok) throw new Error("unreachable");

    rooms.leave("d1", a.peer.id);
    expect(rooms.peerCount("d1")).toBe(0);
    expect(rooms.peers("d1")).toEqual([]);
  });

  it("survives a socket that throws instead of dropping the rest of the room", () => {
    const rooms = new CollabRooms({ newId: ids() });
    const dead = fakeSocket(true);
    const alive = fakeSocket();
    rooms.join("d1", { name: "Budi" }, dead.socket);
    rooms.join("d1", { name: "Rina" }, alive.socket);

    expect(() => rooms.broadcast("d1", null, { t: "peer-leave", id: "x" })).not.toThrow();
    expect(alive.sent).toHaveLength(1);
  });

  it("broadcasts to nobody when the room is gone", () => {
    const rooms = new CollabRooms();
    expect(() => rooms.broadcast("missing", null, { t: "peer-leave", id: "x" })).not.toThrow();
  });
});
