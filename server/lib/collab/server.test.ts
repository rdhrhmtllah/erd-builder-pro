/**
 * The relay end to end: a real HTTP server, a real upgrade, real WebSocket
 * clients. Presence is entirely about frames arriving at the right socket and
 * never at the wrong one, and that is not something a unit test of `rooms` can
 * show.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { COLLAB_WS_PATH, attachCollabWebSocket, type CollabServerOptions } from "./server.js";
import { CollabRooms } from "./rooms.js";
import type { CollabRoomAccess, CollabRoomRequest } from "./authorize.js";

// The relay resolves a session through the real authorizer in other test files;
// here every check is injected, so keep the database client out of the run.
vi.mock("../prisma.js", () => ({ prisma: null }));

const UID = "7fa3d97b-b098-4bb7-bc23-eed52ef01661";

const servers: HttpServer[] = [];
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) {
    try {
      client.terminate();
    } catch {
      // A socket that never finished its handshake cannot be terminated.
    }
  }
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          // A refused upgrade leaves a connection the close callback would
          // otherwise wait on.
          server.closeAllConnections?.();
          server.close(() => resolve());
        }),
    ),
  );
});

interface Harness {
  port: number;
  rooms: CollabRooms;
  requests: CollabRoomRequest[];
}

async function harness(overrides: Partial<CollabServerOptions> = {}): Promise<Harness> {
  const rooms = new CollabRooms();
  const requests: CollabRoomRequest[] = [];
  const server = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  servers.push(server);

  attachCollabWebSocket(server, {
    rooms,
    authorize: async (request) => {
      requests.push(request);
      return { ok: true, roomKey: request.diagramUid ?? "unknown" };
    },
    heartbeatMs: 50,
    ...overrides,
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, rooms, requests };
}

interface TestClient {
  ws: WebSocket;
  messages: any[];
  open: () => Promise<void>;
  closeCode: () => Promise<number>;
  waitFor: (test: (message: any) => boolean, label?: string) => Promise<any>;
  send: (message: unknown) => void;
}

function client(port: number, query = `?diagram=${UID}`): TestClient {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${COLLAB_WS_PATH}${query}`);
  clients.push(ws);
  // A refused or torn-down socket must not surface as an unhandled error.
  ws.on("error", () => {});

  const messages: any[] = [];
  const waiters: Array<{ test: (message: any) => boolean; deliver: (message: any) => void }> = [];

  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString());
    messages.push(parsed);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].test(parsed)) {
        const [waiter] = waiters.splice(index, 1);
        waiter.deliver(parsed);
      }
    }
  });

  return {
    ws,
    messages,
    open: () =>
      new Promise<void>((resolve, reject) => {
        if (ws.readyState === WebSocket.OPEN) return resolve();
        ws.once("open", resolve);
        ws.once("error", reject);
      }),
    closeCode: () => new Promise<number>((resolve) => ws.once("close", (code) => resolve(code))),
    waitFor: (test, label = "message") =>
      new Promise((resolve, reject) => {
        const existing = messages.find(test);
        if (existing) return resolve(existing);
        const timer = setTimeout(
          () => reject(new Error(`timed out waiting for ${label}; received ${JSON.stringify(messages)}`)),
          3000,
        );
        waiters.push({
          test,
          deliver: (message) => {
            clearTimeout(timer);
            resolve(message);
          },
        });
      }),
    send: (message) => ws.send(JSON.stringify(message)),
  };
}

const join = async (port: number, name: string) => {
  const peer = client(port);
  await peer.open();
  peer.send({ t: "hello", name });
  const welcome = await peer.waitFor((message) => message.t === "welcome", "welcome");
  return { peer, welcome };
};

describe("collaboration relay", () => {
  it("greets a lone peer with its assigned identity and an empty room", async () => {
    const { port } = await harness();
    const { welcome } = await join(port, "Budi");

    expect(welcome).toMatchObject({ t: "welcome", name: "Budi", peers: [] });
    expect(welcome.id).toEqual(expect.any(String));
    expect(welcome.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps the visitor's chosen colour when no one else has it", async () => {
    const { port } = await harness();
    const peer = client(port);
    await peer.open();
    peer.send({ t: "hello", name: "Budi", color: "#123456" });
    expect(await peer.waitFor((message) => message.t === "welcome")).toMatchObject({ color: "#123456" });
  });

  it("announces a joiner to the room and lists the room to the joiner", async () => {
    const { port } = await harness();
    const first = await join(port, "Budi");
    const second = await join(port, "Rina");

    const announced = await first.peer.waitFor((message) => message.t === "peer-join");
    expect(announced.peer).toMatchObject({ name: "Rina" });
    expect(second.welcome.peers).toEqual([
      { id: first.welcome.id, name: "Budi", color: first.welcome.color },
    ]);
  });

  it("relays a cursor to everyone but its author", async () => {
    const { port } = await harness();
    const first = await join(port, "Budi");
    const second = await join(port, "Rina");
    await first.peer.waitFor((message) => message.t === "peer-join");

    first.peer.send({ t: "cursor", x: 120.4, y: -30.6 });

    expect(await second.peer.waitFor((message) => message.t === "cursor")).toEqual({
      t: "cursor",
      id: first.welcome.id,
      x: 120,
      y: -31,
    });
    expect(first.peer.messages.filter((message) => message.t === "cursor")).toEqual([]);
  });

  it("passes the last cursor of an existing peer to a later joiner", async () => {
    const { port } = await harness();
    const first = await join(port, "Budi");
    first.peer.send({ t: "cursor", x: 5, y: 6 });

    const second = await join(port, "Rina");
    expect(second.welcome.peers).toEqual([
      { id: first.welcome.id, name: "Budi", color: first.welcome.color, x: 5, y: 6 },
    ]);
  });

  it("tells the room when a peer leaves", async () => {
    const { port } = await harness();
    const first = await join(port, "Budi");
    const second = await join(port, "Rina");
    await first.peer.waitFor((message) => message.t === "peer-join");

    second.peer.ws.close();
    expect(await first.peer.waitFor((message) => message.t === "peer-leave")).toEqual({
      t: "peer-leave",
      id: second.welcome.id,
    });
  });

  it("forgets the peer once its socket is gone", async () => {
    const { port, rooms } = await harness();
    const { peer } = await join(port, "Budi");
    expect(rooms.peerCount(UID)).toBe(1);

    peer.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(rooms.peerCount(UID)).toBe(0);
  });

  it("refuses a visitor the diagram does not admit, and says why", async () => {
    const { port, rooms } = await harness({
      authorize: async () => ({ ok: false, code: "private", detail: "This diagram is not shared." }),
    });
    const peer = client(port);
    await peer.open();

    const error = await peer.waitFor((message) => message.t === "error");
    expect(error).toEqual({ t: "error", code: "private", message: "This diagram is not shared." });
    expect(await peer.closeCode()).toBe(1008);
    expect(rooms.totalPeers()).toBe(0);
  });

  it("relays nothing when the room lookup fails outright", async () => {
    const { port } = await harness({
      authorize: async () => {
        throw new Error("database is gone");
      },
    });
    const peer = client(port);
    await peer.open();

    expect(await peer.waitFor((message) => message.t === "error")).toMatchObject({ code: "unavailable" });
  });

  it("passes the room query, the share token and the cookie through to the check", async () => {
    const { port, requests } = await harness();
    const peer = client(port, `?diagram=${UID}&share_token=s3cret&token=bearer-1`);
    await peer.open();
    peer.send({ t: "hello", name: "Budi" });
    await peer.waitFor((message) => message.t === "welcome");

    expect(requests[0]).toEqual({
      diagramUid: UID,
      authToken: "bearer-1",
      shareToken: "s3cret",
      cookieHeader: null,
    });
  });

  it("drops a message that is not part of the protocol without closing the socket", async () => {
    const { port } = await harness();
    const peer = client(port);
    await peer.open();

    peer.send({ t: "exec", cmd: "rm -rf /" });
    expect(await peer.waitFor((message) => message.t === "error")).toMatchObject({ code: "invalid_message" });

    peer.send({ t: "hello", name: "Budi" });
    expect(await peer.waitFor((message) => message.t === "welcome")).toMatchObject({ name: "Budi" });
  });

  it("ignores a cursor that arrives before any identity", async () => {
    const { port, rooms } = await harness();
    const peer = client(port);
    await peer.open();

    peer.send({ t: "cursor", x: 1, y: 2 });
    peer.send({ t: "hello", name: "Budi" });
    await peer.waitFor((message) => message.t === "welcome");

    expect(rooms.totalPeers()).toBe(1);
    expect(peer.messages.filter((message) => message.t === "cursor")).toEqual([]);
  });

  it("does not let a second hello rename a seated peer", async () => {
    const { port } = await harness();
    const { peer, welcome } = await join(port, "Budi");

    peer.send({ t: "hello", name: "Someone Else" });
    peer.send({ t: "cursor", x: 1, y: 1 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(peer.messages.filter((message) => message.t === "welcome")).toHaveLength(1);
    expect(welcome.name).toBe("Budi");
  });

  it("refuses a peer once the room is full", async () => {
    const { port } = await harness({ rooms: new CollabRooms({ maxPeers: 1 }) });
    await join(port, "Budi");

    const extra = client(port);
    await extra.open();
    extra.send({ t: "hello", name: "Rina" });

    expect(await extra.waitFor((message) => message.t === "error")).toMatchObject({ code: "room_full" });
    expect(await extra.closeCode()).toBe(1008);
  });

  it("cuts off a connection that floods the relay", async () => {
    const { port } = await harness({ rate: { burst: 3, perSecond: 0 } });
    const peer = client(port);
    await peer.open();

    for (let index = 0; index < 6; index += 1) peer.send({ t: "cursor", x: index, y: index });

    expect(await peer.waitFor((message) => message.t === "error")).toMatchObject({ code: "rate_limited" });
    expect(await peer.closeCode()).toBe(1008);
  });

  it("ignores a binary frame and keeps serving the same socket", async () => {
    const { port } = await harness();
    const peer = client(port);
    await peer.open();

    peer.ws.send(Buffer.from([0x00, 0x01, 0x02]));
    peer.send({ t: "hello", name: "Budi" });

    expect(await peer.waitFor((message) => message.t === "welcome")).toMatchObject({ name: "Budi" });
    expect(peer.messages.filter((message) => message.t === "error")).toEqual([]);
  });

  it("leaves an upgrade on another path for whoever owns it", async () => {
    const { port } = await harness();

    // A stand-in for Vite's HMR socket: a second upgrade listener on the same
    // server. The relay must not touch a path that is not its own.
    const other = new WebSocketServer({ noServer: true });
    servers[0].on("upgrade", (request, socket, head) => {
      if (new URL(request.url ?? "/", "http://localhost").pathname !== "/api/something-else") return;
      other.handleUpgrade(request, socket, head, (ws) => other.emit("connection", ws, request));
    });

    const stranger = new WebSocket(`ws://127.0.0.1:${port}/api/something-else`);
    clients.push(stranger);
    await new Promise<void>((resolve, reject) => {
      stranger.once("open", resolve);
      stranger.once("error", reject);
    });
    expect(stranger.readyState).toBe(WebSocket.OPEN);

    // ...and the relay still answers on its own path.
    const { welcome } = await join(port, "Budi");
    expect(welcome.name).toBe("Budi");
    other.close();
  });
});
