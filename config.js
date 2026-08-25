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

  // Minimum silence enforced between two separate QUEUED spoken lines (see
  // speak() in app.js) — independent voice cues (a walk-mode incline
  // heads-up and a turn prompt, say) can each decide to speak on the very
  // same GPS tick with no coordination between them; without this, the
  // TTS engine plays them back to back with literally zero gap, which
  // reads as one garbled run-on line rather than two separate prompts.
  // Doesn't apply to a flush (queue: false) — those interrupt immediately
  // by design.
  VOICE_MIN_GAP_MS: 2000,

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

  // Walk-mode voice incline announcements ("Moderate incline for the next
  // 200 meters") — see deriveGradeSegments/checkInclineAnnouncement in
  // app.js. Grade % thresholds are rough real-world walking bands (a
  // sustained ~4% grade is noticeably more effort than flat ground; ~8%+
  // is the kind of slope that shows up as a distinctly steep street), not
  // a precise physiological cutoff. INCLINE_MIN_SEGMENT_M filters out
  // short GPS/DEM noise blips that aren't a real sustained hill.
  INCLINE_GRADE_MODERATE_PCT: 4,
  INCLINE_GRADE_STEEP_PCT: 8,
  INCLINE_MIN_SEGMENT_M: 30,
  // Same dynamicVoiceLeadM() speed-scaling as the turn-by-turn callouts
  // above, just tuned for walking pace specifically: walking speed varies
  // far less than driving speed, so a shorter, narrower lead window still
  // gives a consistent few seconds' notice without announcing a hill so
  // early it's forgotten (or so late it's already underfoot) by the time
  // you reach it.
  INCLINE_LEAD_TIME_S: 20,
  INCLINE_LEAD_MIN_M: 15,
  INCLINE_LEAD_MAX_M: 80,

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

  // --- TomTom: live traffic + places-search fallback --------------------------
  // Two independent features, both gated on this one flag: live traffic
  // during drive navigation (TomTom Flow Segment Data) and a Places Search
  // fallback for category searches ("EV charging near me") that come back
  // empty from Nominatim/OSM — genuinely sparse in India for some categories
  // (see README). The real TomTom API key never lives here or anywhere else
  // client-side — both features call this app's own /api/traffic and
  // /api/places routes (see functions/api/), Cloudflare Pages Functions that
  // hold the actual key as a server-side secret. Set that secret in the
  // Cloudflare dashboard (Settings → Environment variables → TOMTOM_API_KEY),
  // deploy, then flip this to true. Leave false to disable both entirely —
  // no calls to /api/traffic or /api/places at all.
  TOMTOM_FEATURES_ENABLED: false,

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
  // evenly spaced over the lookahead window (see TRAFFIC_SAMPLE_AHEAD_TIME_S
  // below). One Flow Segment Data request per point, fired in parallel —
  // each successful one also draws a short colored dash on the map (see
  // route-traffic-line), so this also controls how dense that overlay looks.
  // 6 stays nowhere near the 20K/month free cap even for a long daily drive.
  TRAFFIC_SAMPLE_POINTS: 6,

  // The lookahead window is speed-scaled (same dynamicVoiceLeadM pattern the
  // turn-by-turn voice cues already use, see app.js), not a flat distance —
  // a fixed 5km covers ~3 minutes of driving at highway speed but much more
  // at city speed, so a flat value either over-samples empty highway ahead
  // or under-covers what's actually about to be driven at low speed.
  // ~4 minutes ahead at current speed, clamped to a sane range either way.
  TRAFFIC_SAMPLE_AHEAD_TIME_S: 240,
  TRAFFIC_SAMPLE_AHEAD_MIN_M: 2000,
  TRAFFIC_SAMPLE_AHEAD_MAX_M: 8000,

  // Each colored dash on the map is our own route line sliced this many
  // metres to either side of the sample point it's centered on (so a 150
  // default draws a 300m-long dash) — deliberately NOT TomTom's own matched
  // road segment geometry, which comes from a different map dataset and can
  // visibly land on a nearby-but-different road in dense areas.
  TRAFFIC_DASH_HALF_WIDTH_M: 150,

  // Flow Segment Data's own data-quality signal (0–1, see TomTom's docs) —
  // when a road has too little real-time probe data, TomTom silently falls
  // back to a historical average instead of leaving the field empty, with
  // confidence as the only signal that happened. A sample below this is
  // dropped entirely (treated the same as a failed request) rather than
  // averaged in as if it were an equally trustworthy live reading — this
  // matters most on minor roads and smaller cities, where live probe
  // coverage is thin even in markets TomTom otherwise covers well.
  TRAFFIC_MIN_CONFIDENCE: 0.5,

  // fetchTomTomFlowRatio caches each response by a coarse lat/lon grid cell
  // for this long — route options routinely share a stretch near a common
  // start/end point (each sampling it independently), a detour candidate
  // re-samples ground a sibling option already covered, and a check-in
  // during dead-stopped traffic re-queries almost the same spot every
  // cycle. Traffic doesn't meaningfully change faster than this, so caching
  // collapses those into one real call — pure savings, not a precision
  // tradeoff. A genuine fetch failure (network/timeout/bad HTTP status) is
  // deliberately never cached — that's worth retrying next time, not
  // remembering as "no data" for the whole window.
  TRAFFIC_CACHE_TTL_MS: 150000, // 2.5 min
  // Decimal places lat/lon are rounded to before being used as the cache
  // key — 3 is roughly a 100-150m grid cell at most latitudes. Coarser than
  // this risks merging two genuinely different roads' readings together;
  // finer defeats the point (two calls a few metres apart rarely share a
  // cache hit).
  TRAFFIC_CACHE_GRID_DECIMALS: 3,

  // If the distance-weighted average of (currentSpeed / freeFlowSpeed)
  // across all samples that succeeded drops below this, show the "Heavy
  // traffic ahead" indicator and scale the live ETA line's remaining time
  // by the inverse of that ratio. At/above threshold: no indicator, no ETA
  // adjustment. Weighted rather than a flat average — see
  // sampleTrafficAhead in app.js — so a bad patch just ahead isn't diluted
  // into invisibility by clear road further out in the same window.
  TRAFFIC_HEAVY_THRESHOLD: 0.6,

  // Once a check-in confirms heavy traffic ahead, how often a traffic-
  // triggered reroute attempt is allowed to fire — deliberately much longer
  // than TRAFFIC_CHECK_MIN_INTERVAL_MS, since comparing alternates against
  // live flow data is heavier than a single check-in, and actually changing
  // the driver's route is more disruptive than just updating a badge.
  TRAFFIC_REROUTE_MIN_INTERVAL_MS: 600000, // 10 min

  // An alternate's own near-term ratio must beat the current route's by at
  // least this much to be worth switching to — without this, noise-level
  // differences between two roads that are both fine would cause pointless
  // rerouting. Valhalla itself has no notion of live traffic, so asking it
  // to "reroute" without this comparison would almost always just return
  // the same route back.
  TRAFFIC_REROUTE_MIN_IMPROVEMENT: 0.15,

  // How far ahead (metres) and how many points to compare the current route
  // against each alternate when deciding whether to reroute for traffic —
  // deliberately much shorter than the full check-in lookahead window: only
  // the immediate stretch matters for "is there a faster way past THIS jam
  // specifically", not the whole remaining trip.
  TRAFFIC_REROUTE_COMPARE_AHEAD_M: 2500,
  TRAFFIC_REROUTE_COMPARE_POINTS: 3,

  // Radius (metres) buffered around a congested stretch before asking
  // Valhalla to route around it entirely via exclude_polygons — see
  // buildExcludePolygon/estimateDetourRoute in app.js. Wide enough to
  // actually exclude the jammed road's own edges (not just its centerline),
  // narrow enough to stay well under Valhalla's own max-polygon-area limit
  // and avoid accidentally excluding a genuinely useful parallel road too.
  TRAFFIC_DETOUR_BUFFER_M: 200,

  // Search radius (metres) for the TomTom Places Search fallback — only
  // tried after Nominatim's own default + wide radius category search both
  // come back empty. Wider than Nominatim's wide radius on purpose, since
  // this only ever runs for genuinely sparse categories/areas.
  TOMTOM_PLACES_FALLBACK_RADIUS_M: 5000,
};
