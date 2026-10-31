/**
 * The contract between the relay and the browser, pinned by construction.
 *
 * The wire format is described twice — once in `server/lib/collab/protocol.ts`
 * for the authority, once in `src/lib/collab/presence.ts` for the client — and a
 * rename on either side would otherwise only show up as a silent "nobody is
 * here" in production. This test builds real frames with the server module and
 * feeds them to the client parser, and vice versa.
 */
import { describe, expect, it } from "vitest";
import {
  COLLAB_MAX_NAME_LENGTH,
  parseClientMessage,
  serializeServerMessage,
  type CollabServerMessage,
} from "../../../../server/lib/collab/protocol.js";
import { normalizeGuestName, parseCollabServerMessage } from "../presence";

describe("server → client", () => {
  const frames: CollabServerMessage[] = [
    { t: "welcome", id: "peer-1", name: "Budi", color: "#3b82f6", peers: [] },
    {
      t: "welcome",
      id: "peer-1",
      name: "Budi",
      color: "#3b82f6",
      peers: [{ id: "peer-2", name: "Rina", color: "#22c55e", x: 12, y: -8 }],
    },
    { t: "peer-join", peer: { id: "peer-2", name: "Rina", color: "#22c55e" } },
    { t: "peer-join", peer: { id: "peer-2", name: "Rina", color: "#22c55e", x: 1, y: 2 } },
    { t: "peer-leave", id: "peer-2" },
    { t: "cursor", id: "peer-2", x: 120, y: -31 },
    { t: "error", code: "room_full", message: "" },
    { t: "error", code: "expired", message: "This share link has expired." },
  ];

  it.each(frames)("the client understands $t", (frame) => {
    expect(parseCollabServerMessage(serializeServerMessage(frame))).toBeTruthy();
  });

  it("keeps the values the relay sent", () => {
    const frame: CollabServerMessage = { t: "cursor", id: "peer-2", x: 120, y: -31 };
    expect(parseCollabServerMessage(serializeServerMessage(frame))).toEqual(frame);
  });
});

describe("client → server", () => {
  it("accepts the hello the canvas actually sends", () => {
    expect(parseClientMessage(JSON.stringify({ t: "hello", name: "Budi" }))).toEqual({
      t: "hello",
      name: "Budi",
      color: undefined,
    });
  });

  it("accepts a hello that remembers a colour from a previous connection", () => {
    expect(parseClientMessage(JSON.stringify({ t: "hello", name: "Budi", color: "#3b82f6" }))).toEqual({
      t: "hello",
      name: "Budi",
      color: "#3b82f6",
    });
  });

  it("accepts the whole-number cursor the hook sends", () => {
    expect(parseClientMessage(JSON.stringify({ t: "cursor", x: 42, y: -7 }))).toEqual({ t: "cursor", x: 42, y: -7 });
  });

  it("accepts the keepalive", () => {
    expect(parseClientMessage(JSON.stringify({ t: "ping" }))).toEqual({ t: "ping" });
  });
});

describe("shared rules", () => {
  it("caps names at the same length on both sides", () => {
    expect(normalizeGuestName("a".repeat(200))).toHaveLength(COLLAB_MAX_NAME_LENGTH);
  });

  it("sends a name the relay accepts unchanged", () => {
    const name = normalizeGuestName("  Budi   Santoso\n");
    const parsed = parseClientMessage(JSON.stringify({ t: "hello", name }));
    expect(parsed).toEqual({ t: "hello", name: "Budi Santoso", color: undefined });
  });

  it("keeps a name with the longest allowed emoji run intact", () => {
    const name = normalizeGuestName("🙂".repeat(40));
    expect(parseClientMessage(JSON.stringify({ t: "hello", name }))).toMatchObject({ t: "hello", name });
  });

  it("drops an absurd coordinate on both sides instead of relaying it", () => {
    expect(parseClientMessage(JSON.stringify({ t: "cursor", x: 1e9, y: 0 }))).toBeNull();
    expect(parseCollabServerMessage(JSON.stringify({ t: "cursor", id: "p", x: 1e9, y: 0 }))).toBeNull();
  });
});
