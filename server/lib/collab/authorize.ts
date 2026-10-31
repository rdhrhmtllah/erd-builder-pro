/**
 * Who may join a diagram's presence room.
 *
 * A room is not a document read — it carries no content — but it is still a
 * side channel: joining tells you the diagram exists, and the peers list would
 * expose a private diagram's visitors to anyone who guessed the id. So the
 * relay applies the same rule as the public endpoint that renders the diagram,
 * through the same function, and refuses everything else.
 */
import type { Request as ExpressRequest } from "express";
import { prisma } from "../prisma.js";
import { resolveViewerId } from "../public-viewer.js";
import { evaluatePublicDocAccess } from "../public-doc-gate.js";
import { COLLAB_ERROR_MESSAGES, type CollabErrorCode } from "./protocol.js";

export type CollabRoomAccess =
  | { ok: true; roomKey: string }
  | { ok: false; code: CollabErrorCode; detail: string };

/**
 * Postgres casts the `uid` column to uuid, so a malformed id would surface as a
 * driver error on a connection anyone can open. Reject it before the query.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A WebSocket upgrade has no cookie parser behind it; this is the whole job. */
export function parseCookieHeader(header?: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

export interface CollabRoomRequest {
  diagramUid?: string | null;
  /**
   * Session token. The browser sends its cookie on a same-origin socket, so
   * this is only for clients where cookies do not travel (the desktop shell
   * talks to a different port) — the WebSocket API cannot set headers, which is
   * why a token has to be able to arrive as a query parameter at all.
   */
  authToken?: string | null;
  /** The `share_token` of a protected link, when the visitor has one. */
  shareToken?: string | null;
  cookieHeader?: string | null;
}

export async function authorizeCollabRoom(request: CollabRoomRequest): Promise<CollabRoomAccess> {
  const uid = request.diagramUid?.trim();
  if (!uid || !UUID_PATTERN.test(uid)) {
    return { ok: false, code: "not_found", detail: "Diagram not found" };
  }
  if (!prisma) {
    return { ok: false, code: "unavailable", detail: COLLAB_ERROR_MESSAGES.unavailable };
  }

  const cookies = parseCookieHeader(request.cookieHeader);
  // Cookie first, query token only as a fallback — the same precedence the REST
  // middleware uses, so a stale query token cannot outvote a live session.
  const cookieToken = cookies.token;
  const bearerToken = cookieToken ? undefined : request.authToken ?? undefined;
  const viewerId = await resolveViewerId({
    headers: bearerToken ? { authorization: `Bearer ${bearerToken}` } : {},
    cookies,
  } as unknown as ExpressRequest);

  const diagram = await prisma.diagram.findUnique({
    where: { uid },
    select: {
      uid: true,
      isDeleted: true,
      isPublic: true,
      userId: true,
      expiryDate: true,
      shareToken: true,
      project: { select: { isDeleted: true } },
    },
  });
  if (!diagram?.uid) {
    return { ok: false, code: "not_found", detail: "Diagram not found" };
  }

  const access = evaluatePublicDocAccess(diagram, {
    viewerId,
    providedToken: request.shareToken ?? null,
    // The relay is also reached from the ordinary editor, where the owner is on
    // their own private diagram and should still see who else is there.
    ownerMaySeeUnpublished: true,
  });
  // `=== false` rather than `!access.ok`: this project compiles without
  // strictNullChecks, where a truthiness test does not narrow the union.
  if (access.ok === false) {
    return { ok: false, code: access.code, detail: access.error };
  }

  return { ok: true, roomKey: diagram.uid };
}
