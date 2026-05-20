'use strict';

const CACHE_NAME = 'forest-assistant-v34-seasonal-push';
// Osobny, trwały cache na pre-pobrane kafelki mapy — nie jest kasowany przy upgrade'ach SW
const TILE_CACHE = 'forest-map-tiles-v1';

const APP_SHELL = [
  './index.html',
  './css/style.css',
  './js/app.js',
  './data/species.json',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

const CDN_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
];

// ── NOTIFICATION CLICK: otwórz lub przejdź do karty aplikacji ─────────────

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Jeśli karta z aplikacją już jest otwarta — przenieś na nią focus
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Inaczej otwórz nową kartę
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

// ── INSTALL: cache app shell + CDN assets ──────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled([
        cache.addAll(APP_SHELL),
        cache.addAll(CDN_ASSETS),
      ])
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete old caches, preserve TILE_CACHE ──────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: cache-first for app shell, network-first for map tiles ──────────

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Map tiles: network-first → TILE_CACHE (znormalizowany subdomain) → CACHE_NAME
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(networkFirstTile(event.request));
    return;
  }

  // Everything else: cache-first
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Brak połączenia – aplikacja działa offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// Strategia dla kafelków OSM:
// 1. Sieć (online) — zwróć i zapisz w CACHE_NAME
// 2. Offline → TILE_CACHE z URL znormalizowanym do subdomeny "a"
//    (pre-pobrane kafelki zawsze są zapisywane pod a.tile.openstreetmap.org)
// 3. Fallback → CACHE_NAME (kafelki przeglądane na żywo, dowolna subdomena)
async function networkFirstTile(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Normalizuj subdomenę do "a" — tak są zapisywane pre-pobrane kafelki
    const normalizedUrl = request.url.replace(
      /^https:\/\/[abc]\.tile\.openstreetmap\.org/,
      'https://a.tile.openstreetmap.org'
    );
    const tileCache = await caches.open(TILE_CACHE);
    const preloaded = await tileCache.match(normalizedUrl);
    if (preloaded) return preloaded;

    // Fallback: kafelek przeglądany wcześniej (może być pod oryginalną subdomeną)
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}
