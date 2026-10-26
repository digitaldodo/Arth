/**
 * Arth Progressive Web App Service Worker
 * Version: v1-tnixxm
 * Precaches core application shell, styles, and branding assets for instant startup.
 * Authenticated API endpoints and auth routes are strictly excluded from Service Worker Cache API.
 */

const SW_VERSION = 'v1-tnixxm';
const CACHE_NAME = 'arth-shell-v1-' + SW_VERSION;

const PRECACHE_ASSETS = [
  '/',
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
        console.warn('[ServiceWorker] Precaching failed during install:', err);
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
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        } catch {
          if (timeoutId) clearTimeout(timeoutId);
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          return new Response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Arth — Offline</title><style>body{margin:0;background:#0D0D0F;color:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;box-sizing:border-box;text-align:center}.card{max-width:380px;background:#141416;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px 24px}h1{font-size:18px;margin:0 0 8px;font-weight:600}p{font-size:13px;color:#A1A1AA;line-height:1.5;margin:0 0 20px}button{background:#fff;color:#000;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer}</style></head><body><div class="card"><h1>Initial Setup Requires Internet</h1><p>Arth needs an active internet connection on your first launch to initialize your local ledger securely.</p><button onclick="location.reload()">Retry Connection</button></div></body></html>',
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
