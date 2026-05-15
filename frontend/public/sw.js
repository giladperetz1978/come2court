const CACHE_NAME = 'filltheteam-pwa-v2';
const OFFLINE_URLS = ['/', '/index.html', '/manifest.webmanifest'];

function shouldBypassCache(url) {
  return url.pathname.startsWith('/api/') || url.hostname.includes('accounts.google.com');
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cloned = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
    return response;
  } catch (_error) {
    const cached = await caches.match(request);
    return cached || caches.match('/index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      const cloned = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  return networkResponse || caches.match('/index.html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (shouldBypassCache(requestUrl)) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isNavigationRequest = event.request.mode === 'navigate';

  event.respondWith(isNavigationRequest ? networkFirst(event.request) : staleWhileRevalidate(event.request));
});

self.addEventListener('push', (event) => {
  const fallback = {
    title: 'תזכורת משחק',
    message: 'יש משחק בקרוב. בדקו את ההרשמה שלכם.'
  };
  const payload = event.data ? event.data.json() : fallback;

  event.waitUntil(
    self.registration.showNotification(payload.title || fallback.title, {
      body: payload.message || fallback.message,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png'
    })
  );
});
