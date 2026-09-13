// Service worker: makes the app installable and lets the map work offline,
// using two caches — the static app shell, and map tiles.
const SHELL_CACHE_NAME = 'navigator-shell-v118';
const TILE_CACHE_NAME = 'offline-tiles'; // keep in sync with CONFIG.TILE_CACHE_NAME in config.js — explicit downloads only, never auto-evicted
// Tiles from ordinary browsing (not an explicit download) go in this
// separate, size-capped cache so they can't crowd out downloaded areas.
const INCIDENTAL_TILE_CACHE_NAME = 'incidental-tiles';
const INCIDENTAL_TILE_CACHE_MAX_ENTRIES = 3000; // a few hundred MB at typical vector-tile sizes

// Keep in sync with CONFIG.MAP_STYLE_URL's hostname in config.js (can't
// import that module here — Safari doesn't support module service workers).
const TILE_HOSTS = ['tiles.openfreemap.org'];

const SHELL_FILES = [
  './', // covers index.html too — avoids depending on redirect-following behavior
  './style.css',
  './app.js',
  './config.js',
  './idb.js',
  './native-location.js',
  './native-tts.js',
  './native-audio-focus.js',
  './native-back.js',
  './native-pip.js',
  './vendor/open-location-code.js',
  './vendor/capacitor-core.js',
  './vendor/capacitor-text-to-speech.js',
  './vendor/capacitor-app.js',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Delete only old shell caches from a previous SW version; tile caches are user data.
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE_NAME && k !== TILE_CACHE_NAME && k !== INCIDENTAL_TILE_CACHE_NAME).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Keeps the incidental-tile cache bounded. Only trims with low probability
// (checking length on every fetch would be wasteful); trims oldest-inserted
// first since Cache Storage has no access-time tracking for true LRU.
async function trimIncidentalTileCache(cache) {
  if (Math.random() > 0.02) return;
  const keys = await cache.keys();
  const excess = keys.length - INCIDENTAL_TILE_CACHE_MAX_ENTRIES;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    // App shell: cache-first, network fallback (works fully offline once installed).
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }

  if (TILE_HOSTS.includes(url.hostname)) {
    // Map tiles: cache-first, checking the downloaded-areas cache before the
    // incidental one. Also opportunistically caches tiles from normal
    // browsing into the bounded incidental cache, for a bit of offline
    // coverage even without an explicit download.
    event.respondWith((async () => {
      const downloadedCache = await caches.open(TILE_CACHE_NAME);
      const downloaded = await downloadedCache.match(event.request);
      if (downloaded) return downloaded;

      const incidentalCache = await caches.open(INCIDENTAL_TILE_CACHE_NAME);
      const cached = await incidentalCache.match(event.request);
      if (cached) return cached;

      // Not cached: go to the network. If offline, let it reject — MapLibre
      // handles a failed tile by leaving that patch of map blank.
      const response = await fetch(event.request);
      if (response && response.ok) {
        incidentalCache.put(event.request, response.clone());
        trimIncidentalTileCache(incidentalCache); // fire-and-forget — doesn't need to block the response
      }
      return response;
    })());
    return;
  }

  // Nominatim, Valhalla, everything else: always live, never cached here.
});
