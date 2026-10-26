/**
 * Arth Progressive Web App Service Worker
 * Version: arth-shell-v1
 * Precaches core application shell, styles, and branding assets for instant startup.
 * Authenticated API endpoints are strictly excluded from Service Worker Cache API.
 */

const CACHE_NAME = 'arth-shell-v1';

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

// Install: precache app shell essentials
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[ServiceWorker] Precaching failed:', err);
      })
  );
});

// Activate: clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strictly skip caching for authenticated API routes and Supabase Auth
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Handle HTML navigation: Network-first, fallback to cached App Shell '/' if offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          return new Response(
            '<!DOCTYPE html><html><body style="background:#0D0D0F;color:#fff;font-family:sans-serif;padding:2rem;text-align:center;"><h2>Arth is currently offline</h2><p>Please check your internet connection.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
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
