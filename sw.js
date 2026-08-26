// ============================================================
// WIFIRED · Service Worker — caché offline + notificaciones push
// Precachea toda la app al instalar (funciona sin internet desde
// la primera apertura) y actualiza en segundo plano cuando hay red.
// ============================================================
const CACHE = 'wifired-v39';

const ASSETS = [
  '/', '/index.html', '/manifest.webmanifest',
  '/css/base.css', '/css/layout.css', '/css/components.css',
  '/js/app.js', '/js/store.js', '/js/util.js', '/js/auth.js',
  '/js/components.js', '/js/form.js', '/js/techform.js', '/js/photos.js',
  '/js/signature.js', '/js/push.js', '/js/zip.js',
  '/js/views/panel.js', '/js/views/agenda.js', '/js/views/calendario.js',
  '/js/views/visitas.js', '/js/views/clientes.js', '/js/views/tickets.js', '/js/views/servicios.js', '/js/views/tecnicos.js', '/js/views/ubicaciones.js', '/js/views/tecnico.js',
  '/js/views/config.js', '/js/views/login.js',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // best-effort: si algún archivo falla, no rompe la instalación
    await Promise.all(ASSETS.map((u) => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cruz-origen (fuentes, etc.): red normal
  if (url.pathname.startsWith('/api/')) return;     // API: siempre red (la app maneja el offline)

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const fromNet = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (cached) { e.waitUntil(fromNet); return cached; } // stale-while-revalidate

    const net = await fromNet;
    if (net) return net;
    // Sin red y sin caché exacta: para navegación, servir el index cacheado
    if (req.mode === 'navigate') {
      return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
    }
    return Response.error();
  })());
});

// ---------- Notificaciones push ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'WIFIRED', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'WIFIRED', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    data: { url: d.url || '/' },
    // Etiqueta única por aviso: así cada notificación suena y vibra
    // (una etiqueta repetida se actualiza en silencio en Android/iOS).
    tag: 'wifired-' + Date.now(),
    renotify: true,        // vuelve a alertar aunque se agrupe
    requireInteraction: true, // no se descarta sola hasta que el técnico la vea
    silent: false,
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
