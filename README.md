# Navigator

A personal, self-hosted turn-by-turn navigation web app for driving in India, built on OpenStreetMap data. Single-user, no accounts, no sync, no server of your own beyond the geocoding/routing services you point it at.

Map rendering is [MapLibre GL JS](https://maplibre.org/) with tiles from [OpenFreeMap](https://openfreemap.org/). Geocoding is [Nominatim](https://nominatim.org/). Routing is [Valhalla](https://valhalla.github.io/valhalla/). Everything else — favorites, recent trips, offline map tiles, the in-progress-trip resume, the Nominatim search cache — lives entirely in the browser (IndexedDB / Cache API), nothing is sent to a server of mine.

## Running it

No build step. Clone or copy the folder, serve it as static files, open it in a browser:

```
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

`app.js` is loaded as an ES module, so you can't just double-click `index.html` (`file://` blocks module imports) — it has to be served over `http://` or `https://`.

## Configuring your own services

Every URL and tunable lives at the top of **`config.js`**, each with a comment explaining what it does and what the public default is. At minimum, before relying on this day-to-day rather than testing:

- `NOMINATIM_URL` — point at your own Nominatim instance. The public default has a hard 1 req/sec limit.
- `VALHALLA_URL` — point at your own Valhalla instance. The public default is a shared demo server.
- `MAPILLARY_ACCESS_TOKEN` — optional (Milestone 4A). Leave empty to disable street-level imagery entirely; there's no public shared token since Mapillary requires every app to register its own.
- `OTP2_URL` — optional (Milestone 4C). Leave empty and the transit mode toggle never appears; there's no public OpenTripPlanner demo to default to.

If you change `MAP_STYLE_URL` to a self-hosted tile server, also update `TILE_HOSTS` at the top of `sw.js` — the service worker can't import `config.js` (Safari doesn't support module service workers yet), so that one value is duplicated there.

## Deploying

Static files, so GitHub Pages or Cloudflare Pages both work by pointing at this folder. A few things worth knowing:

- **`_headers`** (Cloudflare Pages only) sets cache-control so that `index.html`, `app.js`, `style.css`, etc. always revalidate with the server (cheap 304s) instead of getting stuck stale in the CDN cache after a redeploy — none of these files use content-hashed names, so a long cache lifetime would otherwise mean visitors keep seeing an old version until the cache expires. GitHub Pages doesn't support a custom-headers file, so this only takes effect on Cloudflare.
- **Service worker versioning**: `sw.js` precaches the app shell under `SHELL_CACHE_NAME`. Bump that string (e.g. `v3` → `v4`) whenever you change any of the precached files, so returning visitors' browsers actually fetch the new versions instead of serving what they already installed. If you ever install this as a PWA and see it rendering blank or obviously stale after an update, this cache is the first thing to suspect — see "Troubleshooting" below.
- The offline map tile cache (`offline-tiles`, Milestone 3A) is intentionally never purged by a service-worker version bump — that's user data (tiles you explicitly downloaded), not app code.

## Data freshness (OSM updates)

There's no update/fetch script in this app — freshness is entirely a property of whichever services `config.js` points at:

- **Map tiles**: OpenFreeMap's public instance rebuilds on its own schedule (check openfreemap.org for their current cadence). Self-hosted tiles are refreshed by re-running your own tile-builder against a newer OSM extract.
- **Geocoding**: the public Nominatim instance applies OSM's edit-replication feed, so new edits typically appear within hours. A self-hosted instance can do the same via Nominatim's own `nominatim replication` command.
- **Routing / transit**: Valhalla and OpenTripPlanner both build a static graph from a `.pbf` extract at setup time and do **not** auto-update. Picking up new roads or GTFS schedules means periodically re-downloading the extract and rebuilding — there's no live-sync mechanism, so if you self-host either, you'll want your own cron job for this.
- **Mapillary imagery** is the exception — contributor-uploaded directly to Mapillary's service, close to real-time.

## The optional Android shell

The web app also works wrapped in [Capacitor](https://capacitorjs.com/) as a native Android app, specifically to get reliable location tracking with the screen off (the base Geolocation API/plain `watchPosition` is not reliable once Android backgrounds the WebView). This needs Node/npm; the web app itself still doesn't.

```
npm install                  # installs @capacitor/core, @capacitor/android, and the background-geolocation plugin
npm run cap:sync             # copies the web app into www/, syncs the android/ project
npx cap open android         # opens the project in Android Studio
```

**Honest caveat: the native build has not been compiled or run.** This environment has no Android SDK or emulator, so `android/` is a real, generated Capacitor project and `native-location.js` is written directly against the plugin's documented API, but none of it has been verified on an actual device. Treat it as a first draft to test, not a working implementation, before relying on it.

Also worth knowing: `@capacitor-community/background-geolocation`'s notification text is set once when tracking starts and can't be updated live afterward (its API has no "update" call) — so the persistent Android notification can say "Navigating to Gateway of India" but not a live-updating "next: turn left in 200m". [`@transistorsoft/capacitor-background-geolocation`](https://github.com/transistorsoft/capacitor-background-geolocation) supports live notification updates if that matters more to you than avoiding a commercial/licensed dependency — swapping it in only requires changing `native-location.js`.

## Known limitations

- **Ferry-only-access landmarks**: some pedestrianized OSM landmarks (Gateway of India in Mumbai is the confirmed example) have no drivable road access in Valhalla's graph at all except tourist ferry piers, so *any* route ending there resolves to a ferry regardless of query phrasing or costing options. The app detects this (`checkRoutePlausibility`) and warns rather than silently showing an absurd route, but can't route around a gap that doesn't exist in the underlying map data — try a nearby street address instead.
- **EV charging search is genuinely sparse** in India's current OSM coverage — a "no EV charging found nearby" result often reflects real data gaps, not a search bug.
- **Transit mode** covers planning and rendering only, not live GPS-guided transit navigation — boarding/alighting detection for buses and trains is a different problem from road-snapping and was out of scope. It also can't be tested end-to-end here since there's no public OpenTripPlanner demo server to default to.
- **Android shell** — see above; unverified on a real device.

## Troubleshooting: PWA installed on Android renders blank

If the same deployment works fine in a normal browser tab but shows nothing once installed to the home screen, the leading suspects, in order:

1. **Stale/mismatched service worker cache.** If you edited any app file without bumping `SHELL_CACHE_NAME` in `sw.js`, an already-installed PWA can end up running a mix of old and new cached files. Bump the version string and reload (you may need to fully uninstall/reinstall the PWA, or clear site data, since an already-broken SW won't necessarily self-heal from a version bump alone).
2. **Case-sensitivity mismatch.** macOS's default filesystem is case-insensitive; most real hosting (GitHub Pages, Cloudflare Pages) is not. A reference like `Icons/Icon.svg` vs the real `icons/icon.svg` would work when testing locally on a Mac and fail once actually deployed. Double check every file path referenced in `index.html`, `manifest.json`, and `sw.js`'s `SHELL_FILES` list matches the real filename's case exactly.
3. **`manifest.json` `start_url`/`scope` under a subpath deployment.** If deployed under a repo-name subpath (e.g. a GitHub Pages *project* site at `username.github.io/repo-name/`), confirm the installed icon actually opens `.../repo-name/index.html` and not a 404 at the domain root.
4. If none of those explain it, the next step is checking the actual browser console on the device — connect the phone to a desktop Chrome via USB and use `chrome://inspect` to see the real error, since it can't be reproduced without a physical device and the actual deployed URL.
