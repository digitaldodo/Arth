/**
 * Arth service worker. The root scope is retained for existing installs, but only
 * a mobile standalone client can use the offline entry. Personalized HTML and APIs
 * are never cached.
 */
const SW_VERSION = '__SW_VERSION__';
const CACHE_NAME = 'arth-shell-v2-' + SW_VERSION;
const PRECACHE_ASSETS = __PRECACHE_ASSETS__;
const RUNTIME_DB = 'arth_sw_runtime_v1';
const RUNTIME_DB_VERSION = 1;

function openRuntimeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RUNTIME_DB, RUNTIME_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('clients')) db.createObjectStore('clients', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRuntime(storeName, value) {
  const db = await openRuntimeDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getRuntime(storeName, key) {
  const db = await openRuntimeDb();
  const value = await new Promise((resolve) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
  db.close();
  return value;
}

async function getClientMode(clientId) {
  if (!clientId) return null;
  try {
    const record = await getRuntime('clients', clientId);
    return record?.runtimeMode || null;
  } catch {
    return null;
  }
}

function isMobileUserAgent() {
  const hints = self.navigator.userAgentData;
  if (hints && typeof hints.mobile === 'boolean') return hints.mobile;
  return /android|iphone|ipad|ipod|mobile/i.test(self.navigator.userAgent || '');
}

function offlineHtml(title, message, retry = true) {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0D0D0F"><title>' + title + '</title><style>body{margin:0;background:#0D0D0F;color:#F5F5F4;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}.card{width:min(100%,380px);background:#141416;border:1px solid #333;border-radius:16px;padding:28px 24px;text-align:center}p{font-size:14px;color:#bbb;line-height:1.55}button{margin-top:12px;background:#fff;color:#000;border:0;border-radius:8px;padding:10px 18px;font-weight:600}</style></head><body><main class="card"><h1>' + title + '</h1><p>' + message + '</p>' + (retry ? '<button onclick="location.reload()">Try again</button>' : '') + '</main></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: SW_VERSION, cacheName: CACHE_NAME });
  if (data.type === 'CLASSIFY_CLIENT' && event.source?.id) {
    const allowed = ['desktop-web', 'mobile-web', 'installed-mobile-pwa'];
    if (allowed.includes(data.runtimeMode)) {
      event.waitUntil(storeRuntime('clients', { id: event.source.id, runtimeMode: data.runtimeMode, updatedAt: Date.now() }));
    }
  }
  if (data.type === 'PWA_PREPARED') event.waitUntil(storeRuntime('state', { key: 'pwa-prepared', value: true }));
  if (data.type === 'PWA_SIGNED_OUT') event.waitUntil(storeRuntime('state', { key: 'pwa-prepared', value: false }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('arth-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/login')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      let mode = await getClientMode(event.clientId);
      const startUrlSignal = url.pathname === '/offline' && url.searchParams.get('arth_runtime') === 'installed-mobile-pwa' && isMobileUserAgent();
      if (startUrlSignal) mode = 'installed-mobile-pwa';
      try {
        const response = await fetch(request);
        // Never cache authenticated or personalized navigation responses.
        if (startUrlSignal && event.resultingClientId) {
          await storeRuntime('clients', { id: event.resultingClientId, runtimeMode: 'installed-mobile-pwa', updatedAt: Date.now() });
        }
        return response;
      } catch {
        if (mode === 'installed-mobile-pwa' && isMobileUserAgent()) {
          const prepared = await getRuntime('state', 'pwa-prepared').catch(() => null);
          if (url.pathname !== '/offline') {
            return Response.redirect(new URL('/offline?arth_runtime=installed-mobile-pwa', self.location.origin).href, 302);
          }
          const cached = await caches.open(CACHE_NAME).then((cache) => cache.match('/offline'));
          if (prepared?.value && cached) return cached;
          return offlineHtml('Offline access not prepared', 'Open Arth once while connected to prepare this device for offline use.');
        }
        return offlineHtml('Connection required', 'This web session needs an internet connection. Check your connection and try again.');
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/fonts/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const update = fetch(request).then((response) => {
        if (response.ok) void cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || update;
    })());
  }
});
