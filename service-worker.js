'use strict';

const CACHE_NAME = 'forest-assistant-v12';

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

// ── ACTIVATE: delete old caches ────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: cache-first for app shell, network-first for map tiles ──────────

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Map tiles: network-first, fall back to cache (stale tiles ok offline)
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(networkFirstWithCache(event.request));
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

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}
