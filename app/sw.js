/*
 * sw.js — offline shell for app/index.html.
 *
 * The app is one self-contained file: fonts, photos, exercise demos and brand
 * marks are all inlined, so there is nothing to cache except the document
 * itself. Opened from file:// no worker is registered at all and none is needed.
 * Served over http it is this worker that makes an installed copy survive going
 * offline, because without it the browser has only its ordinary HTTP cache to
 * fall back on and no promise it kept anything.
 *
 * Navigations go to the network first so a redeploy is picked up on the next
 * load; the cache is the fallback, not the source of truth. Everything else is
 * served cache-first, since anything else the page asks for is static.
 */
const VERSION = 'fitai-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll rejects the whole install if any one entry 404s, and './' and
      // './index.html' are the same document on most servers but not all.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // only cache a real answer; a 404 page must not become the app
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })),
  );
});
