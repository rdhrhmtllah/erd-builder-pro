import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  useLocalAuth: vi.fn(() => true),
  supabase: { value: null as any },
}));

vi.mock("./desktop-auth.js", () => ({ getSession: mocks.getSession }));
vi.mock("./config.js", () => ({
  useLocalAuth: mocks.useLocalAuth,
  get supabase() { return mocks.supabase.value; },
}));

const { resolveViewerId } = await import("./public-viewer.js");

const req = (over: any = {}) => ({ headers: {}, cookies: {}, query: {}, ...over }) as any;

describe("resolveViewerId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useLocalAuth.mockReturnValue(true);
    mocks.supabase.value = null;
  });

  it("returns null when the visitor carries no token at all", async () => {
    expect(await resolveViewerId(req())).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("identifies the owner from a local session cookie", async () => {
    mocks.getSession.mockResolvedValue({ userId: "owner-1" });
    expect(await resolveViewerId(req({ cookies: { token: "abc" } }))).toBe("owner-1");
  });

  it("accepts a bearer token as well as the cookie", async () => {
    mocks.getSession.mockResolvedValue({ userId: "owner-1" });
    expect(await resolveViewerId(req({ headers: { authorization: "Bearer abc" } }))).toBe("owner-1");
  });

  it("does not throw when Supabase is absent and the session is unknown", async () => {
    // The bug this guards: a self-hosted deployment has supabase === null, and
    // reaching for supabase.auth turned every public link into a 500.
    mocks.getSession.mockResolvedValue(null);
    expect(await resolveViewerId(req({ cookies: { token: "stale" } }))).toBeNull();
  });

  it("treats a failing session lookup as an anonymous visitor", async () => {
    // A public document must stay readable even if the session store is down.
    mocks.getSession.mockRejectedValue(new Error("database gone"));
    expect(await resolveViewerId(req({ cookies: { token: "abc" } }))).toBeNull();
  });

  it("never touches Supabase while local auth is in charge", async () => {
    const auth = { getUser: vi.fn() };
    mocks.supabase.value = { auth };
    mocks.getSession.mockResolvedValue({ userId: "owner-1" });

    await resolveViewerId(req({ cookies: { token: "abc" } }));
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("falls back to Supabase only when it is configured and local auth is off", async () => {
    mocks.useLocalAuth.mockReturnValue(false);
    mocks.supabase.value = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "sb-1" } } }) } };

    expect(await resolveViewerId(req({ cookies: { token: "abc" } }))).toBe("sb-1");
  });

  it("stays anonymous when Supabase rejects the token", async () => {
    mocks.useLocalAuth.mockReturnValue(false);
    mocks.supabase.value = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } };

    expect(await resolveViewerId(req({ cookies: { token: "bad" } }))).toBeNull();
  });
});
