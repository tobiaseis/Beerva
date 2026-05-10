// Beerva Service Worker (Push + Offline Caching)

const CACHE_NAME = 'beerva-cache-v7';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon-32.png',
  '/beerva-icon-192.png',
  '/beerva-notification-badge.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        OFFLINE_URLS.map((url) => cache.add(url).catch(() => null))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Helper: is this a static asset that should be cached?
const isStaticAsset = (url) => {
  return (
    url.includes('/_expo/static/') ||
    url.includes('/assets/') ||
    url.endsWith('.js') ||
    url.endsWith('.css') ||
    url.endsWith('.woff') ||
    url.endsWith('.woff2') ||
    url.endsWith('.ttf') ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.svg') ||
    url.endsWith('.ico')
  );
};

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for our origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // API requests should always go to network first
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  // App Shell / Stale-while-revalidate for HTML navigation requests
  // Immediately returns cached index.html to prevent "stuck loading" on slow connections,
  // while updating the cache in the background for next launch.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((cachedResponse) => {
        const networkFetch = fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/', responseClone);
            });
          }
          return response;
        }).catch(() => {
          // Fallback to cache on network failure handled by returning cachedResponse
        });

        // Return the instant cached shell if available, otherwise fallback to network
        return cachedResponse || networkFetch;
      })
    );
    return;
  }

  // Cache-first for static assets (JS bundles, CSS, fonts, images)
  if (isStaticAsset(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // Asset not available offline
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for other requests
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        // Fallback for failed network if no cache
      });

      return cachedResponse || networkFetch;
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {
      title: 'Beerva',
      body: event.data ? event.data.text() : 'You have a new notification',
    };
  }

  const title = payload.title || 'Beerva';
  const options = {
    body: payload.body || 'You have a new notification',
    icon: payload.icon || '/beerva-icon-192.png',
    badge: payload.badge || '/beerva-notification-badge.png',
    tag: payload.tag || 'beerva-notification',
    data: { url: payload.url || '/' },
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then((navigatedClient) => {
              return (navigatedClient || client).focus();
            });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
