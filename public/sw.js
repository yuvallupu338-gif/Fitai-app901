/*
 * Service Worker של "יופי".
 *
 * מטרה: לאפשר התקנה כאפליקציה בטלפון (PWA) ולהציג מסך ידידותי כשאין רשת.
 * חשוב: אנחנו לא שומרים במטמון תשובות של API או דפים עם נתוני משתמש –
 * התוכן חייב להיות תמיד עדכני מהמסד, ולכן המטמון מוגבל לנכסים סטטיים.
 */

const CACHE_VERSION = 'yofi-v1';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // נתוני משתמש ופעולות – תמיד מהרשת, בלי מטמון.
  if (url.pathname.startsWith('/api/')) return;

  // ניווטים: רשת קודם, ומסך "אין חיבור" כגיבוי.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // נכסים סטטיים: מטמון קודם, עם רענון ברקע.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached ?? network;
      }),
    );
  }
});

// התראות Push
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = { title: 'יופי', body: 'יש עדכון חדש', url: '/notifications' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
