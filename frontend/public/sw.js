/**
 * Arth service worker. The root scope is retained for existing installs, but only
 * a mobile standalone client can use the offline entry. Personalized HTML and APIs
 * are never cached.
 */
const SW_VERSION = 'v1-tntsys';
const CACHE_NAME = 'arth-shell-v2-' + SW_VERSION;
const PRECACHE_ASSETS = ["/offline","/manifest.webmanifest","/favicon.ico","/favicon.svg","/icons/icon-192x192.png","/icons/icon-512x512.png","/icons/icon-512x512-maskable.png","/icons/apple-touch-icon.png","/_next/static/chunks/02fvejjqded0n.js","/_next/static/chunks/04l21yxwh-ho0.js","/_next/static/chunks/0a5mkfpnqcz2u.js","/_next/static/chunks/0cz1d0mv5g_q7.js","/_next/static/chunks/0jong4q5jz6qv.js","/_next/static/chunks/0r-py5a7_jgtj.js","/_next/static/chunks/11zx39xe501b3.js","/_next/static/chunks/1chs67v9bzcvf.js","/_next/static/chunks/1fbb8yth86n-y.css","/_next/static/chunks/1hy6bwicrfj32.js","/_next/static/chunks/1onxch1aaidyv.js","/_next/static/chunks/1ucw2ffhiohxe.js","/_next/static/chunks/2wej-xqk8h_ag.js","/_next/static/chunks/2z2tryjbbgyzc.js","/_next/static/chunks/2zx6fdvzhia8m.js","/_next/static/chunks/323cv58-js2zx.js","/_next/static/chunks/3fspjhize0x5h.js","/_next/static/chunks/3hj_o7k9u09xx.js","/_next/static/chunks/3o5n8_8sb1jd1.js","/_next/static/chunks/turbopack-3-ry682tkyiqk.js","/_next/static/media/07a39a8a4660cc7c-s.p.0r6juujl39pe6.woff2","/_next/static/media/07c7676b89ed2778-s.p.2bn3s6zvc0dyp.woff2","/_next/static/media/2a04751c893bf294-s.1rgnod-3esatf.woff2","/_next/static/media/2bb852295097cd96-s.2dbetqa9o8jxf.woff2","/_next/static/media/2fb76073e23fd9e4-s.3lvt2whj97whp.woff2","/_next/static/media/45462fd7b7c12654-s.0k62hbripvv8p.woff2","/_next/static/media/46a9e2f250689b4a-s.0-dom-5bn10r2.woff2","/_next/static/media/6131cbbf5549afa2-s.2uwcyprjm3xu3.woff2","/_next/static/media/6e342921ee4dcd9d-s.2tuy5pz7dlieh.woff2","/_next/static/media/76b70a1dbe058eb5-s.1y4-pdgsjb-pw.woff2","/_next/static/media/9eb5a876700c0028-s.1uyisp29ctx0d.woff2","/_next/static/media/b0c6b664fd57c2c6-s.31988l_ccedte.woff2","/_next/static/media/ba63f6a0e436df8e-s.3-6t-g6q0vh0a.woff2","/_next/static/oY8Xq6_vYkJ1f_HfUGORw/_buildManifest.js","/_next/static/oY8Xq6_vYkJ1f_HfUGORw/_clientMiddlewareManifest.js","/_next/static/oY8Xq6_vYkJ1f_HfUGORw/_ssgManifest.js"];
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
      const startUrlSignal = (url.pathname === '/offline' || url.searchParams.get('arth_runtime') === 'installed-mobile-pwa') && isMobileUserAgent();
      if (startUrlSignal) mode = 'installed-mobile-pwa';
      try {
        const response = await fetch(request);
        // Never cache authenticated or personalized navigation responses.
        if (startUrlSignal && event.resultingClientId) {
          await storeRuntime('clients', { id: event.resultingClientId, runtimeMode: 'installed-mobile-pwa', updatedAt: Date.now() });
        }
        return response;
      } catch {
        if (!mode && isMobileUserAgent()) {
          const prepared = await getRuntime('state', 'pwa-prepared').catch(() => null);
          if (prepared?.value) mode = 'installed-mobile-pwa';
        }
        if (mode === 'installed-mobile-pwa' && isMobileUserAgent()) {
          const cached = await caches.open(CACHE_NAME).then((cache) => cache.match('/offline'));
          if (cached) return cached;
          return offlineHtml('Arth is offline', 'The authenticated app shell is not cached on this device. Reconnect to open Arth; previously loaded financial records remain stored locally and will sync when online.');
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
