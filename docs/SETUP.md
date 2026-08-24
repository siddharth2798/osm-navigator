# Self-hosting & configuration

## Running it locally

No build step. Clone or copy the folder, serve it as static files:

```
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

`app.js` is loaded as an ES module, so `file://` won't work — it has to be served over `http://` or `https://`.

## Configuring your own services

Every URL and tunable lives at the top of **`config.js`**, each commented with what it does — that file, not this doc, is the source of truth.

- **`GEOCODE_COUNTRY_CODES`** defaults to `'in'` (India) — change this before using the app anywhere else. It's a hard filter passed to Nominatim, not a ranking preference. Set your own ISO code(s), or `''` for worldwide search.
- **`NOMINATIM_URL`** — the public default has a hard 1 req/sec limit ([usage policy](https://operations.osmfoundation.org/policies/nominatim/)). Self-hosting means importing an OSM extract yourself ([install docs](https://nominatim.org/release-docs/latest/admin/Installation/)).
- **`VALHALLA_URL`** — the public default is a [shared demo server](https://valhalla.github.io/demos/routing/), not an SLA-backed API. Self-hosting means building a routing graph from an OSM extract.
- **`USE_SELF_HOSTED_VALHALLA`** — true by default but harmless on its own: the real gate is `SELF_HOSTED_VALHALLA_URL`, which lives **only** as a Cloudflare secret/variable, never in `config.js` (a personal server's address doesn't belong in a file shipped to every visitor). Set it via `wrangler secret put SELF_HOSTED_VALHALLA_URL` (plain Worker) or your Pages project's Settings → Environment variables (as a secret). The app calls this deployment's own `/api/valhalla-route`/`/api/valhalla-height` (see `lib/valhalla-proxy.js`), which attach the real address server-side; if the secret isn't set, those return `501` and the app falls back to `VALHALLA_URL`. The in-app **Settings → Self-hosted Valhalla** toggle overrides this per device. `SELF_HOSTED_VALHALLA_COVERAGE_BBOX` isn't sensitive and stays in `config.js` — but it defaults to this project's maintainer's own extract coverage (greater Kochi), not a generic default. Change it (or set it `null`) before relying on this elsewhere, or your own self-hosted instance will just never get tried.
- **`MAPILLARY_ACCESS_TOKEN`**, **`OTP2_URL`** — optional; leave empty to disable street-level imagery / transit mode.
- **`OPENCHARGEMAP_ENABLED`** — same pattern as Valhalla: the real gate is a free [Open Charge Map API key](https://openchargemap.org/site/develop/api) set as a Cloudflare secret (`OPENCHARGEMAP_API_KEY`), never in `config.js`. Missing secret → `/api/opencharge-poi` returns `501` and EV search falls back to plain OSM search, no error shown. Needs a Worker/Pages deployment — no server hop on plain static hosting. "Status" is Open Charge Map's own community-maintained flag either way, not live occupancy — no data source accessible to a personal project has that (it sits behind OCPI, which needs a registered business relationship per network).
- **`WEATHER_ENABLED`** — `false` disables the weather badge (no Open-Meteo calls at all).
- **`TOMTOM_FEATURES_ENABLED`** — optional, same pattern as Valhalla/Open Charge Map above: gates two independent features — live traffic (route-option comparison at planning time plus in-drive check-ins, TomTom Flow Segment Data, 20K free requests/month — see the `TRAFFIC_*` tunables in `config.js`) and a Places Search fallback for category searches that come back empty from Nominatim (5K–10K free requests/month depending on endpoint). Planning-time comparison samples every alternate shown, so a trip with 2–3 meaningfully different options can use a noticeable slice of that free tier faster than the in-drive check-ins alone. Doesn't hold an API key itself — the real key lives only as a Cloudflare secret (`TOMTOM_API_KEY`, read server-side by `functions/api/traffic.js`/`functions/api/places.js`). Get a free key at [developer.tomtom.com](https://developer.tomtom.com), set it as that secret, deploy, then flip this flag to `true`. Leave `false` to disable both features entirely — no calls to `/api/traffic` or `/api/places` at all. The in-app **Settings → TomTom live traffic** toggle overrides this per device, same pattern as the Self-hosted Valhalla toggle above — though turning it on there does nothing if this deployment never configured the secret. **Cloudflare Pages only for now** — unlike Valhalla/Open Charge Map/the Maps resolver, there's no matching `worker.js` route or shared `lib/` module yet, so this doesn't work on the plain Cloudflare Worker deployment path this project otherwise uses.
- **`RESOLVE_MAPS_URL_BASE`** — only matters for the [Android shell](ANDROID.md): point it at your own deployment's origin before `npm run cap:sync`. Ignored on the web.

Changing `MAP_STYLE_URL` to a self-hosted tile server? Also update `TILE_HOSTS` at the top of `sw.js` — the service worker can't import `config.js`.

## Deploying

Static files, so GitHub Pages, Cloudflare Pages, or a Cloudflare Worker with static assets all work.

### Quick start — Cloudflare Worker (what this project itself uses)

The only path that gets the Google Maps link resolver working with zero manual config:

1. [Sign up for a free Cloudflare account](https://dash.cloudflare.com/sign-up) if you don't have one.
2. `npm install -g wrangler` then `wrangler login`.
3. Clone this repo and, from its root, run `wrangler deploy`. First run creates a new Worker.
4. Open the printed `https://<name>.<subdomain>.workers.dev` URL — that's your live app.
5. **Set `GEOCODE_COUNTRY_CODES` in `config.js` to your own country** before relying on search.
6. Optional: add a custom domain from the Cloudflare dashboard's Workers & Pages → Settings → Domains & Routes.

Redeploy with `wrangler deploy` again — **`wrangler.jsonc`'s `"name"` must keep matching the Worker's dashboard name** for this to update the same Worker instead of creating a new one.

### Other things worth knowing

- **`_headers`** (honored by Cloudflare Pages and Workers static assets) sets cache-control so app files revalidate instead of going stale, plus baseline security headers (CSP, X-Frame-Options). GitHub Pages doesn't support this file.
- **Service worker versioning**: bump `SHELL_CACHE_NAME` in `sw.js` whenever you change a precached file, so returning visitors fetch the new version. The offline tile cache is separate and never purged this way — see [Troubleshooting](TROUBLESHOOTING.md) if a PWA update looks stale.
- **Resolving a `maps.app.goo.gl` short link needs a small server-side hop** — a browser can't read a cross-origin redirect's target itself. Supported on both a plain Worker (`worker.js`) and Cloudflare Pages (`functions/api/resolve-maps-url.js`), sharing logic in `lib/resolve-maps-url.js`. Not available on GitHub Pages — full `google.com/maps` links still work everywhere since those already carry coordinates.
- **EV charging details need the same server-side hop**, for a different reason: keeping the Open Charge Map API key out of `config.js` rather than a CORS limitation. Same dual Worker/Pages support (`lib/opencharge-poi.js`), same GitHub Pages limitation.
- **Self-hosted Valhalla uses the same pattern** to keep a personal routing server's address out of `config.js` (`lib/valhalla-proxy.js`, `/api/valhalla-route`, `/api/valhalla-height`) — falls straight through to `VALHALLA_URL` on GitHub Pages, since there's no server-side hop available there.

## Data freshness (OSM updates)

No update/fetch script here — freshness is entirely a property of whichever services `config.js` points at:

- **Map tiles**: OpenFreeMap rebuilds on its own schedule; self-hosted tiles need re-running your own tile-builder against a newer extract.
- **Geocoding**: the public Nominatim instance applies OSM's edit-replication feed (new edits typically appear within hours); a self-hosted instance can do the same via `nominatim replication`.
- **Routing/transit**: Valhalla and OpenTripPlanner build a static graph at setup time and do **not** auto-update — self-hosting either means your own cron job to rebuild periodically.
- **Mapillary** imagery is close to real-time (contributor-uploaded).
