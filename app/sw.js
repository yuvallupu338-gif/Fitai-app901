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

/*
 * Cache Storage is scoped to the ORIGIN, not to this worker's path. On GitHub
 * Pages every project site of one account shares username.github.io, so a
 * sweep of "every cache that is not mine" would delete caches belonging to the
 * account's other apps. Ours are namespaced and only ours are ever deleted.
 */
const PREFIX = 'fitai-app-';
const VERSION = PREFIX + 'v1';
const SHELL = ['./index.html', './'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // addAll would fail the whole install if either entry 404s, and './' and
    // './index.html' are the same document on most servers but not all.
    const settled = await Promise.allSettled(SHELL.map((u) => c.add(u)));
    // Activating with an empty cache would replace a worker that has a shell
    // with one that has nothing, so failing to precache has to fail the install.
    if (!settled.some((r) => r.status === 'fulfilled')) {
      throw new Error('sw: shell could not be precached');
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

/* respondWith must never resolve to undefined — that is a hard failure, not a
   fallthrough — so every path ends in an actual Response. */
function offlineResponse() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>FitAI</title>' +
    '<body style="background:#090909;color:#f6f6f6;font-family:system-ui;text-align:center;padding:64px 20px">' +
    '<h1 style="color:#ffc400">FitAI</h1><p>אין חיבור, והעותק המקומי עדיין לא נשמר. התחבר פעם אחת ונסה שוב.</p>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        // only cache a real answer; a 404 page must not become the app
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
        }
        return res;
      } catch (_) {
        return (await caches.match('./index.html'))
            || (await caches.match('./'))
            || offlineResponse();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      return Response.error();
    }
  })());
});
