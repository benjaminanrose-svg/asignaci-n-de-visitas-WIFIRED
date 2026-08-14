// ============================================================
// WIFIRED · Service Worker — notificaciones push
// ============================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'WIFIRED', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'WIFIRED', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [80, 40, 80],
    data: { url: d.url || '/' },
    tag: 'wifired-visita',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

// ===== ESTRATEGIA CACHE-FIRST PARA OFFLINE =====
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API: Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            caches.open('wifired-data-v1').then((cache) => {
              cache.put(e.request, res.clone());
            });
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
  // Archivos estáticos: Cache first
  else {
    e.respondWith(
      caches.match(e.request)
        .then((res) => res || fetch(e.request))
        .catch(() => new Response('Offline', { status: 503 }))
    );
  }
});

// ===== SINCRONIZACIÓN EN SEGUNDO PLANO =====
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-wifired-data') {
    e.waitUntil(syncDataInBackground());
  }
});

async function syncDataInBackground() {
  try {
    const endpoints = ['/api/visitas', '/api/tecnicos'];
    const cache = await caches.open('wifired-data-v1');
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          await cache.put(endpoint, res.clone());
        }
      } catch (e) {}
    }
  } catch (e) {}
}

self.addEventListener('install', () => {
  if (self.registration.periodicSync) {
    self.registration.periodicSync.register('sync-wifired-data', {
      minInterval: 30 * 60 * 1000
    }).catch(() => {});
  }
});
