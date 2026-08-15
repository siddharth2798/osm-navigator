// ============================================================================
// CONFIG — everything you'd want to change when pointing this app at your
// own self-hosted services lives here. Nothing else in the codebase should
// need editing for that.
// ============================================================================
export const CONFIG = {
  // How long any single network request to a routing/geocoding service is
  // allowed to hang before the app gives up and shows an error, in ms. A
  // public demo server under load can be slow to respond rather than
  // failing outright — without a ceiling, "Finding route…" would just spin
  // forever instead of eventually failing in a way you can retry.
  FETCH_TIMEOUT_MS: 20000,

  // How long to wait for the map's style/tiles to finish loading before
  // giving up — guards every "touch a map source" call that would otherwise
  // hang forever if the map never fires its own 'load' event.
  MAP_LOAD_TIMEOUT_MS: 15000,

  // --- Geocoding: self-hosted Nominatim -------------------------------------
  // Point this at your own instance, e.g. 'https://geocode.mydomain.com'.
  // Default is the public demo instance, which is fine for local testing but
  // enforces a hard 1 request/second limit and asks that you identify your
  // app via a User-Agent header (browsers don't let page JS set that header,
  // so please switch to your own instance before relying on this day to day).
  NOMINATIM_URL: 'https://nominatim.openstreetmap.org',

  // Minimum gap between outgoing Nominatim requests, in ms. Combined with the
  // debounce on the input field, this keeps us under the 1 req/sec limit.
  NOMINATIM_MIN_INTERVAL_MS: 1100,

  // How long to wait after the user stops typing before firing a search.
  NOMINATIM_DEBOUNCE_MS: 400,

  // Restricts search/reverse-geocode results to these ISO 3166-1 alpha-2
  // country codes (comma-separated, e.g. 'in,np' for India + Nepal). This is
  // a hard filter, not a soft ranking bias — Nominatim doesn't offer a soft
  // version. Set to '' to search worldwide. Confirmed via direct testing
  // that this meaningfully improves disambiguation for short/generic
  // queries: searching "Gateway" with no bias returns unrelated suburbs in
  // Arkansas/Florida/Wisconsin; with countrycodes=in it correctly surfaces
  // "Gateway of India" among other Indian "Gateway ..." places.
  GEOCODE_COUNTRY_CODES: 'in',

  // Location-biased search ("EV charging near Gateway of India") and one-tap
  // POI category chips both search within a bounding box around an anchor
  // point, in degrees (~0.03° is roughly 3km at Indian latitudes). Confirmed
  // via testing this default finds most categories fine in a dense city;
  // the wider radius is the automatic retry when a category (EV charging
  // especially, which has sparse OSM coverage in India) comes back empty.
  GEOCODE_NEAR_RADIUS_DEG_DEFAULT: 0.03,
  GEOCODE_NEAR_RADIUS_DEG_WIDE: 0.12,

  // --- Routing: self-hosted Valhalla ------------------------------------------
  // Point this at your own instance, e.g. 'https://valhalla.mydomain.com'.
  // Default is the public OpenStreetMap Valhalla demo server — fair-use policy
  // asks for roughly 1 call/second, enforced below.
  VALHALLA_URL: 'https://valhalla1.openstreetmap.de',
  VALHALLA_MIN_INTERVAL_MS: 1100,

  // Optional second Valhalla instance, tried before the one above. True by
  // default — but like OPENCHARGEMAP_ENABLED below, this flag alone does
  // nothing sensitive; the real gate is SELF_HOSTED_VALHALLA_URL, which
  // lives ONLY as a Cloudflare secret/variable on your Worker or Pages
  // deployment, never in this file (this file is a plain static asset
  // shipped to every visitor's browser — a personal server's real address
  // doesn't belong here). The client calls this deployment's own
  // /api/valhalla-route and /api/valhalla-height (see lib/valhalla-proxy.js,
  // worker.js, functions/api/valhalla-route.js, functions/api/valhalla-height.js),
  // which attach the real address server-side. For a plain Worker:
  // `wrangler secret put SELF_HOSTED_VALHALLA_URL`. For Cloudflare Pages:
  // dashboard → your project → Settings → Environment variables → add it as
  // a secret (encrypted) variable, not a plain one.
  //   If it isn't set on a given deployment, /api/valhalla-route and
  //   /api/valhalla-height return 501 and the app falls back to the public
  //   VALHALLA_URL above for that request — see fetchValhalla in app.js.
  //   That costs one extra same-edge round trip per route/elevation request
  //   on a deployment with nothing self-hosted configured; set this to
  //   `false` to skip it entirely and always go straight to VALHALLA_URL.
  //
  // The "Self-hosted Valhalla" toggle in Developer tools overrides this at
  // runtime per device (see useSelfHostedValhalla in app.js) — turning it
  // off there always goes straight to VALHALLA_URL, bypassing the proxy
  // attempt regardless of this default.
  //
  // SELF_HOSTED_VALHALLA_COVERAGE_BBOX matters when your self-hosted graph
  // only covers part of the world (e.g. a single BBBike/Geofabrik extract,
  // not a full-planet build): a request with any waypoint outside the box
  // has no route data available there at all — set it to your extract's
  // bounds, or leave it `null` if your instance covers everywhere you'll
  // ever route (or if nothing is self-hosted on this deployment at all).
  // Anything outside the box goes straight to VALHALLA_URL, no proxy
  // attempt — but this is a coverage check only, not a health check: if the
  // self-hosted instance is unreachable for a waypoint that IS inside the
  // box, that request fails outright rather than silently retrying against
  // VALHALLA_URL (confirmed live; unlike the 501/not-configured case above,
  // this is a real error worth surfacing, not silently masking).
  //
  // **If you're deploying your own copy of this app, change (or null out)
  // the bounds below** — they're this project's maintainer's own self-hosted
  // extract coverage (greater Kochi + surrounding highways), not a generic
  // default. Left as-is, waypoints outside that area on YOUR deployment just
  // go straight to VALHALLA_URL (harmless), but your own self-hosted
  // instance — if you set one up at a different location — would never
  // actually get tried, since none of your waypoints would fall inside
  // someone else's bounding box. Same category of thing as
  // GEOCODE_COUNTRY_CODES above defaulting to India.
  USE_SELF_HOSTED_VALHALLA: true,
  SELF_HOSTED_VALHALLA_MIN_INTERVAL_MS: 200,
  SELF_HOSTED_VALHALLA_COVERAGE_BBOX: { minLon: 76.127, minLat: 9.563, maxLon: 77.037, maxLat: 10.268 },

  // Caps how many shape points get sent to Valhalla's /height action when
  // building a walking route's elevation profile — keeps that request body
  // small on long routes. Only used for walk-mode routes.
  ELEVATION_MAX_POINTS: 150,

  // --- Map tiles: OpenFreeMap (no API key needed) -----------------------------
  MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',

  // --- Google Maps link resolver -----------------------------------------------
  // Only ever used inside the Android shell (Capacitor) — a normal web
  // deployment always calls /api/resolve-maps-url as a relative, same-origin
  // path instead (see the call site in app.js), regardless of what this is
  // set to, so changing it can never affect or break a plain web deployment.
  //
  // The Android shell needs this because its own origin is a local
  // asset-serving scheme with no backend of its own — a relative path there
  // silently resolves to nothing and falls back to being served index.html
  // instead (HTTP 200, content-type text/html, no JSON). This exact failure
  // was found live via the on-screen debug log: the trace showed the
  // "response" was literally the app's own <title>Navigator</title> page,
  // not a network error.
  //
  // If you're building the Android shell against your own self-hosted
  // Worker/Pages deployment, set this to its absolute origin (e.g.
  // 'https://your-worker.workers.dev') before running `npm run cap:sync`.
  RESOLVE_MAPS_URL_BASE: 'https://osm-navigator.siddharthshiv2798.workers.dev',

  // --- Navigation / voice guidance behaviour ----------------------------------
  // The far/near callout distances are speed-scaled (see dynamicVoiceLeadM in
  // app.js), not flat — matching Google Maps/Waze/TomTom convention of a
  // target TIME-of-lead at current speed rather than a fixed distance (a
  // flat 220m is ~27s of warning at 30km/h city driving but under 8s at
  // 100km/h highway speed — neither is right for both). These four values
  // are the *_LEAD_TIME_S target lead times and the *_MIN_M/*_MAX_M clamp
  // bounds that result is kept within, so it never collapses to nothing
  // while stopped or balloons unreasonably large at sustained high speed.
  //
  // Far callout ("in X meters, turn right"): ~10-20s lead is the commonly
  // cited range; 14s is the midpoint.
  VOICE_PROMPT_LEAD_TIME_S: 14,
  VOICE_PROMPT_MIN_M: 120,
  VOICE_PROMPT_MAX_M: 700,
  // Near callout ("turn right", no distance prefix): a deliberately
  // SHORTER lead time than the far callout (not just a smaller distance) —
  // "near" is fundamentally about time-to-maneuver, e.g. announcing this at
  // a fixed 80m out reads as ages away while crawling in traffic but
  // dangerously last-second at highway speed.
  VOICE_NEAR_LEAD_TIME_S: 5,
  VOICE_NEAR_MIN_M: 20,
  VOICE_NEAR_MAX_M: 140,
  // Last-resort fallback for dynamicVoiceLeadM (app.js), used only when
  // there's neither a live GPS speed NOR a fix-to-fix derived one yet —
  // effectively just the very first position fix of a trip, before
  // onPositionUpdate has a previous fix to derive speed from. Deliberately
  // kept comfortably ABOVE VOICE_PROMPT_MIN_M / VOICE_PROMPT_LEAD_TIME_S's
  // own break-even speed (120m / 14s ≈ 8.57 m/s) — 8.3 here previously sat
  // just BELOW that line (8.3 × 14 = 116.2 < 120), so this fallback always
  // collapsed to the 120m floor instead of "degrading to something sane"
  // as originally intended, which read aloud as a constant ~110m
  // regardless of actual speed (formatDistanceForSpeech floors to the
  // nearest 10m). 10 m/s (~36km/h) clears that break-even with real margin:
  // far callout → 140m, near callout → 50m.
  VOICE_DEFAULT_SPEED_MPS: 10,

  // Once the live position is within this many metres of the destination,
  // navigation ends automatically (same as tapping "End") and "You have
  // arrived at your destination" is spoken — see updateActiveManeuver.
  ARRIVAL_RADIUS_M: 10,

  // How many consecutive GPS fixes in a row need to land within
  // ARRIVAL_RADIUS_M before arrival is actually declared — a single stray
  // fix isn't enough. traveledM is measured as distance along the route
  // LINE to whichever point on it is nearest the live fix (turf's
  // nearestPointOnLine), with no guarantee that's monotonic or nearby in
  // reality: one noisy/multipath fix (confirmed disproportionately common
  // while walking, where speed is low enough that a single bad fix is a
  // large fraction of real progress) can snap to a point much further
  // along the line than the walker actually is — especially on a winding
  // route that passes close to itself — instantly satisfying the arrival
  // check and ending navigation (removing the live GPS marker) mid-trip.
  // Every other live-tracking decision in this app already requires this
  // kind of hysteresis before acting (see MANEUVER_ADVANCE_HYSTERESIS_M,
  // DEVIATION_CLEAR_THRESHOLD_M) — this is the same idea applied to the
  // one decision that was missing it entirely.
  ARRIVAL_CONFIRM_FIXES: 2,

  // Perpendicular distance (metres) from the route line beyond which the
  // driver is considered "off route". Lowered from the original 50m — user
  // feedback was that the app let you travel too far in the wrong direction
  // before recalculating.
  DEVIATION_THRESHOLD_M: 30,

  // How long (ms) the driver must remain continuously off-route before the
  // app automatically requests a new route. Lowered from the original 5000ms
  // alongside DEVIATION_THRESHOLD_M, for the same reason.
  DEVIATION_DURATION_MS: 3000,

  // Deliberately lower than DEVIATION_THRESHOLD_M (hysteresis): a road that
  // runs close to/parallel with the original route for a stretch can have
  // the driver's offset drift back and forth right around the trip
  // threshold, resetting the off-route timer on every dip below it and
  // never accumulating DEVIATION_DURATION_MS of continuous deviation — so a
  // real move onto a different road never actually triggers a reroute. Only
  // clearing the timer once offset drops meaningfully lower (not just
  // barely back under the trip line) avoids that flapping.
  DEVIATION_CLEAR_THRESHOLD_M: 20,

  // Same hysteresis idea as DEVIATION_CLEAR_THRESHOLD_M above, applied to
  // which maneuver is "current"/"next" instead of off-route detection.
  // updateActiveManeuver picks the active maneuver by comparing live
  // traveled-distance against each maneuver's cumulative start distance —
  // recomputed on every GPS fix. Near a maneuver boundary, GPS jitter
  // (commonly ±5-15m fix-to-fix) can straddle that exact boundary, flipping
  // which maneuver is "next" back and forth every fix — this is what
  // caused the nav banner to visibly flicker between two steps. Requiring
  // the live position to clear a boundary by this margin before actually
  // advancing (see updateActiveManeuver) absorbs that jitter. Deliberately
  // smaller than DEVIATION_CLEAR_THRESHOLD_M's 20m: that one only needs to
  // reject a sustained multi-second signal, this one only needs to survive
  // one or two noisy ticks right at a boundary — a larger value here would
  // stall advancement on real maneuver segments shorter than it (confirmed
  // live: a 23m segment between two turns is a real case, not a rarity).
  MANEUVER_ADVANCE_HYSTERESIS_M: 10,

  // Camera behaviour while auto-following during navigation.
  NAV_ZOOM: 17,
  NAV_PITCH: 45,
  FOLLOW_EASE_MS: 700,

  // Passed straight to navigator.geolocation.watchPosition.
  GEOLOCATION_OPTIONS: {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  },

  // --- Offline map tiles ---------------------------------------------------
  // Cache API name used for downloaded/opportunistically-cached map tiles.
  // NOTE: if you change MAP_STYLE_URL to a self-hosted style/tile server,
  // also update TILE_HOSTS at the top of sw.js — the service worker can't
  // import this file (Safari doesn't support module service workers yet),
  // so that one setting is duplicated there and must be kept in sync.
  TILE_CACHE_NAME: 'offline-tiles',
  OFFLINE_MIN_ZOOM_DEFAULT: 10,
  OFFLINE_MAX_ZOOM_DEFAULT: 16,
  OFFLINE_TILE_CONCURRENCY: 6,   // simultaneous tile fetches while downloading an area
  OFFLINE_TILE_MAX_RETRIES: 2,   // per-tile retries before it's counted as failed and skipped

  // --- Saved places ----------------------------------------------------------
  MAX_RECENT_TRIPS: 20,

  // --- Multi-stop routing -------------------------------------------------------
  MAX_STOPS: 8, // soft cap so the directions card doesn't grow unreasonably tall

  // --- Street-level imagery: Mapillary -----------------------------------------
  // Get a free client token at https://www.mapillary.com/dashboard/developers
  // (create an app, copy its "Client Token", starts with "MLY|..."). Leave
  // this empty to disable the feature entirely — no coverage layer, no
  // street-view buttons, no API calls. There is no public shared demo token
  // (unlike Nominatim/Valhalla's public instances) since Mapillary requires
  // every app to register its own.
  MAPILLARY_ACCESS_TOKEN: '',
  MAPILLARY_COVERAGE_MIN_ZOOM: 14, // below this zoom the coverage layer stays off (too many tiles, not useful at a glance)
  MAPILLARY_SEARCH_RADIUS_M: 60,   // how far from a tapped/picked point to look for the nearest image

  // --- EV charging details: Open Charge Map ------------------------------------
  // True by default — but this flag alone does nothing sensitive. The real
  // gate is OPENCHARGEMAP_API_KEY, which lives ONLY as a Cloudflare
  // secret/variable on your Worker or Pages deployment (free key: register
  // at https://openchargemap.org/site/develop/api), never in this file. This
  // file is a plain static asset shipped to every visitor's browser; a key
  // here would be public. The client calls this deployment's own
  // /api/opencharge-poi (see lib/opencharge-poi.js, worker.js,
  // functions/api/opencharge-poi.js), which attaches the real key
  // server-side — the browser never sees it. For a plain Worker:
  // `wrangler secret put OPENCHARGEMAP_API_KEY`. For Cloudflare Pages:
  // dashboard → your project → Settings → Environment variables → add it as
  // a secret (encrypted) variable, not a plain one.
  //   If the key isn't set on a given deployment, /api/opencharge-poi
  //   returns 501 and the app gracefully falls back to plain OSM
  //   amenity=charging_station search — see fetchNearbyChargingStations in
  //   app.js. Set this to `false` only if you want to skip that
  //   /api/opencharge-poi round-trip entirely (e.g. on a plain static host
  //   like GitHub Pages, which has no server-side hop to attach a key on
  //   anyway) and go straight to OSM search.
  //
  // Deliberately NOT a live "is this charger free right now" feature: Open
  // Charge Map's own StatusType is a community-maintained *operational* flag
  // (working / not working / planned), often stale by weeks or months — real
  // per-connector live occupancy only exists behind OCPI, which requires a
  // registered business relationship (eMSP status + bilateral contracts with
  // each charge point operator) that a personal project has no path to. What
  // this DOES get you: real connector type/power/operator/cost detail, plus
  // an honestly-labeled "last reported" status — see fetchNearbyChargingStations
  // in app.js.
  OPENCHARGEMAP_ENABLED: true,
  OPENCHARGEMAP_MIN_INTERVAL_MS: 1000,
  OPENCHARGEMAP_SEARCH_RADIUS_KM: 15,

  // --- Transit -------------------------------------------------------------
  // Point at a self-hosted OpenTripPlanner 2 instance loaded with your OSM
  // extract + a GTFS feed, e.g. 'https://otp.mydomain.com'. Leave empty and
  // the transit mode toggle simply never appears — there's no public OTP2
  // demo server to default to (unlike Valhalla), and a GTFS feed is specific
  // to whichever local transit agency you care about.
  OTP2_URL: '',

  // --- Weather badge -----------------------------------------------------
  // Shows current conditions (emoji + temperature) at a selected place, and
  // at the live GPS position while navigating. Backed by Open-Meteo — free,
  // keyless, CORS-enabled, no signup — so unlike every other external
  // service in this file there's no self-hosted alternative to point at
  // instead. Set to false to disable the feature entirely: no badge, no
  // calls to Open-Meteo, for a privacy-conscious user who'd rather not have
  // this app's GPS position leave the device even to a free/anonymous API.
  WEATHER_ENABLED: true,

  // --- Live traffic: TomTom -------------------------------------------------
  // Get a free API key at https://developer.tomtom.com (Flow Segment Data is
  // 20K free requests/month — plenty for a single personal user, since this
  // is only ever called a few times per drive, never continuously). Leave
  // empty to disable the feature entirely: no traffic indicator, no calls.
  TOMTOM_API_KEY: '',

  // A check-in only fires once BOTH this much time AND this much distance
  // have passed since the last one (whichever is satisfied later) — keeps a
  // long highway cruise from re-checking every few seconds just because the
  // clock ticked, and keeps dead-stopped traffic from re-checking every few
  // meters just because time passed.
  TRAFFIC_CHECK_MIN_INTERVAL_MS: 180000, // 3 min
  TRAFFIC_CHECK_MIN_DISTANCE_M: 1500,

  // Stop checking once this close to the destination — re-checking flow data
  // for a segment you're about to arrive at isn't useful.
  TRAFFIC_STOP_CHECKING_REMAINING_M: 1000,

  // How many points to sample ahead of the live position on each check-in,
  // evenly spaced over the next TRAFFIC_SAMPLE_AHEAD_M metres of the
  // *remaining* route (fewer/closer together if less than that remains).
  // One Flow Segment Data request per point, fired in parallel.
  TRAFFIC_SAMPLE_POINTS: 3,
  TRAFFIC_SAMPLE_AHEAD_M: 5000,

  // If the average of (currentSpeed / freeFlowSpeed) across all samples that
  // succeeded drops below this, show the "Heavy traffic ahead" indicator and
  // scale the live ETA line's remaining time by the inverse of that ratio.
  // At/above threshold: no indicator, no ETA adjustment.
  TRAFFIC_HEAVY_THRESHOLD: 0.6,
};
