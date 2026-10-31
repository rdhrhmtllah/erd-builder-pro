import { describe, expect, it } from "vitest";
import { evaluatePublicDocAccess } from "./public-doc-gate.js";

const publicDoc = (over: Record<string, unknown> = {}) => ({
  isDeleted: false,
  isPublic: true,
  userId: "owner-1",
  expiryDate: null,
  shareToken: null,
  project: { isDeleted: false },
  ...over,
});

describe("evaluatePublicDocAccess", () => {
  it("lets an anonymous visitor read a plain public document", () => {
    expect(evaluatePublicDocAccess(publicDoc())).toEqual({ ok: true, isOwner: false });
  });

  it.each([
    ["a soft-deleted document", { isDeleted: true }, 404, "not_found"],
    ["a document in a deleted project", { project: { isDeleted: true } }, 404, "not_found"],
    ["a private document", { isPublic: false }, 403, "private"],
  ])("refuses %s", (_label, over, status, code) => {
    const result = evaluatePublicDocAccess(publicDoc(over));
    expect(result).toMatchObject({ ok: false, status, code });
  });

  it("refuses a link past its expiry date", () => {
    const result = evaluatePublicDocAccess(publicDoc({ expiryDate: "2026-01-01T00:00:00.000Z" }), {
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(result).toMatchObject({ ok: false, status: 403, code: "expired" });
  });

  it("refuses a link whose share token does not match", () => {
    const result = evaluatePublicDocAccess(publicDoc({ shareToken: "s3cret" }), { providedToken: "wrong" });
    expect(result).toMatchObject({ ok: false, status: 401, code: "token_required", requiresToken: true });
  });

  it("accepts a matching share token", () => {
    expect(evaluatePublicDocAccess(publicDoc({ shareToken: "s3cret" }), { providedToken: "s3cret" })).toEqual({
      ok: true,
      isOwner: false,
    });
  });

  it("exempts the owner from expiry and token checks", () => {
    const doc = publicDoc({ expiryDate: "2020-01-01T00:00:00.000Z", shareToken: "s3cret" });
    expect(evaluatePublicDocAccess(doc, { viewerId: "owner-1" })).toEqual({ ok: true, isOwner: true });
  });

  it("keeps a private document private for the public route, even for its owner", () => {
    // `/public/:uid` only ever serves published documents: the owner reads their
    // own unpublished diagram through the authenticated route instead.
    expect(evaluatePublicDocAccess(publicDoc({ isPublic: false }), { viewerId: "owner-1" })).toMatchObject({
      ok: false,
      code: "private",
    });
  });

  it("admits the owner of an unpublished document only when the caller asks for it", () => {
    const doc = publicDoc({ isPublic: false });
    expect(
      evaluatePublicDocAccess(doc, { viewerId: "owner-1", ownerMaySeeUnpublished: true }),
    ).toEqual({ ok: true, isOwner: true });
    expect(
      evaluatePublicDocAccess(doc, { viewerId: "someone-else", ownerMaySeeUnpublished: true }),
    ).toMatchObject({ ok: false, code: "private" });
    expect(
      evaluatePublicDocAccess(doc, { ownerMaySeeUnpublished: true }),
    ).toMatchObject({ ok: false, code: "private" });
  });

  it("does not mistake another logged-in user for the owner", () => {
    const doc = publicDoc({ shareToken: "s3cret" });
    expect(evaluatePublicDocAccess(doc, { viewerId: "someone-else" })).toMatchObject({ ok: false, code: "token_required" });
  });

  it("keeps an ownerless document readable", () => {
    expect(evaluatePublicDocAccess(publicDoc({ userId: null }))).toEqual({ ok: true, isOwner: false });
    expect(evaluatePublicDocAccess(publicDoc({ userId: null }), { viewerId: "someone-else" })).toEqual({
      ok: true,
      isOwner: false,
    });
  });
});
