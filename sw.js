// Service worker: makes the app installable AND lets the map keep working
// with no signal, using two separate caches:
//   - SHELL_CACHE_NAME: the static app files (HTML/CSS/JS), refreshed every
//     time this file's version changes.
//   - TILE_CACHE_NAME: map style/tiles/sprites/glyphs. This one is never
//     purged by this file's own upgrade logic below — it holds tiles the
//     user explicitly downloaded via "Offline maps", and wiping it on every
//     SW update would silently throw that away.
const SHELL_CACHE_NAME = 'navigator-shell-v91';
const TILE_CACHE_NAME = 'offline-tiles'; // keep this string in sync with CONFIG.TILE_CACHE_NAME in config.js — explicit "Download this area" tiles ONLY, written directly by app.js, never auto-evicted here
// Tiles seen just from ordinary online browsing (panning/zooming, not an
// explicit download) land in this separate, size-capped cache instead of
// TILE_CACHE_NAME. Keeping them apart means a long session of casual map
// browsing can never grow unbounded and risk the browser's own
// storage-pressure eviction reaching into (and deleting tiles from) an area
// the user deliberately downloaded for offline use — the whole point of
// that feature.
const INCIDENTAL_TILE_CACHE_NAME = 'incidental-tiles';
const INCIDENTAL_TILE_CACHE_MAX_ENTRIES = 3000; // a few hundred MB at typical vector-tile sizes — bounded, not "as much as the OS allows"

// Keep this in sync with CONFIG.MAP_STYLE_URL's hostname in config.js. The
// service worker can't import that module (Safari doesn't support module
// service workers yet), so this is the one place you need to also update if
// you switch to a self-hosted tile/style server.
const TILE_HOSTS = ['tiles.openfreemap.org'];

const SHELL_FILES = [
  './', // covers index.html too — some static hosts (Cloudflare included) redirect a literal /index.html request to /, so precaching that exact URL separately would just depend on redirect-following behaviour instead of serving directly from cache
  './style.css',
  './app.js',
  './config.js',
  './idb.js',
  './native-location.js',
  './native-tts.js',
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
      // Only ever delete OLD shell caches from a previous SW version. Both
      // tile caches are exempted — they're user/browsing data, not app code.
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE_NAME && k !== TILE_CACHE_NAME && k !== INCIDENTAL_TILE_CACHE_NAME).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Keeps the incidental-tile cache bounded instead of letting it grow for as
// long as the app is used. Checking cache.keys().length on every single tile
// fetch would itself be wasteful (hundreds of tiles load per minute of
// active map use), so this only actually measures/trims with low
// probability — amortized over many fetches, the cache still stays roughly
// capped without adding real per-fetch cost. Not true LRU (Cache Storage
// doesn't track access time), just oldest-inserted-first, which is a
// reasonable enough approximation for "don't grow forever."
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
    // Map style JSON / vector tiles / sprites / glyphs: cache-first, across
    // two caches. This is the trickiest bit to maintain, so to be explicit
    // about the design: the "Download this area" flow in app.js
    // pre-populates TILE_CACHE_NAME directly (via the same Cache API, from
    // the page — it doesn't need to go through this service worker to do
    // that); this fetch handler is what makes those cached tiles actually
    // get used instead of the network once you're offline. It also
    // opportunistically caches anything fetched here during normal online
    // use (any tile you've ever seen on screen) into the separate, bounded
    // INCIDENTAL_TILE_CACHE_NAME, so offline coverage grows a little even
    // outside an explicit download — with no "offline mode" toggle
    // anywhere: MapLibre always requests the same URLs, online or off —
    // without letting that incidental growth run unbounded or risk crowding
    // out a deliberately-downloaded area under storage pressure.
    event.respondWith((async () => {
      const downloadedCache = await caches.open(TILE_CACHE_NAME);
      const downloaded = await downloadedCache.match(event.request);
      if (downloaded) return downloaded;

      const incidentalCache = await caches.open(INCIDENTAL_TILE_CACHE_NAME);
      const cached = await incidentalCache.match(event.request);
      if (cached) return cached;

      // Not cached: go to the network. If this throws (genuinely offline
      // and this exact tile was never downloaded), we deliberately let it
      // reject — MapLibre already handles a failed tile request by leaving
      // that patch of map blank, which is the correct/expected degradation.
      const response = await fetch(event.request);
      if (response && response.ok) {
        incidentalCache.put(event.request, response.clone());
        trimIncidentalTileCache(incidentalCache); // fire-and-forget — doesn't need to block the response
      }
      return response;
    })());
    return;
  }

  // Nominatim, Valhalla, everything else: always live, never cached here —
  // the in-memory search cache and IndexedDB persistence for those live in
  // app.js instead, where "stale is fine" vs "always fresh" can be judged
  // per use case.
});
