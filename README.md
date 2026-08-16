# Navigator

A personal, self-hosted turn-by-turn navigation web app for driving and walking, built on OpenStreetMap data. Single-user, no accounts, no sync, no server of your own beyond the geocoding/routing services you point it at.

Map rendering is [MapLibre GL JS](https://maplibre.org/) with tiles from [OpenFreeMap](https://openfreemap.org/). Geocoding is [Nominatim](https://nominatim.org/). Routing is [Valhalla](https://valhalla.github.io/valhalla/). Everything else — favorites, recent trips, offline map tiles, the in-progress-trip resume, the Nominatim search cache — lives entirely in the browser (IndexedDB / Cache API), nothing is sent to a server of mine.

The app itself has a **Help & documentation** screen (the circled "?" button, bottom-left of the map) covering all of this from a user's perspective, plus a Credits tab listing every open-source project it's built on — the feature list below is the short version for anyone reading the code.

## Features

- **Search** — place search with typo-tolerant fallback, plus one-tap category chips (petrol, EV charging, pharmacy, ATM, hospital, food, parking, hotels); "X near me" resolves "me" to your live GPS position.
- **Paste a Google Maps link** — a full `google.com/maps` URL or a `maps.app.goo.gl` short link, pasted into any search box, resolves straight to that place — useful when OpenStreetMap's own data doesn't have it yet. Saving one defaults into a "To add to OSM" list with the original link kept alongside it, for an easy way back when you're ready to add that place to OSM yourself.
- **Directions** — multi-stop routing (up to 8 stops, drag to reorder), a plain-text "X to Y" shortcut typed straight into the search box (recognizes "Home"/"Work" on either side), Drive/Walk (/Transit, if configured) modes that re-plan the same trip instantly, and optional avoid-tolls/avoid-highways for driving. "Get directions" hides itself once a route is shown, freeing up screen space, and reappears the moment the source, destination, travel mode, or avoid-tolls/highways actually changes. The route/maneuver list sheet has three stops — peeking, half, and fully expanded — not just the two extremes, so it never has to be all-or-nothing with the map underneath.
- **Long-press to pin a place** — drop a pin anywhere on the map (2-second press) and it does the one obviously useful thing with it: fills the search box if nothing's picked yet, fills whichever of source/destination is still empty, or — if both are already set — asks whether to use it as the start, the destination, or an extra stop.
- **Satellite view** — the layer button above the weather badge switches to Esri satellite imagery, with roads, place labels, POI icons, and your route/live position still drawn on top, and back again.
- **Home & Work shortcuts** — one-tap directions to two saved places, set from the Saved panel or just by typing "Home"/"Work" into a from/to field.
- **Elevation profile** — walking routes show a hill profile with the biggest elevation changes marked; tapping one highlights that exact spot on the map.
- **Turn-by-turn navigation** — a bold directional arrow marks your live position, the traveled part of the route dulls to gray as you go, a live speed readout sits above the next-turn card, and the screen stays awake for the whole drive (Screen Wake Lock API). Navigation ends itself and announces arrival once you're within 10m of the destination — no need to tap "End" yourself.
- **Voice guidance** — an early "in X meters, turn right" heads-up (distances rounded down to the nearest 10m, so it reads as a clean approximation rather than an oddly specific number) followed by a short reminder right before the turn; "Slight left"/"Slight right" phrasing (not Valhalla's "Bear left/right", which reads ambiguously); a mute/important-only/full toggle (same three-way choice as Google Maps); auto-reroute on deviation with a distinct alert tone (not a voice prompt). A maneuver that leads onto a flyover is called out explicitly, since Valhalla's generic "ramp"/"exit" wording otherwise reads identically whether it's an actual elevated structure or just an at-grade connector road.
- **Weather at a glance** — a small badge shows current conditions for a selected place, or your live position while driving; tap it to refresh.
- **Search along the route** — find things ahead of you (or along the whole route, before you start) without leaving your trip; picking one adds it as a stop.
- **Favorites & recent trips**, **offline map tiles** for a whole area, and a **resume-in-progress-trip** if the tab reloads mid-drive.
- **Shareable route links** — encode a whole trip (stops and mode included) into a URL with no backend involved; opening one pre-fills the trip for whoever you send it to.
- **Street-level imagery** coverage via Mapillary, when configured.
- Works with the screen off via the optional Android shell (see below).

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
- `WEATHER_ENABLED` — set to `false` to disable the weather badge entirely (no Open-Meteo calls at all) if you'd rather this app's GPS position never leave the device, even to a free/anonymous API.

If you change `MAP_STYLE_URL` to a self-hosted tile server, also update `TILE_HOSTS` at the top of `sw.js` — the service worker can't import `config.js` (Safari doesn't support module service workers yet), so that one value is duplicated there.

## Deploying

Static files, so GitHub Pages, Cloudflare Pages, or a Cloudflare Worker with static assets all work by pointing at this folder. A few things worth knowing:

- **`_headers`** (Cloudflare Pages and Cloudflare Workers static assets both honor this file, same syntax) sets cache-control so that `index.html`, `app.js`, `style.css`, etc. always revalidate with the server (cheap 304s) instead of getting stuck stale in the CDN cache after a redeploy, plus a baseline set of security headers (CSP, X-Frame-Options, etc.) — none of the app files use content-hashed names, so a long cache lifetime would otherwise mean visitors keep seeing an old version until the cache expires. GitHub Pages doesn't support a custom-headers file, so this only takes effect on Cloudflare.
- **Service worker versioning**: `sw.js` precaches the app shell under `SHELL_CACHE_NAME`. Bump that string (e.g. `v3` → `v4`) whenever you change any of the precached files, so returning visitors' browsers actually fetch the new versions instead of serving what they already installed. If you ever install this as a PWA and see it rendering blank or obviously stale after an update, this cache is the first thing to suspect.
- The offline map tile cache (`offline-tiles`, Milestone 3A) is intentionally never purged by a service-worker version bump — that's user data (tiles you explicitly downloaded), not app code.
- **Resolving a `maps.app.goo.gl` short link needs one small server-side hop** (following the redirect — a browser can't read a cross-origin redirect's target itself), which this repo supports on two different Cloudflare deployment shapes, both wired to the same shared logic in `lib/resolve-maps-url.js`:
  - **Cloudflare Pages** (a project created against this repo in the Pages dashboard): `functions/api/resolve-maps-url.js` deploys automatically, no config needed.
  - **A plain Cloudflare Worker with static assets** (created via `wrangler deploy`, or the dashboard's Git-connected Workers flow, rather than a Pages project — recognizable by a `*.workers.dev` URL instead of `*.pages.dev`): `wrangler.jsonc` + `worker.js` at the repo root add the same route on top of otherwise-unchanged static-asset serving. **`wrangler.jsonc`'s `"name"` must match the Worker's actual name in your dashboard** (it's the first segment of its `*.workers.dev` subdomain) for a redeploy to update that same Worker instead of creating a new one.
  - **GitHub Pages** has no server functions at all, so a short link can't be resolved there — a full `google.com/maps` link still works everywhere, since those already carry the coordinates in the URL itself with nothing to resolve.

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
- **Elevation profile** depends on Valhalla's `/height` action being enabled on whichever server `VALHALLA_URL` points at (confirmed working on the public demo server) — if a self-hosted instance has it disabled, the walking route itself still works fine, just without the chart.
- **Android shell** — see above; unverified on a real device.
