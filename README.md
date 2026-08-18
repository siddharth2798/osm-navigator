# Navigator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-siddharth2798%2Fosm--navigator-181717?logo=github)](https://github.com/siddharth2798/osm-navigator)

A personal, self-hosted turn-by-turn navigation web app for driving and walking, built on OpenStreetMap data. Single-user, no accounts, no sync, no server of your own beyond the geocoding/routing services you point it at.

Map rendering is [MapLibre GL JS](https://maplibre.org/) with tiles from [OpenFreeMap](https://openfreemap.org/). Geocoding is [Nominatim](https://nominatim.org/). Routing is [Valhalla](https://valhalla.github.io/valhalla/). Everything else — favorites, recent trips, offline map tiles, the in-progress-trip resume — lives entirely in the browser (IndexedDB / Cache API).

The app itself has a **Help & documentation** screen (the "?" button, bottom-left of the map) covering all of this from a user's perspective — the feature list below is the short version for anyone reading the code.

## Privacy

- **No accounts, no sync, no analytics, no telemetry, no tracking scripts, no server-side database.** There's no infrastructure of mine for that data to even go to.
- **Everything personal to you — favorites, recent trips, Home/Work, offline map tiles, the in-progress-trip resume — lives only in your own browser**, via IndexedDB and the Cache API. Clearing the site's data deletes all of it, permanently, with nothing left anywhere else.
- **What leaves your device, and to whom**, only when the feature is used: search text/coordinates → **Nominatim**; route coordinates → **Valhalla** (and **OpenTripPlanner**, if configured); map tile coordinates → your tile host; GPS coordinates → **Open-Meteo** (weather badge) and **Mapillary** (if configured) — both opt-out via `config.js`; a pasted Google Maps link → this app's own tiny Cloudflare Worker, which forwards just that URL to Google.
- The on-screen debug log (see [Troubleshooting](#troubleshooting)) is local and ephemeral — it never transmits anything, and is off by default.
- None of this is enforced against the *services themselves* — a public Nominatim/Valhalla/tile instance run by someone else can log requests like any other web request. Self-host your own (see [Configuring your own services](#configuring-your-own-services)) if that matters to you.

## Features

- **Search** — typo-tolerant fallback, one-tap category chips (petrol, EV charging, pharmacy, ATM, hospital, food, parking, hotels), "X near me" resolves to your live GPS position.
- **Paste a Google Maps link** — a full `google.com/maps` URL or `maps.app.goo.gl` short link resolves straight to that place, for gaps in OpenStreetMap's own coverage — including places with no street address at all (Google's Plus Codes decode automatically). Saving one files it into a "To add to OSM" list with the original link kept alongside it. Also registers as an Android **Share target**, so sharing a place from the Google Maps app resolves it here directly.
- **Directions** — multi-stop routing (up to 8, drag to reorder), a plain-text "X to Y" shortcut in the search box (recognizes "Home"/"Work"/"my location"), Drive/Walk/Transit modes, avoid-tolls/avoid-highways. Alternate-route cards lead with distance, not Valhalla's time estimate — that estimate has no live traffic behind it at all.
- **Long-press to pin a place** (4-second press, ignores multi-touch/pinch) — fills the search box, or sets it as the destination directly if you're already mid-trip.
- **Your location, always visible** — a live "you are here" marker with a heading wedge, on or off navigation, toggled from the locate button.
- **Satellite view**, **Home & Work shortcuts**, **elevation profile** for walking routes.
- **Turn-by-turn navigation** — live position arrow, traveled-route dulling, the screen stays awake for the whole drive, arrival is detected automatically. Survives a mid-drive browser reload (resumes exactly where it left off) and reroutes onto whatever road you actually took, not just "U-turn back."
- **Voice guidance** — early ("~220m out") and near ("~80m") turn prompts, natural phrasing (roundabout exit counts, "slight" instead of "bear"), a mute/important-only/full toggle, a distinct alert tone on deviation, and a "continue straight for X km" call-out on long stretches.
- **Weather at a glance**, **search along the route**, **favorites & recent trips**, **offline map tiles**, **shareable route links** (no backend involved), **street-level imagery** via Mapillary when configured.
- Works with the screen off via the [optional Android shell](#the-optional-android-shell).

## Running it

No build step. Clone or copy the folder, serve it as static files, open it in a browser:

```
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

`app.js` is loaded as an ES module, so `file://` won't work — it has to be served over `http://` or `https://`.

## Configuring your own services

Every URL and tunable lives at the top of **`config.js`**, each commented with what it does and when to change it — that file, not this README, is the source of truth for all of them.

- **`GEOCODE_COUNTRY_CODES` defaults to `'in'` (India) — change this before using the app anywhere else.** It's a hard filter passed to Nominatim, not a ranking preference: results outside the listed country are never considered. Set it to your own ISO code(s), or `''` for worldwide search.
- `NOMINATIM_URL` — the public default has a hard 1 req/sec limit ([usage policy](https://operations.osmfoundation.org/policies/nominatim/)). Self-hosting means importing an OSM extract yourself ([install docs](https://nominatim.org/release-docs/latest/admin/Installation/)) — budget real disk/time for anything beyond a small region.
- `VALHALLA_URL` — the public default is a [shared demo server](https://valhalla.github.io/demos/routing/), not an SLA-backed API. Self-hosting means building a routing graph from an OSM extract.
- `MAPILLARY_ACCESS_TOKEN`, `OTP2_URL` — both optional; leave empty to disable street-level imagery / transit mode respectively.
- `WEATHER_ENABLED` — set `false` to disable the weather badge (no Open-Meteo calls at all).
- `RESOLVE_MAPS_URL_BASE` — only matters for the [Android shell](#the-optional-android-shell): point it at your own deployment's origin before `npm run cap:sync`. Ignored on the web (always same-origin there).

If you change `MAP_STYLE_URL` to a self-hosted tile server, also update `TILE_HOSTS` at the top of `sw.js` — the service worker can't import `config.js`.

## Deploying

Static files, so GitHub Pages, Cloudflare Pages, or a Cloudflare Worker with static assets all work.

### Deploy your own copy (quick start — Cloudflare Worker)

This is the path this project itself uses, and the only one that gets the Google Maps link resolver working with zero manual config:

1. [Sign up for a free Cloudflare account](https://dash.cloudflare.com/sign-up) if you don't have one.
2. `npm install -g wrangler` then `wrangler login`.
3. Clone this repo and, from its root, run `wrangler deploy`. First run creates a new Worker.
4. Open the printed `https://<name>.<subdomain>.workers.dev` URL — that's your live app.
5. **Set `GEOCODE_COUNTRY_CODES` in `config.js` to your own country** before relying on search.
6. Optional: add a custom domain from the Cloudflare dashboard's Workers & Pages → Settings → Domains & Routes.

Redeploy with `wrangler deploy` again — **`wrangler.jsonc`'s `"name"` must keep matching the Worker's dashboard name** for this to update the same Worker instead of creating a new one.

### Other things worth knowing

- **`_headers`** (honored by Cloudflare Pages and Workers static assets) sets cache-control so app files revalidate instead of going stale in the CDN cache, plus baseline security headers (CSP, X-Frame-Options). GitHub Pages doesn't support this file.
- **Service worker versioning**: bump `SHELL_CACHE_NAME` in `sw.js` whenever you change a precached file, so returning visitors fetch the new version. The offline tile cache is separate and never purged this way — see [Troubleshooting](#troubleshooting) if a PWA update looks stale.
- **Resolving a `maps.app.goo.gl` short link needs a small server-side hop** — a browser can't read a cross-origin redirect's target itself. Supported on both a plain Worker (`worker.js`) and Cloudflare Pages (`functions/api/resolve-maps-url.js`), sharing logic in `lib/resolve-maps-url.js`. Not available on GitHub Pages (no server functions there) — full `google.com/maps` links still work everywhere since those already carry coordinates.

## Data freshness (OSM updates)

No update/fetch script here — freshness is entirely a property of whichever services `config.js` points at:

- **Map tiles**: OpenFreeMap rebuilds on its own schedule; self-hosted tiles need re-running your own tile-builder against a newer extract.
- **Geocoding**: the public Nominatim instance applies OSM's edit-replication feed (new edits typically appear within hours); a self-hosted instance can do the same via `nominatim replication`.
- **Routing/transit**: Valhalla and OpenTripPlanner build a static graph at setup time and do **not** auto-update — self-hosting either means your own cron job to rebuild periodically.
- **Mapillary** imagery is close to real-time (contributor-uploaded).

## The optional Android shell

The web app also works wrapped in [Capacitor](https://capacitorjs.com/) as a native Android app, specifically for reliable location tracking with the screen off (plain `watchPosition` isn't reliable once Android backgrounds the WebView). Needs Node/npm; the web app itself still doesn't.

```
npm install                  # @capacitor/core, @capacitor/android, the background-geolocation plugin
npm run cap:sync             # copies the web app into www/, syncs the android/ project
npx cap open android         # opens the project in Android Studio
```

**Don't want to build it yourself?** A pre-built APK: **[github.com/siddharth2798/osm-navigator/releases/latest/download/osm-navigator.apk](https://github.com/siddharth2798/osm-navigator/releases/latest/download/osm-navigator.apk)** — always the most recent release. It isn't distributed through Google Play, so Android will ask permission to install from this source the first time; only allow that for a source you trust, or build it yourself from source instead to avoid needing to make that call at all.

**Build requirements** (as checked into `android/`): Android Gradle Plugin `8.13.0` / Gradle `8.14.3`, needing **JDK 17** — a recent [Android Studio](https://developer.android.com/studio) manages this for you, and will prompt to install SDK Platform 36 if needed.

**Permissions**: `@capacitor-community/background-geolocation` declares what it needs in its own manifest, merged in automatically — no manual `AndroidManifest.xml` edits. Android 13+ separately needs the `POST_NOTIFICATIONS` runtime permission requested for the persistent tracking notification — see the [plugin's README](https://github.com/capacitor-community/background-geolocation#readme).

**Producing a release build**: `npx cap open android` gives a debug build for USB/emulator testing. A signed release APK needs your own keystore — this repo doesn't include one (never commit a keystore). Use Android Studio's **Build → Generate Signed Bundle/APK** wizard, or see [Capacitor's guide](https://capacitorjs.com/docs/android/deploying-to-google-play).

Also worth knowing: `@capacitor-community/background-geolocation`'s notification text is set once and can't update live afterward — [`@transistorsoft/capacitor-background-geolocation`](https://github.com/transistorsoft/capacitor-background-geolocation) supports that, at the cost of being a commercial plugin.

## Troubleshooting

- **A button seems to do nothing, or something fails silently**: turn on **Debug mode** (Help & documentation → Developer tools, or `?debug=resolver` in the URL) and retry — a step-by-step trace, plus any uncaught error anywhere in the app, appears on screen instead of failing invisibly.
- **Google Maps link resolution fails on one device but not another**: turn on Debug mode and retry. A quoted HTTP status with an HTML snippet (not JSON) means something in front of the Worker (Cloudflare's Bot Fight Mode/WAF, or a carrier proxy) is intercepting the request — check the zone's Security settings. Google's own "unusual traffic" interstitial page is already self-healed automatically and should recover on its own.
- **The PWA looks blank or stale after an update**: bump `SHELL_CACHE_NAME` in `sw.js` — a stale service-worker cache is almost always the cause. If bumping it doesn't help, unregister the service worker and clear the site's storage from DevTools, then reload.
- **A new Android "Share" sheet entry doesn't show up after updating**: remove and re-add the installed PWA to the home screen once — a plain reload isn't enough for Android to pick up a `share_target` manifest change.
- **Search returns nothing, or wrong-country results, right after self-hosting**: see the `GEOCODE_COUNTRY_CODES` callout above — the default is India-only.
- **Voice guidance sounds much quieter than music over a car's Bluetooth**: not this app under-setting anything — Android commonly routes browser text-to-speech over the Bluetooth **SCO** channel (phone-call quality, fixed volume, not adjustable from any normal volume slider) rather than the **A2DP** channel music uses. No fix is available from a plain browser/PWA; the only real fix is a native Android `TextToSpeech` call with the navigation-guidance audio attribute, in the Capacitor shell specifically (not yet implemented).
- **An Android-shell-only bug reappears after a rebuild that should have fixed it**: the WebView's Cache Storage and any registered service worker persist across a rebuild (only a full uninstall or clearing app storage wipes them) — this is why the app now skips registering a service worker inside the native shell entirely and self-heals any leftover one on launch.

## Known limitations

- **Ferry-only-access landmarks**: some pedestrianized OSM landmarks (Gateway of India in Mumbai is the confirmed example) have no drivable road access in Valhalla's graph at all except tourist ferry piers — the app warns rather than silently showing an absurd route, but can't route around a gap in the underlying map data.
- **EV charging search is genuinely sparse** in India's current OSM coverage.
- **Transit mode** covers planning/rendering only, not live GPS-guided transit navigation.
- **Elevation profile** depends on Valhalla's `/height` action being enabled on whichever server you point at.
- **Android shell** — built and running on a real device now, but background tracking with the screen off and the Bluetooth car-audio question (above) are both still open.
- **The idle location marker's compass wedge** needs a real magnetometer — without one (or if permission is denied), it falls back to GPS-derived heading.

## Contributing

Bug reports and pull requests are welcome via [GitHub Issues/PRs](https://github.com/siddharth2798/osm-navigator) — see [CONTRIBUTING.md](CONTRIBUTING.md) for scope and what's explicitly out of scope before opening a PR that adds it.

## License

[MIT](LICENSE) — do whatever you want with it, including your own fork with your own services configured.
