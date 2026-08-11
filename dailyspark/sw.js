/*
 * sw.js — offline, and the notification's action buttons.
 *
 * A once-a-day app is used in exactly the places with no signal: a lift, the
 * underground, a plane, a street with one bar. Offline is not a degraded mode
 * here, it is the normal one, so everything the app needs is cached on install
 * and served cache-first.
 *
 * Cache-first, not network-first, on purpose: the content is a fixed library
 * that changes when a new version ships, so there is nothing to be fresh about
 * between releases, and network-first would spend a timeout on every cold start
 * for a file that never changed. New versions arrive by bumping CACHE, which
 * drops the old one wholesale on activate.
 *
 * This worker is deliberately not registered by the single-file build, which
 * runs from file:// where service workers do not exist.
 */

const CACHE = 'dailyspark-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles/fonts.css',
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/components.css',
  './src/app.js',
  './src/core/dom.js',
  './src/core/store.js',
  './src/core/day.js',
  './src/core/streak.js',
  './src/data/taxonomy.js',
  './src/data/sparks.body.js',
  './src/data/sparks.mind.js',
  './src/data/sparks.life.js',
  './src/data/sparks.index.js',
  './src/engine/vector.js',
  './src/engine/bandit.js',
  './src/engine/safety.js',
  './src/engine/framing.js',
  './src/engine/select.js',
  './src/ui/onboarding.js',
  './src/ui/home.js',
  './src/ui/book.js',
  './src/ui/insights.js',
  './src/ui/profile.js',
  './src/ui/share.js',
  './src/ui/notify.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* addAll is atomic: one 404 fails the whole install and leaves the previous
     * worker in place, which is the behaviour we want — a half-cached app that
     * boots into a missing module is worse than no worker at all. */
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      /* Only same-origin responses are worth keeping; an opaque cross-origin
       * response cannot be inspected and would poison the cache with something
       * that might be an error page. */
      if (fresh.ok && new URL(request.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (e) {
      /* A navigation with no network and no cache entry still has to land
       * somewhere — the shell boots and reads its state from localStorage. */
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});

/*
 * "✓ עשיתי" straight from the lock screen.
 *
 * This is the shortest possible path through the product — no app launch, no
 * screen, one tap — and it only exists because notifications shown through a
 * service worker can carry action buttons. If a window is already open the
 * message goes to it; otherwise the app is opened at the home tab and picks the
 * completion up from there.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const done = event.action === 'done';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        if (done) client.postMessage({ type: 'spark-done' });
        return client.focus();
      }
    }
    return self.clients.openWindow(done ? './#home?done=1' : './#home');
  })());
});
