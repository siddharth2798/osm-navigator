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
- **EV charging station details** via Open Charge Map — connector type, power, operator, cost, and an honestly-labeled operational status ("Reported operational · checked 4 months ago", not a live "in use" signal — see the config comment for why), with a full-screen "View full details" page listing every connector, operator contact info, address, and access notes. Falls back to a plain OSM pin with no detail on a deployment with no Open Charge Map key set up (see `OPENCHARGEMAP_ENABLED` below).
- **Paste a Google Maps link** — a full `google.com/maps` URL or `maps.app.goo.gl` short link resolves straight to that place, for gaps in OpenStreetMap's own coverage — including places with no street address at all (Google's Plus Codes decode automatically). Saving one files it into a "To add to OSM" list with the original link kept alongside it. Also registers as an Android **Share target**, so sharing a place from the Google Maps app resolves it here directly.
- **Directions** — multi-stop routing (up to 8, drag to reorder), a plain-text "X to Y" shortcut in the search box (recognizes "Home"/"Work"/"my location"), Drive/Walk/Transit modes, avoid-tolls/avoid-highways. Alternate-route cards lead with distance, not Valhalla's time estimate — that estimate has no live traffic behind it at all.
- **Long-press to pin a place** (4-second press, ignores multi-touch/pinch) — fills the search box, or sets it as the destination directly if you're already mid-trip.
- **Your location, always visible** — a live "you are here" marker with a heading wedge, shown automatically as soon as GPS resolves when the app opens (no need to tap anything first), on or off navigation, and toggleable from the locate button.
- **Satellite view**, **Home & Work shortcuts**, **elevation profile** for walking routes.
- **Turn-by-turn navigation** — live position arrow, traveled-route dulling, the screen stays awake for the whole drive, arrival is detected automatically. Survives a mid-drive browser reload (resumes exactly where it left off) and reroutes onto whatever road you actually took, not just "U-turn back." On the [Android shell](#the-optional-android-shell), minimizing the app while navigating auto-enters **Picture-in-Picture** — a small floating turn-card (arrow, next instruction, distance, ETA) instead of losing the map entirely.
- **Voice guidance** — an immediate "Starting navigation" call-out (with the first instruction) the moment you tap Start, so you're never left wondering whether it's actually on; early and near turn prompts, both scaled to your actual driving speed (a fixed distance is early at highway speed and dangerously late in slow traffic) rather than a flat distance, natural phrasing (roundabout exit counts, "slight" instead of "bear"), a mute/important-only/full toggle, a distinct alert tone on deviation, a "continue straight for X km" call-out on long stretches, and combined single-prompt handling for two turns too close together to announce separately.
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
- `USE_SELF_HOSTED_VALHALLA` — true by default, but that flag alone does nothing sensitive: the real gate is `SELF_HOSTED_VALHALLA_URL`, which lives ONLY as a Cloudflare secret/variable, never in `config.js` — a personal server's real address doesn't belong in a file shipped to every visitor's browser. Set it via `wrangler secret put SELF_HOSTED_VALHALLA_URL` for a plain Worker, or your Pages project's Settings → Environment variables (as a secret) for Cloudflare Pages; the app calls this deployment's own `/api/valhalla-route` / `/api/valhalla-height` instead, which attach the real address server-side (see `lib/valhalla-proxy.js`). If it isn't set on a given deployment, those return `501` and the app falls back to `VALHALLA_URL` for that request — see `fetchValhalla` in `app.js`. The in-app **Developer tools → Self-hosted Valhalla** toggle overrides this per device at runtime (turning it off there always goes straight to `VALHALLA_URL`, bypassing the proxy attempt). **`SELF_HOSTED_VALHALLA_COVERAGE_BBOX` is not sensitive and stays in `config.js` — but it defaults to this project's maintainer's own extract coverage (greater Kochi), not a generic default; change it (or set it to `null`) before relying on this if you self-host Valhalla somewhere else.** Left pointing at someone else's bounds, your own self-hosted instance would just never actually get tried — see the comment block above it in `config.js`.
- `MAPILLARY_ACCESS_TOKEN`, `OTP2_URL` — both optional; leave empty to disable street-level imagery / transit mode respectively.
- `OPENCHARGEMAP_ENABLED` — true by default, same pattern as `USE_SELF_HOSTED_VALHALLA` above: this flag alone is harmless, the real gate is a free [Open Charge Map API key](https://openchargemap.org/site/develop/api) set as a Cloudflare secret — `wrangler secret put OPENCHARGEMAP_API_KEY` for a plain Worker, or your Pages project's Settings → Environment variables (as a secret, not a plain variable) for Cloudflare Pages. The key never goes in `config.js` — the app calls this deployment's own `/api/opencharge-poi` instead, which attaches the key server-side (see `lib/opencharge-poi.js`). If the secret isn't set, `/api/opencharge-poi` returns `501` and EV search falls back to plain OSM search with no error shown. Only works on the Cloudflare Worker/Pages deployment paths (same requirement as the Google Maps link resolver below) — no server-side hop on plain static hosting. Not a live "is it free right now" feature either way — see the config comment for why (short version: that data sits behind OCPI, which requires a registered business relationship with each charging network, not something a personal project can get).
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
- **EV charging details (`OPENCHARGEMAP_ENABLED`) need the same server-side hop**, for a different reason: keeping the Open Charge Map API key out of `config.js` (a public file) rather than a CORS limitation. Same dual Worker/Pages support (`lib/opencharge-poi.js`), same GitHub Pages limitation.
- **Self-hosted Valhalla (`USE_SELF_HOSTED_VALHALLA`) uses the same server-side-hop pattern** to keep a personal routing server's real address out of `config.js`. Same dual Worker/Pages support (`lib/valhalla-proxy.js`, `/api/valhalla-route`, `/api/valhalla-height`), same GitHub Pages limitation (falls straight through to `VALHALLA_URL` there, since there's no server-side hop to attach the address on).

## Data freshness (OSM updates)

No update/fetch script here — freshness is entirely a property of whichever services `config.js` points at:

- **Map tiles**: OpenFreeMap rebuilds on its own schedule; self-hosted tiles need re-running your own tile-builder against a newer extract.
- **Geocoding**: the public Nominatim instance applies OSM's edit-replication feed (new edits typically appear within hours); a self-hosted instance can do the same via `nominatim replication`.
- **Routing/transit**: Valhalla and OpenTripPlanner build a static graph at setup time and do **not** auto-update — self-hosting either means your own cron job to rebuild periodically.
- **Mapillary** imagery is close to real-time (contributor-uploaded).

## The optional Android shell

The web app also works wrapped in [Capacitor](https://capacitorjs.com/) as a native Android app, specifically for reliable location tracking — and voice guidance — with the screen off or the app minimized (plain `watchPosition` isn't reliable once Android backgrounds the WebView, and Android's own `WebView.onPause()` freezes all JS execution on top of that). Needs Node/npm; the web app itself still doesn't.

```
npm install                  # @capacitor/core, @capacitor/android, background-geolocation/text-to-speech/app plugins
npm run cap:sync             # copies the web app into www/, syncs the android/ project
npx cap open android         # opens the project in Android Studio
```

**Don't want to build it yourself?** A pre-built APK: **[github.com/siddharth2798/osm-navigator/releases/latest/download/osm-navigator.apk](https://github.com/siddharth2798/osm-navigator/releases/latest/download/osm-navigator.apk)** — always the most recent release. It isn't distributed through Google Play, so Android will ask permission to install from this source the first time; only allow that for a source you trust, or build it yourself from source instead to avoid needing to make that call at all.

**Build requirements** (as checked into `android/`): Android Gradle Plugin `8.13.0` / Gradle `8.14.3`, needing **JDK 21** (`@capacitor/android` 8.x's own `build.gradle` sets Java 21 source/target compatibility) — a recent [Android Studio](https://developer.android.com/studio) bundles its own JDK that already satisfies this and will prompt to install SDK Platform 36 if needed.

**Permissions**: `@capacitor-community/background-geolocation` declares what it needs in its own manifest, merged in automatically — no manual `AndroidManifest.xml` edits. Android 13+ separately needs the `POST_NOTIFICATIONS` runtime permission requested for the persistent tracking notification — see the [plugin's README](https://github.com/capacitor-community/background-geolocation#readme).

**Producing a release build**: `npx cap open android` gives a debug build for USB/emulator testing. A signed release APK needs your own keystore — this repo doesn't include one (never commit a keystore). Use Android Studio's **Build → Generate Signed Bundle/APK** wizard, or see [Capacitor's guide](https://capacitorjs.com/docs/android/deploying-to-google-play).

**CI-built APK** (`.github/workflows/daily-release.yml`): builds and attaches `osm-navigator.apk` to each day's release automatically — this is what the download link above always points at. It signs with the same keystore you'd use locally, read from four repo secrets so the keystore itself is never committed:

```
base64 -i your-release-key.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD --body "..."
gh secret set ANDROID_KEY_ALIAS --body "..."
gh secret set ANDROID_KEY_PASSWORD --body "..."
```

Without these, the daily release is still created, just without an APK attached.

Also worth knowing: `@capacitor-community/background-geolocation`'s notification text is set once and can't update live afterward — [`@transistorsoft/capacitor-background-geolocation`](https://github.com/transistorsoft/capacitor-background-geolocation) supports that, at the cost of being a commercial plugin.

**Picture-in-Picture on some OEM Android skins (e.g. MIUI/HyperOS) may need a manual permission grant.** MIUI in particular gates PiP behind its own per-app permission (Settings → Privacy protection → Special permissions → Picture-in-picture), defaulted off for every non-preinstalled app — and a sideloaded APK can fail to even appear in that list until the permission is touched once. If PiP doesn't auto-enter when minimizing during navigation, grant it directly instead of hunting through settings menus:
```
adb shell appops set com.navigator.app PICTURE_IN_PICTURE allow
```
`adb logcat -s NavPip` after minimizing shows exactly why it didn't enter (SDK too low, OS/OEM declined, device doesn't support PiP at all, or an exception) if it's still not working after that.

## Troubleshooting

- **A button seems to do nothing, or something fails silently**: turn on **Debug mode** (Help & documentation → Developer tools, or `?debug=resolver` in the URL) and retry — every `console.log`/`warn`/`error` anywhere in the app (not just this app's own instrumentation — any library it loads too), plus any uncaught error, appears on screen instead of only being visible in devtools. This is the only practical way to see what actually happened on a real Android device, where devtools isn't reachable.
- **Google Maps link resolution fails on one device but not another**: turn on Debug mode and retry. A quoted HTTP status with an HTML snippet (not JSON) means something in front of the Worker (Cloudflare's Bot Fight Mode/WAF, or a carrier proxy) is intercepting the request — check the zone's Security settings. Google's own "unusual traffic" interstitial page is already self-healed automatically and should recover on its own.
- **The PWA looks blank or stale after an update**: bump `SHELL_CACHE_NAME` in `sw.js` — a stale service-worker cache is almost always the cause. If bumping it doesn't help, unregister the service worker and clear the site's storage from DevTools, then reload.
- **A new Android "Share" sheet entry doesn't show up after updating**: remove and re-add the installed PWA to the home screen once — a plain reload isn't enough for Android to pick up a `share_target` manifest change.
- **Search returns nothing, or wrong-country results, right after self-hosting**: see the `GEOCODE_COUNTRY_CODES` callout above — the default is India-only.
- **Voice guidance was silent in the Android shell**: Android's embedded WebView (unlike a normal Chrome tab) has never implemented the Web Speech Synthesis API at all — `speak()` was calling into an API that simply doesn't exist there, silently. Fixed by using `@capacitor-community/text-to-speech` (real native `android.speech.tts.TextToSpeech`) inside the shell specifically; the web/PWA build is untouched and still uses the browser's own Web Speech API. As a side effect this should also fix voice guidance sounding quieter than music over a car's Bluetooth — browser text-to-speech is commonly routed over the Bluetooth **SCO** channel (phone-call quality, fixed volume) rather than the **A2DP** channel music uses, while native `TextToSpeech` defaults to the music stream instead.
- **Voice guidance/navigation stops the moment the Android shell is minimized or the screen locks**: Capacitor's `BridgeActivity.onPause()` pauses its WebView, and `WebView.onPause()` freezes all JS timers and JS callback delivery for it — so even though `@capacitor-community/background-geolocation`'s own foreground service keeps delivering real GPS fixes from native code the whole time, the JS code that turns those fixes into a spoken instruction never got to run. Fixed in `MainActivity.java`: `onPause()` immediately calls `getBridge().getWebView().onResume()`, which stops the WebView from independently freezing on top of a process that foreground service is already keeping alive.
- **An Android-shell-only bug reappears after a rebuild that should have fixed it**: the WebView's Cache Storage and any registered service worker persist across a rebuild (only a full uninstall or clearing app storage wipes them) — this is why the app now skips registering a service worker inside the native shell entirely and self-heals any leftover one on launch.
- **The Android shell asks for the location *permission* but doesn't turn on the device's Location *service***: these are two different things — granting the permission (handled by `@capacitor-community/background-geolocation`) doesn't help if Location is toggled off in Android's system settings entirely, and that plugin has no way to prompt for the second one on its own (confirmed by reading its source). Fixed via a small custom plugin (`LocationSettingsPlugin.java`/`MainActivity.ensureLocationEnabled`) that uses Play Services' `SettingsClient` to show Android's own "Turn on Location?" system dialog before a watch starts, called from `native-location.js`. If you still see "Lost GPS signal" instead of that dialog, the device likely has no Google Play Services — that path falls back to the plain error message (now correctly distinguished from a permission denial) instead.
- **Google Maps link resolution fails with "Failed to fetch" in the Android shell specifically (works fine on web)**: this was a real bug, now fixed — `/api/resolve-maps-url` never sent CORS headers, since the web build always calls it same-origin (a relative path) where CORS is irrelevant. The Android shell is the one caller that hits it cross-origin (its own origin is `https://localhost`, calling the deployed Worker's real domain via `RESOLVE_MAPS_URL_BASE`), and without `Access-Control-Allow-Origin`, the browser blocks reading the response entirely — surfacing as a bare "Failed to fetch" with zero information about what the server actually returned. If you're running an older deployment, redeploy after pulling this fix.
- **Routing fails with "Could not reach the routing service"/"Failed to fetch" against a self-hosted Valhalla, but the public demo server works fine**: `valhalla_service`'s own built-in HTTP server doesn't implement the `OPTIONS` method at all (confirmed live: it returns `405`) — the public demo server only works because it sits behind an nginx reverse proxy that answers CORS preflight requests before they ever reach Valhalla. A bare `application/json` POST body triggers exactly that preflight; a plain Docker/binary Valhalla deployment with no reverse proxy in front (the common self-host setup) has no way to answer it, so the browser blocks the actual request before it's even sent. Already fixed here — the app sends `Content-Type: text/plain` instead (one of the three CORS-"simple" content types, so no preflight is triggered at all), and Valhalla parses the JSON body correctly regardless of what content-type it's declared as.
- **Routing/elevation silently uses the public Valhalla server even with `USE_SELF_HOSTED_VALHALLA: true`**: this is expected, not a bug, when the `SELF_HOSTED_VALHALLA_URL` Cloudflare secret hasn't been set on this deployment — `/api/valhalla-route`/`/api/valhalla-height` respond `501`, and the app transparently retries against `VALHALLA_URL`, with no error shown (Debug mode will show a "falling back to the public server" line). Confirm the secret is actually set (`wrangler secret list` for a plain Worker) rather than assuming the flag alone is enough. If the self-hosted server IS configured but genuinely unreachable, that's treated as a real error instead and surfaces one — it doesn't silently fall back the way a missing secret does.
- **EV charging search silently reverts to plain OSM pins even with `OPENCHARGEMAP_ENABLED: true`**: this is expected, not a bug, when the `OPENCHARGEMAP_API_KEY` Cloudflare secret hasn't been set yet (or isn't reachable on this deployment path — see the config comment) — `/api/opencharge-poi` responds `501`, and the app falls back to the same OSM-based search it always used before this feature existed, with no error shown. Confirm the secret is actually set (`wrangler secret list` for a plain Worker) rather than assuming the flag alone is enough.
- **EV charging search shows an error instead of results**: an invalid/expired `OPENCHARGEMAP_API_KEY` makes Open Charge Map's own API reject the proxied request (it has no anonymous/demo access at all, confirmed live) — this surfaces as a real error, unlike the missing-secret case above, since the key being wrong is a different problem than the feature never being set up. Check the key at [openchargemap.org](https://openchargemap.org/site/develop/api).

## Known limitations

- **Ferry-only-access landmarks**: some pedestrianized OSM landmarks (Gateway of India in Mumbai is the confirmed example) have no drivable road access in Valhalla's graph at all except tourist ferry piers — the app warns rather than silently showing an absurd route, but can't route around a gap in the underlying map data.
- **EV charging search is genuinely sparse** in India's current OSM coverage — turn on `OPENCHARGEMAP_ENABLED` (needs a Cloudflare secret too, see above) for real connector/power/operator/cost/status detail from a dedicated EV charging database instead. Even then, "status" is Open Charge Map's own community-maintained operational flag (working/broken/planned), not live occupancy — no data source accessible to a personal project actually has that; see the config comment for why OCPI/OCPP don't help.
- **Transit mode** covers planning/rendering only, not live GPS-guided transit navigation.
- **Elevation profile** depends on Valhalla's `/height` action being enabled on whichever server you point at.
- **Android shell** — built and running on a real device now, including working voice guidance and background tracking/guidance with the screen off or the app minimized (see the "Google Maps link resolution fails" troubleshooting entries above for other shell-specific quirks already fixed).
- **Picture-in-Picture mini view** (this branch only, not `main` — an experimental feature not yet promoted): while actively navigating, leaving the app (Home button, switching apps) automatically drops into a small floating window showing the next instruction, distance, and ETA — matching Google Maps' own PiP behavior. Implemented as a small custom native plugin (`NavPipPlugin.java`) plus a simplified native turn-card view (`res/layout/pip_turn_card.xml`) that MainActivity swaps in for the WebView only while in PiP; app.js pushes live turn-by-turn updates to it via `native-pip.js`, guarded the same way every other native-only call in this codebase is.
- **The idle location marker's compass wedge** needs a real magnetometer — without one (or if permission is denied), it falls back to GPS-derived heading.

## Contributing

Bug reports and pull requests are welcome via [GitHub Issues/PRs](https://github.com/siddharth2798/osm-navigator) — see [CONTRIBUTING.md](CONTRIBUTING.md) for scope and what's explicitly out of scope before opening a PR that adds it.

## License

[MIT](LICENSE) — do whatever you want with it, including your own fork with your own services configured.
