/**
 * Arth Progressive Web App Service Worker
 * Version: v1-tnrjcs
 * Caches only public static assets; the authenticated root HTML is never cached.
 * Authenticated API endpoints and auth routes are strictly excluded from Service Worker Cache API.
 */

const SW_VERSION = 'v1-tnrjcs';
const CACHE_NAME = 'arth-shell-v1-' + SW_VERSION;

const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-512x512-maskable.png',
  '/icons/apple-touch-icon.png',
];

// Install: precache app shell essentials into versioned cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => {
        // Re-throw so the browser marks this worker as 'redundant'.
        // The existing active worker continues serving until a future install succeeds.
        console.error('[ServiceWorker] Precaching failed — aborting install to preserve working cache:', err);
        throw err;
      })
  );
  // Important: We do NOT call self.skipWaiting() here directly.
  // The service worker remains in the 'waiting' state until the application client
  // confirms that the user is not actively typing or saving a financial transaction.
});

// Message listener: coordinates safe activation and diagnostics
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({
      version: SW_VERSION,
      cacheName: CACHE_NAME,
    });
  }
});

// Activate: clean up older caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith('arth-shell-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[ServiceWorker] Deleting obsolete cache:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strictly skip caching for authenticated API routes, Supabase Auth, and version endpoint
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Handle HTML navigation: Fast Network-first with 1800ms timeout, falling back instantly to cached App Shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        let timeoutId = null;
        try {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          if (controller) {
            timeoutId = setTimeout(() => controller.abort(), 1800);
          }
          const response = await fetch(event.request, controller ? { signal: controller.signal } : {});
          if (timeoutId) clearTimeout(timeoutId);
          const cacheControl = response?.headers.get('cache-control') || '';
          const isPublicResponse = /(?:^|,)\s*public(?:\s|,|$)/i.test(cacheControl) && !/private|no-store/i.test(cacheControl);
          if (response && response.status === 200 && isPublicResponse && !response.headers.has('set-cookie')) {
            const clone = response.clone();
            await caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        } catch {
          if (timeoutId) clearTimeout(timeoutId);
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Arth — Offline</title><style>body{margin:0;background:#0D0D0F;color:#F5F5F4;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box;text-align:center}.card{max-width:380px;background:#141416;border:1px solid #333;border-radius:16px;padding:32px 24px}p{font-size:14px;color:#bbb;line-height:1.5}button{background:#fff;color:#000;border:0;border-radius:8px;padding:10px 20px;font-weight:600}</style></head><body><div class="card"><h1>Arth is offline</h1><p>The authenticated app shell is not cached on this device. Reconnect to open Arth; previously loaded financial records remain stored locally and will sync when online.</p><button onclick="location.reload()">Try again</button></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // Handle static assets (Next.js chunks, fonts, icons): Stale-while-revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});
