/* Service worker: instalación como app, funcionamiento sin conexión y notificaciones push (Firebase). */
const CACHE = 'jarvis-ramos-v3';
const ASSETS = ['./', 'index.html', 'css/hud.css', 'js/firebase-config.js', 'js/store.js', 'js/metrics.js', 'js/study.js',
  'js/seed.js', 'js/advisor.js', 'js/monthly.js', 'js/voice.js', 'js/notify.js', 'js/news.js', 'js/cloud.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

// Push con Firebase Cloud Messaging (solo si la nube está configurada)
try {
  importScripts('js/firebase-config.js');
  const cfg = self.JARVIS_CONFIG || {};
  if (cfg.firebase) {
    const V = cfg.firebaseVersion || '10.12.2';
    importScripts(`https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js`,
      `https://www.gstatic.com/firebasejs/${V}/firebase-messaging-compat.js`);
    firebase.initializeApp(cfg.firebase);
    firebase.messaging(); // muestra automáticamente las notificaciones que envía el servidor
  }
} catch (e) { /* sin push: la app sigue funcionando */ }

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Red primero (siempre la última versión); caché si no hay conexión
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.FCM_MSG?.notification?.click_action || e.notification.data?.link || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
