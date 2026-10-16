// Offline app shell. Bump VERSION on every deploy so phones pick up the new files.
// Data (/api/), map tiles, routing and weather are never cached here.

const VERSION = 'v3';
const CACHE = `ma-course-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './js/app.js',
  './js/core/format.js',
  './js/core/session.js',
  './js/core/workouts.js',
  './js/core/analysis.js',
  './js/core/loop.js',
  './js/core/origin.js',
  './js/services/api.js',
  './js/services/weather.js',
  './js/services/router.js',
  './js/services/history.js',
  './js/services/geocode.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/today.js',
  './js/ui/loop-view.js',
  './js/ui/week.js',
  './js/ui/settings.js',
  './js/ui/map.js',
  './js/ui/origin-sheet.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (fresh code when online), cache as offline fallback.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
