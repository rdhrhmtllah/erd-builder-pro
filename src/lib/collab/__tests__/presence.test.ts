import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  afterDisconnect,
  collabSocketUrl,
  emptyPresence,
  hasSkippedPresence,
  nextPresenceState,
  normalizeGuestName,
  parseCollabServerMessage,
  readGuestName,
  readShareToken,
  rememberGuestName,
  rememberSkippedPresence,
  type PresenceSnapshot,
} from "../presence";

const UID = "7fa3d97b-b098-4bb7-bc23-eed52ef01661";

describe("collabSocketUrl", () => {
  it("stays on the page's origin for the same-origin web build", () => {
    expect(
      collabSocketUrl({ uid: UID, apiBaseUrl: "", pageOrigin: "http://localhost:5173" }),
    ).toBe(`ws://localhost:5173/api/collab?diagram=${UID}`);
  });

  it("upgrades to wss behind https", () => {
    expect(
      collabSocketUrl({ uid: UID, apiBaseUrl: "", pageOrigin: "https://server-diagram.ajt.my.id" }),
    ).toBe(`wss://server-diagram.ajt.my.id/api/collab?diagram=${UID}`);
  });

  it("reaches a different port in the desktop shell, where no cookie travels", () => {
    const url = collabSocketUrl({ uid: UID, apiBaseUrl: "http://localhost:3099", authToken: "tok" });
    expect(url).toBe(`ws://localhost:3099/api/collab?diagram=${UID}&token=tok`);
  });

  it("carries the share token of a protected link", () => {
    const url = collabSocketUrl({ uid: UID, apiBaseUrl: "", pageOrigin: "https://example.com", shareToken: "s3cret" });
    expect(url).toBe(`wss://example.com/api/collab?diagram=${UID}&share_token=s3cret`);
  });

  it("encodes the diagram id", () => {
    expect(collabSocketUrl({ uid: "a/b", apiBaseUrl: "", pageOrigin: "https://example.com" })).toBe(
      "wss://example.com/api/collab?diagram=a%2Fb",
    );
  });

  it("gives up when there is nothing to connect to", () => {
    expect(collabSocketUrl({ uid: "", apiBaseUrl: "", pageOrigin: "https://example.com" })).toBeNull();
    expect(collabSocketUrl({ uid: UID, apiBaseUrl: "" })).toBeNull();
    expect(collabSocketUrl({ uid: UID, apiBaseUrl: "::not a url" })).toBeNull();
  });
});

describe("normalizeGuestName", () => {
  it("collapses whitespace and strips what would break a badge", () => {
    expect(normalizeGuestName("  Rina\n\tSusanti ")).toBe("Rina Susanti");
  });

  it("caps at 32 code points without splitting an emoji", () => {
    const capped = normalizeGuestName("🙂".repeat(40));
    expect(Array.from(capped)).toHaveLength(32);
    expect(capped).not.toContain("\ufffd");
  });

  it("gives nothing back for input that is not a usable name", () => {
    expect(normalizeGuestName("   ")).toBe("");
    expect(normalizeGuestName(undefined)).toBe("");
  });
});

describe("parseCollabServerMessage", () => {
  it("reads a welcome", () => {
    const raw = JSON.stringify({
      t: "welcome",
      id: "peer-1",
      name: "Budi",
      color: "#3b82f6",
      peers: [{ id: "peer-2", name: "Rina", color: "#22c55e", x: 5, y: 6 }],
    });
    expect(parseCollabServerMessage(raw)).toEqual({
      t: "welcome",
      id: "peer-1",
      name: "Budi",
      color: "#3b82f6",
      peers: [{ id: "peer-2", name: "Rina", color: "#22c55e", x: 5, y: 6 }],
    });
  });

  it("drops a peer with no id and keeps the rest of the welcome", () => {
    const parsed = parseCollabServerMessage(
      JSON.stringify({ t: "welcome", id: "peer-1", name: "Budi", color: "#3b82f6", peers: [{ name: "ghost" }] }),
    );
    expect(parsed).toMatchObject({ t: "welcome", peers: [] });
  });

  it("draws a name that only looks like markup, and replaces an unusable colour", () => {
    // The name is rendered as text, so React escapes it; the colour has to be
    // usable as a CSS value, so anything that is not #rrggbb is dropped.
    const parsed = parseCollabServerMessage(
      JSON.stringify({ t: "peer-join", peer: { id: "p", name: "<img src=x onerror=alert(1)>", color: "red" } }),
    );
    expect(parsed).toMatchObject({ t: "peer-join", peer: { name: "<img src=x onerror=alert(1)>", color: "#6b7280" } });
  });

  it("reads the cursor and the error frames", () => {
    expect(parseCollabServerMessage('{"t":"cursor","id":"p","x":1.6,"y":-2.4}')).toEqual({
      t: "cursor",
      id: "p",
      x: 2,
      y: -2,
    });
    expect(parseCollabServerMessage('{"t":"error","code":"expired","message":"This share link has expired."}')).toEqual({
      t: "error",
      code: "expired",
      message: "This share link has expired.",
    });
  });

  it("ignores anything that is not a frame it knows", () => {
    expect(parseCollabServerMessage("not json")).toBeNull();
    expect(parseCollabServerMessage('{"t":"welcome"}')).toBeNull();
    expect(parseCollabServerMessage('{"t":"cursor","id":"p","x":"1","y":2}')).toBeNull();
    expect(parseCollabServerMessage('{"t":"exec"}')).toBeNull();
    expect(parseCollabServerMessage(undefined)).toBeNull();
  });
});

describe("nextPresenceState", () => {
  const open = (over: Partial<PresenceSnapshot> = {}): PresenceSnapshot => ({
    ...emptyPresence(),
    status: "open",
    selfId: "me",
    selfColor: "#3b82f6",
    ...over,
  });

  it("opens on welcome and lists the room", () => {
    const state = nextPresenceState(emptyPresence(), {
      t: "welcome",
      id: "me",
      name: "Budi",
      color: "#3b82f6",
      peers: [{ id: "other", name: "Rina", color: "#22c55e" }],
    });
    expect(state).toMatchObject({
      status: "open",
      selfId: "me",
      selfColor: "#3b82f6",
      peers: [{ id: "other", name: "Rina", x: null, y: null }],
    });
  });

  it("adds a joiner once", () => {
    const peer = { id: "other", name: "Rina", color: "#22c55e" };
    const once = nextPresenceState(open(), { t: "peer-join", peer });
    const twice = nextPresenceState(once, { t: "peer-join", peer });
    expect(once.peers).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("moves a peer's cursor and drops one from a peer it never met", () => {
    const withPeer = nextPresenceState(open(), { t: "peer-join", peer: { id: "other", name: "Rina", color: "#22c55e" } });
    expect(nextPresenceState(withPeer, { t: "cursor", id: "other", x: 10, y: 20 }).peers[0]).toMatchObject({ x: 10, y: 20 });
    expect(nextPresenceState(withPeer, { t: "cursor", id: "stranger", x: 10, y: 20 })).toBe(withPeer);
  });

  it("removes a peer who left", () => {
    const withPeer = nextPresenceState(open(), { t: "peer-join", peer: { id: "other", name: "Rina", color: "#22c55e" } });
    expect(nextPresenceState(withPeer, { t: "peer-leave", id: "other" }).peers).toEqual([]);
  });

  it("marks a refusal as final and drops the room", () => {
    const withPeer = nextPresenceState(open(), { t: "peer-join", peer: { id: "other", name: "Rina", color: "#22c55e" } });
    expect(nextPresenceState(withPeer, { t: "error", code: "room_full", message: "Too many viewers." })).toEqual({
      status: "denied",
      error: "Too many viewers.",
      selfId: null,
      selfColor: null,
      peers: [],
    });
  });

  it("treats a recoverable complaint as an error and keeps the room", () => {
    const withPeer = nextPresenceState(open(), { t: "peer-join", peer: { id: "other", name: "Rina", color: "#22c55e" } });
    expect(
      nextPresenceState(withPeer, { t: "error", code: "invalid_message", message: "Unsupported." }),
    ).toMatchObject({
      status: "error",
      error: "Unsupported.",
      selfId: "me",
      peers: [{ id: "other", name: "Rina" }],
    });
  });
});

describe("afterDisconnect", () => {
  it("closes an open room and forgets its peers", () => {
    expect(
      afterDisconnect({
        ...emptyPresence(),
        status: "open",
        selfId: "me",
        peers: [{ id: "other", name: "Rina", color: "#22c55e", x: 1, y: 2 }],
      }),
    ).toMatchObject({ status: "closed", selfId: null, peers: [] });
  });

  it("leaves a refused visitor refused", () => {
    const denied = { ...emptyPresence(), status: "denied" as const, error: "Private." };
    expect(afterDisconnect(denied)).toBe(denied);
  });
});

describe("guest name storage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  });

  it("asks again only in a new tab: the name survives a reload", () => {
    expect(readGuestName(UID)).toBeNull();
    rememberGuestName(UID, "  Budi  ");
    expect(readGuestName(UID)).toBe("Budi");
  });

  it("keeps names apart per diagram", () => {
    rememberGuestName(UID, "Budi");
    expect(readGuestName("another-uid")).toBeNull();
  });

  it("remembers a skip and the share token", () => {
    expect(hasSkippedPresence(UID)).toBe(false);
    rememberSkippedPresence(UID);
    expect(hasSkippedPresence(UID)).toBe(true);

    store.set(`share_token_${UID}`, "s3cret");
    expect(readShareToken(UID)).toBe("s3cret");
    expect(readShareToken(null)).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(readGuestName(UID)).toBeNull();
    expect(() => rememberGuestName(UID, "Budi")).not.toThrow();
    expect(hasSkippedPresence(UID)).toBe(false);
  });
});
