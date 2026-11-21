// IT Quest service worker: offline cache + daily reminder pushes.
const VERSION = 'itq-v1.1.0';
const SHELL = ['./', 'index.html', 'cards.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'itq-state' && k !== 'itq-fonts').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(caches.open('itq-fonts').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // App files: network-first so updates land right away, cache fallback for offline
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

async function readState() {
  try {
    const c = await caches.open('itq-state');
    const r = await c.match('state.json');
    return r ? await r.json() : {};
  } catch (e) { return {}; }
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let p = {};
    try { p = e.data ? e.data.json() : {}; } catch (err) { p = { body: e.data && e.data.text() }; }
    const st = await readState();
    const todayStr = new Date().toLocaleDateString('en-CA');
    const done = st.lastDaily === todayStr;
    let title = p.title || 'IT Quest';
    let body = p.body || 'Today\'s boss is waiting. 5 minutes.';
    if (done) {
      title = 'IT Quest · boss cleared ✓';
      body = `Streak: ${st.streak || 1} 🔥 Got 3 more minutes? Hit a bonus round.`;
    } else if (st.streak) {
      body += ` Streak on the line: ${st.streak} 🔥`;
    }
    if (!done && self.navigator.setAppBadge) { try { await self.navigator.setAppBadge(1); } catch (err) {} }
    await self.registration.showNotification(title, {
      body,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      tag: 'itq-daily',
      renotify: true,
      data: { url: done ? './' : './?go=daily' },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
