// Offline cache for the app shell. Bump VERSION whenever an asset changes so phones pick up the update.
// Data calls to Supabase are cross-origin and never cached here: live data always comes from the server.
const VERSION = 'elongo-v29';
const ASSETS = ['./', 'index.html', 'styles.css', 'config.js', 'backend.js', 'app.js', 'manifest.webmanifest',
  'vendor/supabase.js', 'vendor/591.supabase.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates arrive when online), cache as fallback (so the app opens offline)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

// Push notifications (sent by the "push" Edge Function). Nothing is shown while the app is open and in front:
// it already announces changes itself, and browsers accept that for a visible window.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(c => c.visibilityState === 'visible' && c.focused)) return;
    await self.registration.showNotification(d.title || 'Elongo', {
      body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
      tag: d.tag, renotify: !!d.tag, data: { url: d.url || './#/tour' },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './#/tour', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = wins.find(c => c.url.startsWith(self.registration.scope));
    if (mine) { try { await mine.focus(); if ('navigate' in mine) await mine.navigate(url); return; } catch (_) { /* open a new window below */ } }
    await self.clients.openWindow(url);
  })());
});
