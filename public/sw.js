// Bumped to v2: the old cache held an app shell pointing at bundles that later
// deploys deleted, which stranded the page on a spinner. Renaming the cache makes
// activate() drop it.
const CACHE_NAME = 'erd-builder-cache-v2';
const SHELL_URL = '/index.html';
const ASSETS_TO_CACHE = [
  '/favicon.png',
  '/manifest.webmanifest',
  '/icons/icon-180x180-any.png',
  '/icons/icon-192x192-any.png',
  '/icons/icon-192x192-maskable.png',
  '/icons/icon-512x512-any.png',
  '/icons/icon-512x512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS_TO_CACHE.map((asset) => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * The offline shell, refreshed on every successful navigation.
 *
 * The shell names hashed bundles, and every deploy deletes the previous ones, so
 * a shell that is never refreshed eventually points at files that 404 — the page
 * then loads nothing and spins forever. Keeping it current means the cached copy
 * is only ever one navigation behind.
 */
async function navigateWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (networkError) {
    const cached = await caches.match(SHELL_URL);
    // respondWith rejects anything that is not a Response, which surfaces as
    // "Failed to convert value to 'Response'" and kills the navigation outright.
    return cached || new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>'
      + '<body style="font:14px system-ui;padding:2rem">'
      + '<h1>You are offline</h1><p>Reconnect and reload to continue.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirstWithRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fromNetwork = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  const response = cached || (await fromNetwork);
  // Same guard as above: a failed fetch with nothing cached must still be a Response.
  return response || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;
  if (new URL(request.url).pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigateWithShellFallback(request));
    return;
  }

  event.respondWith(cacheFirstWithRevalidate(request));
});
