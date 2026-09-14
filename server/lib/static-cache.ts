/**
 * How long a built file may sit in a browser or CDN cache.
 *
 * Vite fingerprints everything under /assets, and each build empties that folder,
 * so those files are safe to keep forever while the names that remain are always
 * current. Everything served under a stable name must revalidate instead. The
 * service worker matters most: browsers bypass the HTTP cache for the worker
 * script itself, but a CDN in front does not, and a stale worker keeps serving an
 * app shell naming bundles the next deploy has already deleted.
 */
export function staticCacheControl(urlPath: string): string {
  if (/^\/assets\//.test(urlPath)) return "public, max-age=31536000, immutable";
  if (/^\/sw\.js$/.test(urlPath)) return "no-cache";
  if (/^\/(manifest\.webmanifest|index\.html)$/.test(urlPath)) return "no-cache";
  return "public, max-age=3600";
}
