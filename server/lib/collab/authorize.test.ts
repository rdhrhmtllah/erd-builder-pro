import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  resolveViewerId: vi.fn(),
  prisma: { value: {} as any },
}));

vi.mock("../prisma.js", () => ({
  get prisma() {
    return mocks.prisma.value;
  },
}));
vi.mock("../public-viewer.js", () => ({ resolveViewerId: mocks.resolveViewerId }));

const { authorizeCollabRoom, parseCookieHeader } = await import("./authorize.js");

const UID = "7fa3d97b-b098-4bb7-bc23-eed52ef01661";

const diagramRow = (over: Record<string, unknown> = {}) => ({
  uid: UID,
  isDeleted: false,
  isPublic: true,
  userId: "owner-1",
  expiryDate: null,
  shareToken: null,
  project: { isDeleted: false },
  ...over,
});

describe("parseCookieHeader", () => {
  it("reads a lone cookie", () => {
    expect(parseCookieHeader("token=abc")).toEqual({ token: "abc" });
  });

  it("reads several, tolerating spaces and encoded values", () => {
    expect(parseCookieHeader("a=1; token=b%20c ; d=")).toEqual({ a: "1", token: "b c", d: "" });
  });

  it("returns nothing for a missing or unusable header", () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader("garbage; =nope")).toEqual({});
  });
});

describe("authorizeCollabRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.value = { diagram: { findUnique: mocks.findUnique } };
    mocks.resolveViewerId.mockResolvedValue(null);
  });

  it("refuses a malformed id without touching the database", async () => {
    expect(await authorizeCollabRoom({ diagramUid: "../../etc/passwd" })).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("refuses when no id was given", async () => {
    expect(await authorizeCollabRoom({})).toMatchObject({ ok: false, code: "not_found" });
  });

  it("refuses an unknown diagram", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await authorizeCollabRoom({ diagramUid: UID })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("lets an anonymous visitor join a public diagram", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow());
    expect(await authorizeCollabRoom({ diagramUid: UID })).toEqual({ ok: true, roomKey: UID });
  });

  it("refuses a private diagram for a visitor who is not the owner", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow({ isPublic: false }));
    expect(await authorizeCollabRoom({ diagramUid: UID })).toMatchObject({ ok: false, code: "private" });
  });

  it("lets the owner in on their own private diagram", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow({ isPublic: false }));
    mocks.resolveViewerId.mockResolvedValue("owner-1");
    expect(await authorizeCollabRoom({ diagramUid: UID })).toEqual({ ok: true, roomKey: UID });
  });

  it("refuses an expired link and remembers the reason", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow({ expiryDate: new Date("2020-01-01T00:00:00Z") }));
    expect(await authorizeCollabRoom({ diagramUid: UID })).toMatchObject({ ok: false, code: "expired" });
  });

  it("requires the share token of a protected link", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow({ shareToken: "s3cret" }));
    expect(await authorizeCollabRoom({ diagramUid: UID })).toMatchObject({ ok: false, code: "token_required" });
    expect(await authorizeCollabRoom({ diagramUid: UID, shareToken: "s3cret" })).toEqual({ ok: true, roomKey: UID });
  });

  it("refuses a diagram that was deleted or whose project was", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow({ isDeleted: true }));
    expect(await authorizeCollabRoom({ diagramUid: UID })).toMatchObject({ ok: false, code: "not_found" });

    mocks.findUnique.mockResolvedValue(diagramRow({ project: { isDeleted: true } }));
    expect(await authorizeCollabRoom({ diagramUid: UID })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("counts the session cookie as the viewer", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow({ isPublic: false }));
    mocks.resolveViewerId.mockResolvedValue("owner-1");

    await authorizeCollabRoom({ diagramUid: UID, cookieHeader: "token=session-abc" });

    expect(mocks.resolveViewerId).toHaveBeenCalledWith(expect.objectContaining({ cookies: { token: "session-abc" } }));
    // The cookie is the session; the query token must not shadow it.
    expect(mocks.resolveViewerId.mock.calls[0][0].headers.authorization).toBeUndefined();
  });

  it("falls back to a query token when no cookie travels", async () => {
    mocks.findUnique.mockResolvedValue(diagramRow({ isPublic: false }));
    mocks.resolveViewerId.mockResolvedValue("owner-1");

    expect(await authorizeCollabRoom({ diagramUid: UID, authToken: "bearer-1" })).toEqual({ ok: true, roomKey: UID });
    expect(mocks.resolveViewerId.mock.calls[0][0].headers.authorization).toBe("Bearer bearer-1");
  });

  it("reports presence as unavailable when there is no database client", async () => {
    mocks.prisma.value = null;
    expect(await authorizeCollabRoom({ diagramUid: UID })).toMatchObject({ ok: false, code: "unavailable" });
  });
});
