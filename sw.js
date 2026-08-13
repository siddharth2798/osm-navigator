// Service worker: makes the app installable AND lets the map keep working
// with no signal, using two separate caches:
//   - SHELL_CACHE_NAME: the static app files (HTML/CSS/JS), refreshed every
//     time this file's version changes.
//   - TILE_CACHE_NAME: map style/tiles/sprites/glyphs. This one is never
//     purged by this file's own upgrade logic below — it holds tiles the
//     user explicitly downloaded via "Offline maps", and wiping it on every
//     SW update would silently throw that away.
const SHELL_CACHE_NAME = 'navigator-shell-v12';
const TILE_CACHE_NAME = 'offline-tiles'; // keep this string in sync with CONFIG.TILE_CACHE_NAME in config.js

// Keep this in sync with CONFIG.MAP_STYLE_URL's hostname in config.js. The
// service worker can't import that module (Safari doesn't support module
// service workers yet), so this is the one place you need to also update if
// you switch to a self-hosted tile/style server.
const TILE_HOSTS = ['tiles.openfreemap.org'];

const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './idb.js',
  './native-location.js',
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
      // Only ever delete OLD shell caches from a previous SW version. The
      // tile cache is explicitly exempted — it's user data, not app code.
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE_NAME && k !== TILE_CACHE_NAME).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    // App shell: cache-first, network fallback (works fully offline once installed).
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }

  if (TILE_HOSTS.includes(url.hostname)) {
    // Map style JSON / vector tiles / sprites / glyphs: cache-first.
    //
    // This is the trickiest bit to maintain, so to be explicit about the
    // design: the "Download this area" flow in app.js pre-populates
    // TILE_CACHE_NAME directly (via the same Cache API, from the page —
    // it doesn't need to go through this service worker to do that).
    // This fetch handler is what makes those cached tiles actually get used
    // instead of the network once you're offline. As a bonus, it also
    // opportunistically caches anything fetched here during normal online
    // use (any tile you've ever seen on screen), so offline coverage grows
    // a little even outside an explicit download — with no "offline mode"
    // toggle anywhere: MapLibre always requests the same URLs, online or off.
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // Not cached: go to the network. If this throws (genuinely offline
      // and this exact tile was never downloaded), we deliberately let it
      // reject — MapLibre already handles a failed tile request by leaving
      // that patch of map blank, which is the correct/expected degradation.
      const response = await fetch(event.request);
      if (response && response.ok) cache.put(event.request, response.clone());
      return response;
    })());
    return;
  }

  // Nominatim, Valhalla, everything else: always live, never cached here —
  // the in-memory search cache and IndexedDB persistence for those live in
  // app.js instead, where "stale is fine" vs "always fresh" can be judged
  // per use case.
});
