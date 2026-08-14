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

  // Caps how many shape points get sent to Valhalla's /height action when
  // building a walking route's elevation profile — keeps that request body
  // small on long routes. Only used for walk-mode routes.
  ELEVATION_MAX_POINTS: 150,

  // --- Map tiles: OpenFreeMap (no API key needed) -----------------------------
  MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',

  // --- Navigation / voice guidance behaviour ----------------------------------
  // Speak the next instruction once the live position is within this many
  // metres of the upcoming maneuver.
  VOICE_PROMPT_DISTANCE_M: 200,

  // Perpendicular distance (metres) from the route line beyond which the
  // driver is considered "off route".
  DEVIATION_THRESHOLD_M: 50,

  // How long (ms) the driver must remain continuously off-route before the
  // app automatically requests a new route.
  DEVIATION_DURATION_MS: 5000,

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
};
