// App config — point this at your own self-hosted services here.
// Nothing else in the codebase should need editing for that.
export const CONFIG = {
  // Max time to wait for a routing/geocoding request before giving up, in ms.
  FETCH_TIMEOUT_MS: 20000,

  // Max time to wait for the map style/tiles to load before giving up, in ms.
  MAP_LOAD_TIMEOUT_MS: 15000,

  // --- Geocoding: self-hosted Nominatim -------------------------------------
  // Your Nominatim instance. Public demo default is rate-limited to 1 req/sec.
  NOMINATIM_URL: 'https://nominatim.openstreetmap.org',

  // Minimum gap between outgoing Nominatim requests, in ms (keeps under 1 req/sec).
  NOMINATIM_MIN_INTERVAL_MS: 1100,

  // Delay after the user stops typing before firing a search, in ms.
  NOMINATIM_DEBOUNCE_MS: 400,

  // ISO 3166-1 alpha-2 country codes to restrict search results to (comma-separated).
  // Hard filter, not a ranking bias. Empty string searches worldwide.
  GEOCODE_COUNTRY_CODES: 'in',

  // Bounding-box radius (degrees) for location-biased/category search around an anchor point.
  // WIDE is the automatic retry when DEFAULT finds nothing.
  GEOCODE_NEAR_RADIUS_DEG_DEFAULT: 0.03,
  GEOCODE_NEAR_RADIUS_DEG_WIDE: 0.12,

  // --- Routing: self-hosted Valhalla ------------------------------------------
  // Your Valhalla instance. Public demo default has a ~1 call/sec fair-use limit.
  VALHALLA_URL: 'https://valhalla1.openstreetmap.de',
  VALHALLA_MIN_INTERVAL_MS: 1100,

  // Try a second, self-hosted Valhalla instance first, via this deployment's own
  // /api/valhalla-route and /api/valhalla-height. The real address is a Cloudflare
  // secret (SELF_HOSTED_VALHALLA_URL), never in this file. Falls back to VALHALLA_URL
  // above if unset (501) or if a waypoint is outside SELF_HOSTED_VALHALLA_COVERAGE_BBOX.
  // Can also be overridden per-device via the Developer tools toggle in app.js.
  USE_SELF_HOSTED_VALHALLA: true,
  SELF_HOSTED_VALHALLA_MIN_INTERVAL_MS: 200,
  // Coverage bounds of the maintainer's own self-hosted Valhalla extract (Kochi area).
  // If deploying your own copy, update or null this out — otherwise your self-hosted
  // instance is never tried since your waypoints won't fall inside these bounds.
  SELF_HOSTED_VALHALLA_COVERAGE_BBOX: { minLon: 76.127, minLat: 9.563, maxLon: 77.037, maxLat: 10.268 },

  // Max shape points sent to Valhalla's /height for a walk-mode elevation profile.
  ELEVATION_MAX_POINTS: 150,

  // Max shape points sent to Valhalla's /trace_attributes for a drive-mode speed-limit
  // profile. Higher than ELEVATION_MAX_POINTS — needs more density to snap correctly
  // through interchanges on long highway drives.
  SPEED_LIMIT_MAX_POINTS: 500,

  // --- Map tiles: OpenFreeMap (no API key needed) -----------------------------
  MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',

  // --- Google Maps link resolver -----------------------------------------------
  // Base URL for /api/resolve-maps-url. Only used in the Android app shell, which has
  // no backend of its own to call a relative path against. Web deployments always use
  // a relative same-origin path instead, regardless of this value.
  RESOLVE_MAPS_URL_BASE: 'https://osm-navigator.siddharthshiv2798.workers.dev',

  // --- Navigation / voice guidance behaviour ----------------------------------
  // Callout distances are speed-scaled (target lead TIME, not a flat distance) —
  // see dynamicVoiceLeadM in app.js. *_LEAD_TIME_S is the target, *_MIN_M/*_MAX_M
  // are the clamp bounds the result is kept within.

  // Far callout ("in X meters, turn right").
  VOICE_PROMPT_LEAD_TIME_S: 14,
  VOICE_PROMPT_MIN_M: 120,
  VOICE_PROMPT_MAX_M: 700,
  // Near callout ("turn right", no distance) — deliberately a shorter lead time.
  VOICE_NEAR_LEAD_TIME_S: 5,
  VOICE_NEAR_MIN_M: 20,
  VOICE_NEAR_MAX_M: 140,
  // Fallback speed (m/s) used before any real GPS speed is available yet.
  VOICE_DEFAULT_SPEED_MPS: 10,

  // Assumed TTS speaking rate (words/min) — leads callouts so the spoken distance is
  // still roughly right by the time the sentence finishes, not just when it starts.
  VOICE_SPEAKING_RATE_WPM: 130,

  // Minimum silence (ms) enforced between two queued spoken prompts.
  VOICE_MIN_GAP_MS: 2000,

  // How long (ms) native-audio-focus.js keeps Bluetooth/media audio ducked after a
  // prompt finishes, before releasing it. Android only.
  VOICE_DUCK_RELEASE_GRACE_MS: 2500,

  // Skip the unmute confirmation if the last voice-mode toggle was within this many ms.
  VOICE_MODE_TOGGLE_DEBOUNCE_MS: 2000,

  // Distance (m) from the destination that counts as arrived; ends navigation automatically.
  ARRIVAL_RADIUS_M: 10,

  // Consecutive GPS fixes within ARRIVAL_RADIUS_M required before declaring arrival
  // (avoids one noisy fix ending the trip early).
  ARRIVAL_CONFIRM_FIXES: 2,

  // Perpendicular distance (m) from the route line that counts as off-route.
  DEVIATION_THRESHOLD_M: 30,

  // How long (ms) continuously off-route before the app auto-requests a new route.
  DEVIATION_DURATION_MS: 3000,

  // Distance (m) to drop back under DEVIATION_THRESHOLD_M before the off-route timer
  // resets (hysteresis, avoids flapping near the threshold).
  DEVIATION_CLEAR_THRESHOLD_M: 20,

  // Snap the displayed live-position marker onto the route line when within this many
  // metres (cosmetic only — deviation/maneuver logic always uses the raw GPS fix).
  PUCK_SNAP_MAX_OFFSET_M: 20,

  // Distance (m) past a maneuver boundary required before advancing to the next step
  // (hysteresis, avoids the nav banner flickering from GPS jitter near a boundary).
  MANEUVER_ADVANCE_HYSTERESIS_M: 10,

  // Walk-mode incline announcements ("Moderate incline for the next 200 meters").
  // Grade % thresholds are rough real-world walking bands, not precise physiology.
  INCLINE_GRADE_MODERATE_PCT: 4,
  INCLINE_GRADE_STEEP_PCT: 8,
  INCLINE_MIN_SEGMENT_M: 30, // filters out short GPS/DEM noise, not a real hill
  // Same speed-scaled lead-time approach as the voice callouts above, tuned for walking pace.
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
  // Cache API name for downloaded/opportunistically-cached map tiles.
  // NOTE: if MAP_STYLE_URL changes, also update TILE_HOSTS in sw.js — the service
  // worker can't import this file, so keep the two in sync manually.
  TILE_CACHE_NAME: 'offline-tiles',
  OFFLINE_MIN_ZOOM_DEFAULT: 10,
  OFFLINE_MAX_ZOOM_DEFAULT: 16,
  OFFLINE_TILE_CONCURRENCY: 6,   // parallel tile downloads
  OFFLINE_TILE_MAX_RETRIES: 2,   // retries per failed tile before it's skipped

  // --- Saved places ----------------------------------------------------------
  MAX_RECENT_TRIPS: 20,

  // --- Multi-stop routing -------------------------------------------------------
  MAX_STOPS: 8, // soft cap so the directions card doesn't grow unreasonably tall

  // --- Street-level imagery: Mapillary -----------------------------------------
  // Client token from https://www.mapillary.com/dashboard/developers.
  // Leave empty to disable the feature entirely (no coverage layer, no API calls).
  MAPILLARY_ACCESS_TOKEN: '',
  MAPILLARY_COVERAGE_MIN_ZOOM: 14, // below this zoom the coverage layer stays off
  MAPILLARY_SEARCH_RADIUS_M: 60,   // search radius for the nearest street-level image

  // --- EV charging details: Open Charge Map ------------------------------------
  // Enables detailed EV charger lookups via this deployment's /api/opencharge-poi.
  // The real key (OPENCHARGEMAP_API_KEY) is a Cloudflare secret, never in this file.
  // If unset, that endpoint returns 501 and the app falls back to plain OSM search.
  // Status shown is a community-maintained operational flag, not live occupancy.
  OPENCHARGEMAP_ENABLED: true,
  OPENCHARGEMAP_MIN_INTERVAL_MS: 1000,
  OPENCHARGEMAP_SEARCH_RADIUS_KM: 15,

  // --- Transit -------------------------------------------------------------
  // Bundled Kochi Metro + Water Metro routing using real station/schedule data
  // (vendor/kochi-metro.json, vendor/kochi-water-metro.json; see docs/KOCHI_TRANSIT.md).
  // No self-hosted service needed. Maintainer's own bias — set false to hide it.
  KOCHI_TRANSIT_ENABLED: true,

  // Self-hosted OpenTripPlanner 2 instance for another city's transit, e.g.
  // 'https://otp.mydomain.com'. Only tried when Kochi transit can't plan the trip.
  // If both this and KOCHI_TRANSIT_ENABLED are empty/false, transit mode never appears.
  OTP2_URL: '',

  // Max distance (m) between a Metro station and Water Metro jetty to count as a
  // walkable transfer point between the two networks.
  KOCHI_TRANSFER_MAX_M: 400,

  // --- Kochi transit live tracking ------------------------------------------
  // GPS-guided tracking during a Kochi-sourced itinerary only (not available for
  // OTP2 routes, which have no bundled schedule/station data to match against).

  // Distance (m) from a ride leg's start, plus being at/after its scheduled departure,
  // required to count as "boarded" — proximity alone isn't enough.
  TRANSIT_BOARDING_RADIUS_M: 80,

  // Distance (m) from a leg's destination that counts as arrived/alighted, advancing
  // tracking to the next leg (or ending the trip on the last one).
  TRANSIT_ALIGHT_RADIUS_M: 80,

  // Consecutive fixes within radius required before confirming a leg is complete
  // (same reasoning as ARRIVAL_CONFIRM_FIXES above).
  TRANSIT_ARRIVAL_CONFIRM_FIXES: 2,

  // A ride leg can't be rerouted (see docs/KOCHI_TRANSIT.md). If live position drifts
  // more than this far (m) from the leg's geometry for this long (ms), its live
  // progress readout is hidden until back in range, rather than guessed at.
  TRANSIT_RIDE_DEVIATION_THRESHOLD_M: 300,
  TRANSIT_RIDE_DEVIATION_DURATION_MS: 20000,

  // --- Weather badge -----------------------------------------------------
  // Shows current conditions at the selected place / live GPS position, via
  // Open-Meteo (free, keyless, no self-hosted alternative). Set false to disable.
  WEATHER_ENABLED: true,

  // --- TomTom: live traffic + places-search fallback --------------------------
  // Gates two features: live traffic during drive navigation, and a places-search
  // fallback for categories that come back empty from Nominatim/OSM. Calls this
  // app's own /api/traffic and /api/places — the real TomTom key is a Cloudflare
  // secret (TOMTOM_API_KEY), never client-side. Leave false to disable both.
  TOMTOM_FEATURES_ENABLED: false,

  // A traffic check-in fires only once both this much time AND this much distance
  // have passed since the last one.
  TRAFFIC_CHECK_MIN_INTERVAL_MS: 180000, // 3 min
  TRAFFIC_CHECK_MIN_DISTANCE_M: 1500,

  // Stop checking traffic once this close (m) to the destination.
  TRAFFIC_STOP_CHECKING_REMAINING_M: 1000,

  // Points sampled ahead of the live position per check-in (one Flow Segment Data
  // request each, also drawn as a dash on the map).
  TRAFFIC_SAMPLE_POINTS: 6,

  // Lookahead window is speed-scaled (target time ahead at current speed), clamped
  // to this distance range (m) so it never over- or under-samples.
  TRAFFIC_SAMPLE_AHEAD_TIME_S: 240,
  TRAFFIC_SAMPLE_AHEAD_MIN_M: 2000,
  TRAFFIC_SAMPLE_AHEAD_MAX_M: 8000,

  // Half-length (m) of each colored traffic dash drawn on the map, centered on its
  // sample point (uses our own route geometry, not TomTom's matched road segment).
  TRAFFIC_DASH_HALF_WIDTH_M: 150,

  // Flow Segment Data confidence (0-1) below which a sample is dropped entirely
  // rather than treated as a live reading — low confidence means TomTom fell back
  // to a historical average.
  TRAFFIC_MIN_CONFIDENCE: 0.5,

  // How long (ms) a traffic response is cached, keyed by a coarse lat/lon grid cell.
  // Failed requests are never cached.
  TRAFFIC_CACHE_TTL_MS: 150000, // 2.5 min
  // Decimal places lat/lon are rounded to for the cache key (3 ≈ 100-150m cells).
  TRAFFIC_CACHE_GRID_DECIMALS: 3,

  // Below this distance-weighted speed ratio (current/free-flow), show the "Heavy
  // traffic ahead" indicator and scale the live ETA accordingly.
  TRAFFIC_HEAVY_THRESHOLD: 0.6,

  // Minimum interval (ms) between traffic-triggered reroute attempts.
  TRAFFIC_REROUTE_MIN_INTERVAL_MS: 600000, // 10 min

  // Minimum improvement an alternate route's traffic ratio must show over the
  // current route to be worth switching to.
  TRAFFIC_REROUTE_MIN_IMPROVEMENT: 0.15,

  // Distance (m) and point count used to compare the current route against
  // alternates when deciding whether to reroute for traffic.
  TRAFFIC_REROUTE_COMPARE_AHEAD_M: 2500,
  TRAFFIC_REROUTE_COMPARE_POINTS: 3,

  // Buffer radius (m) around a congested stretch when routing around it via
  // Valhalla's exclude_polygons.
  TRAFFIC_DETOUR_BUFFER_M: 200,

  // Search radius (m) for the TomTom places fallback, tried only after Nominatim's
  // default + wide radius category search both come back empty.
  TOMTOM_PLACES_FALLBACK_RADIUS_M: 5000,
};
