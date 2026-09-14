import { Request as ExpressRequest } from "express";
import { supabase, useLocalAuth } from "./config.js";
import { getSession } from "./desktop-auth.js";

/** Token from an explicit header first, then the session cookie. */
function viewerToken(req: ExpressRequest): string | undefined {
  const header = req.headers.authorization as string | undefined;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return (req.cookies?.token as string | undefined) || undefined;
}

/**
 * Who is looking at a public document, if anyone.
 *
 * Public endpoints use this only to let the owner past the expiry and token
 * checks on their own link, so an unidentified visitor is an ordinary outcome,
 * never an error. Mirrors the order the authenticate middleware uses: a local
 * session first, Supabase only when it is configured and local auth is off.
 * Reaching for Supabase unconditionally is what turned every public link on a
 * self-hosted deployment into a 500, since `supabase` is null there.
 */
export async function resolveViewerId(req: ExpressRequest): Promise<string | null> {
  const token = viewerToken(req);
  if (!token) return null;

  try {
    if (useLocalAuth()) {
      const session = await getSession(token);
      return session?.userId ?? null;
    }

    if (supabase) {
      const { data } = await supabase.auth.getUser(token);
      return data?.user?.id ?? null;
    }
  } catch {
    // A document the owner made public must stay readable even when the
    // session store is unreachable; the visitor is simply anonymous.
  }

  return null;
}
