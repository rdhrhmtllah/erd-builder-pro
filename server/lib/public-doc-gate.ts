/**
 * The one decision that makes a public document readable.
 *
 * Every `/public/:uid` route inlined the same four checks (deleted, private,
 * expired, wrong share token). The collaboration relay has to make exactly the
 * same decision — a link that renders must also be joinable, and a link that
 * was revoked must not leak presence — so the rule lives here instead of being
 * copied a second time and drifting from the first.
 */

/** Fields the gate reads. Prisma models carry more; only these matter. */
export interface PublicDocGateInput {
  isDeleted?: boolean | null;
  isPublic?: boolean | null;
  userId?: string | null;
  expiryDate?: Date | string | null;
  shareToken?: string | null;
  project?: { isDeleted?: boolean | null } | null;
}

export type PublicDocGateCode = "not_found" | "private" | "expired" | "token_required";

/**
 * A refusal is a union member, not a bare flag, so a caller must deal with the
 * reason. Note the comparison at call sites is `result.ok === false` rather than
 * `!result.ok`: this project compiles without strictNullChecks, and narrowing a
 * discriminated union on a boolean literal needs it.
 */
export type PublicDocGateResult =
  | { ok: true; isOwner: boolean }
  | { ok: false; status: 401 | 403 | 404; code: PublicDocGateCode; error: string; requiresToken?: boolean };

/**
 * `viewerId` lets the owner keep their own link past its expiry and without its
 * token; an unidentified visitor never gets that exemption.
 *
 * A missing document is NOT this function's job — callers look the document up
 * first and keep their own "not found" wording for their document type.
 *
 * `ownerMaySeeUnpublished` exists because two callers ask slightly different
 * questions. The public HTTP route only ever serves published documents, so an
 * owner opening `/public/:uid` on their own unpublished diagram is correctly
 * turned away. The collaboration relay is reached from the ordinary editor too,
 * where the owner is looking at their own private diagram and must still see
 * the people editing it. Everything else is identical.
 */
export function evaluatePublicDocAccess(
  doc: PublicDocGateInput,
  options: {
    viewerId?: string | null;
    providedToken?: string | null;
    now?: Date;
    ownerMaySeeUnpublished?: boolean;
  } = {},
): PublicDocGateResult {
  if (doc.project?.isDeleted) {
    return { ok: false, status: 404, code: "not_found", error: "Document not found (associated project deleted)" };
  }
  if (doc.isDeleted) {
    return { ok: false, status: 404, code: "not_found", error: "Document not found" };
  }

  const viewerId = options.viewerId ?? null;
  const isOwner = viewerId !== null && viewerId === (doc.userId ?? null);

  if (!doc.isPublic) {
    if (isOwner && options.ownerMaySeeUnpublished) return { ok: true, isOwner: true };
    return { ok: false, status: 403, code: "private", error: "This document is private" };
  }

  if (isOwner) return { ok: true, isOwner: true };

  const now = options.now ?? new Date();
  if (doc.expiryDate && new Date(doc.expiryDate) < now) {
    return { ok: false, status: 403, code: "expired", error: "This share link has expired" };
  }

  const providedToken = options.providedToken ?? "";
  if (doc.shareToken && doc.shareToken !== providedToken) {
    return { ok: false, status: 401, code: "token_required", error: "Invalid access token", requiresToken: true };
  }

  return { ok: true, isOwner: false };
}
