/**
 * Aegis Vault service worker.
 *
 * Two responsibilities, deliberately kept minimal:
 *
 *   1. Make the app installable and usable offline. The shell (HTML, CSS, JS,
 *      icons) is precached on install. Because the app is 100% client-side and
 *      stores everything in IndexedDB, "offline" is not a degraded mode — it is
 *      the normal mode. A network connection is only ever needed for the very
 *      first load.
 *
 *   2. Never, ever cache vault data. Vault contents live in IndexedDB, not in
 *      the network layer, and this worker must not become a second place where
 *      ciphertext (or worse) lands on disk outside the app's control. Only
 *      same-origin GET requests for static shell assets are cached.
 *
 * Strategy:
 *   - Precached shell: served cache-first (instant, works offline).
 *   - Navigation requests: network-first with a cached shell fallback, so an
 *     updated deploy is picked up but a flaky connection still boots.
 *   - Everything else same-origin: stale-while-revalidate.
 */

const VERSION = 'v1';
const SHELL_CACHE = `aegis-shell-${VERSION}`;
const RUNTIME_CACHE = `aegis-runtime-${VERSION}`;

// Relative paths only — the app may be served from a subpath (GitHub Pages
// project sites live at /<repo>/) so absolute paths would 404 there.
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.ico',
  './src/app.js',
  './src/core/constants.js',
  './src/core/container.js',
  './src/core/crypto.js',
  './src/core/db.js',
  './src/core/events.js',
  './src/core/format.js',
  './src/core/keystore.js',
  './src/core/vault.js',
  './src/styles/app.css',
  './src/styles/fonts.css',
  './fonts/inter-400-latin.woff2',
  './fonts/inter-500-latin.woff2',
  './fonts/inter-600-latin.woff2',
  './fonts/jetbrains-mono-400-latin.woff2',
  './fonts/jetbrains-mono-500-latin.woff2',
  './src/ui/components.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/ui/screens/auth.js',
  './src/ui/screens/inspector.js',
  './src/ui/screens/settings.js',
  './src/ui/screens/vault.js',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic: one 404 rejects the whole install. Add individually
      // so a single missing asset cannot block the app from installing.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response.ok) await cache.put(url, response);
          } catch {
            // Ignore: the asset is simply not precached. Runtime caching will
            // pick it up if it is ever requested.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GETs are cacheable, and only same-origin requests are our concern.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never let a vault blob or an API-ish path near the cache.
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put('./index.html', response.clone());
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = (await cache.match('./index.html')) ?? (await cache.match('./'));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
        '<body style="background:#0a0b10;color:#e7e9f0;font-family:system-ui;padding:40px">' +
        '<h1>Aegis Vault is offline</h1>' +
        '<p>The app shell has not been cached yet. Connect once, then it will work offline.</p>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const response = await network;
  if (response) return response;

  return new Response('', { status: 504, statusText: 'Offline' });
}

// Allow the page to trigger an immediate update after a successful unlock
// rather than waiting for every tab to close.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
