import { CONFIG } from './config.js';
import {
  addFavorite, getFavorites, deleteFavorite,
  addRecentTrip, getRecentTrips, deleteRecentTrip,
  addDownloadedArea, getDownloadedAreas, deleteDownloadedArea,
  saveCurrentTrip, loadCurrentTrip, clearCurrentTrip,
} from './idb.js';
import { startLocationWatch, stopLocationWatch } from './native-location.js';

// maplibregl and turf are loaded as plain <script> globals in index.html.
if (typeof maplibregl === 'undefined' || typeof turf === 'undefined') {
  document.getElementById('status-banner').textContent =
    'Failed to load map libraries. Check your internet connection and reload.';
  document.getElementById('status-banner').className = 'error';
  throw new Error('maplibregl/turf not loaded');
}

// ============================================================================
// DOM references
// ============================================================================
const el = {
  statusBanner: document.getElementById('status-banner'),
  searchCard: document.getElementById('search-card'),
  searchSimple: document.getElementById('search-simple'),
  placeInput: document.getElementById('place-input'),
  placeSuggestions: document.getElementById('place-suggestions'),
  placeCard: document.getElementById('place-card'),
  placeCardPrimary: document.getElementById('place-card-primary'),
  placeCardSecondary: document.getElementById('place-card-secondary'),
  placeCardActions: document.getElementById('place-card-actions'),
  placeDirectionsBtn: document.getElementById('place-directions-btn'),
  placeClearBtn: document.getElementById('place-clear-btn'),
  offlineBtn: document.getElementById('offline-btn'),
  categoryChips: document.getElementById('category-chips'),
  routeOptionsRow: document.getElementById('route-options'),
  routeChips: document.getElementById('route-chips'),
  poiResultsHeader: document.getElementById('poi-results-header'),
  poiResultsLabel: document.getElementById('poi-results-label'),
  poiBackBtn: document.getElementById('poi-back-btn'),
  poiResultsList: document.getElementById('poi-results-list'),
  favoritePrompt: document.getElementById('favorite-prompt'),
  favoritePromptInput: document.getElementById('favorite-prompt-input'),
  favoritePromptCancel: document.getElementById('favorite-prompt-cancel'),
  favoritePromptSave: document.getElementById('favorite-prompt-save'),
  searchDirections: document.getElementById('search-directions'),
  directionsBackBtn: document.getElementById('directions-back-btn'),
  fromInput: document.getElementById('from-input'),
  toInput: document.getElementById('to-input'),
  fromSuggestions: document.getElementById('from-suggestions'),
  toSuggestions: document.getElementById('to-suggestions'),
  swapBtn: document.getElementById('swap-btn'),
  stopsContainer: document.getElementById('stops-container'),
  addStopBtn: document.getElementById('add-stop-btn'),
  planBtn: document.getElementById('plan-route-btn'),
  bottomSheet: document.getElementById('bottom-sheet'),
  sheetHandle: document.getElementById('sheet-handle'),
  sheetSummary: document.getElementById('sheet-summary'),
  cancelRouteBtn: document.getElementById('cancel-route-btn'),
  startNavBtn: document.getElementById('start-nav-btn'),
  endNavBtn: document.getElementById('end-nav-btn'),
  mapControls: document.getElementById('map-controls'),
  routeSearchBtn: document.getElementById('route-search-btn'),
  zoomInBtn: document.getElementById('zoom-in-btn'),
  zoomOutBtn: document.getElementById('zoom-out-btn'),
  locateBtn: document.getElementById('locate-btn'),
  navBanner: document.getElementById('nav-banner'),
  navBannerIcon: document.getElementById('nav-banner-icon'),
  navBannerInstruction: document.getElementById('nav-banner-instruction'),
  navBannerDistance: document.getElementById('nav-banner-distance'),
  maneuverList: document.getElementById('maneuver-list'),
  offlinePanel: document.getElementById('offline-panel'),
  offlineCloseBtn: document.getElementById('offline-close-btn'),
  areaNameInput: document.getElementById('area-name-input'),
  zoomMinInput: document.getElementById('zoom-min-input'),
  zoomMaxInput: document.getElementById('zoom-max-input'),
  tileEstimate: document.getElementById('tile-estimate'),
  downloadAreaBtn: document.getElementById('download-area-btn'),
  downloadProgress: document.getElementById('download-progress'),
  downloadProgressFill: document.getElementById('download-progress-fill'),
  downloadProgressText: document.getElementById('download-progress-text'),
  cancelDownloadBtn: document.getElementById('cancel-download-btn'),
  downloadedAreasList: document.getElementById('downloaded-areas-list'),
  storageEstimate: document.getElementById('storage-estimate'),
  mapillaryToggleBtn: document.getElementById('mapillary-toggle-btn'),
  mapillaryViewer: document.getElementById('mapillary-viewer'),
  mapillaryCloseBtn: document.getElementById('mapillary-close-btn'),
  mapillaryImage: document.getElementById('mapillary-image'),
  mapillaryLoading: document.getElementById('mapillary-loading'),
  mapillaryEmpty: document.getElementById('mapillary-empty'),
  mapillaryError: document.getElementById('mapillary-error'),
  mapillaryPrevBtn: document.getElementById('mapillary-prev-btn'),
  mapillaryNextBtn: document.getElementById('mapillary-next-btn'),
  travelModeToggle: document.getElementById('travel-mode-toggle'),
};

// ============================================================================
// App state — the single source of truth for what's currently on screen.
// ============================================================================
const state = {
  from: null,          // {label, lat, lon} chosen from suggestions
  to: null,            // {label, lat, lon} chosen from suggestions
  route: null,         // {coords, maneuvers, totalDistM, totalTimeS, lineFeature}
  routeOptions: [],    // raw Valhalla trip objects: [primary, ...meaningfully-different alternates]
  selectedRouteIndex: 0, // which entry of routeOptions is currently drawn/active
  travelMode: 'drive', // 'drive' | 'transit' (Milestone 4C — transit has no live-navigation counterpart)
  transitItinerary: null, // last-planned OTP2 itinerary, kept separate from `route` since it's a different shape
  originMarker: null,
  destMarker: null,
  stopMarkers: [],     // numbered pins for intermediate stops, in visit order
  poiMarkers: [],      // one per candidate in the current category/along-route search, cleared on next search or selection
  currentLegIndex: 0,  // which leg of a multi-stop trip we're currently on — see updateActiveManeuver
  traveledM: null,     // distance travelled along state.route so far — see onPositionUpdate, used to scope "search along route" to what's still ahead once navigating
  puckMarker: null,
  myLocationMarker: null, // one-shot "you are here" dot shown by the locate button before navigation starts
  navigating: false,
  watchId: null,
  spoken: new Set(),   // indices of maneuvers we've already spoken aloud
  arrivedAnnounced: false,
  lastFix: null,       // {lng, lat, t} of the previous GPS fix, for bearing fallback
  lastHeading: 0,
  offRouteSince: null, // timestamp when we first went off-route, or null
  isRerouting: false,
  pendingRerouteFrom: null, // last known-good lngLat we owe a reroute to, once connectivity returns
  followMode: true,    // whether the camera auto-follows the live position
};

// ============================================================================
// Android/mobile "back" button handling
//
// Neither a plain installed PWA nor the default Capacitor WebView expose a
// direct "back button pressed" event — both just call the browser's own
// history.back(), and only actually exit the app once there's no history
// left to go back to. So instead of listening for a back-button event
// directly, every "closeable" UI layer (a modal, a mode, an open panel)
// pushes a dummy history entry when it opens, and the resulting `popstate`
// event — fired for a hardware/gesture back press OR our own history.back()
// calls — is what actually closes it. This is the standard technique for
// making a back button behave sensibly in a single-page app, and it works
// identically on a plain PWA install and inside the Capacitor shell, with
// no extra native plugin needed.
//
// The design follows Google Maps' own back-button model: back undoes
// exactly one layer of UI state at a time (close a modal, then leave
// directions mode, then clear a planned route, ...), and only exits the app
// once there's truly nothing left open — never jumps multiple layers, never
// silently exits mid-flow. See the individual pushBackLayer() call sites
// below for the reasoning behind each layer's specific place in the stack.
// ============================================================================
const backStack = []; // close-callbacks, most-recently-opened layer last

/** Call when a closeable layer opens (a modal, a mode, a planned route...).
 * `closeFn` must be idempotent — it runs whether the layer is dismissed by
 * a back press or by its own on-screen close button (see goBackInApp). It
 * may return `true` to VETO the close (used only by the active-navigation
 * guard, which wants back presses to show a hint rather than exit nav). */
function pushBackLayer(closeFn) {
  backStack.push(closeFn);
  history.pushState({ nav: backStack.length }, '');
}

/** Call when an already-open layer's meaning changes without changing its
 * depth — e.g. "directions form open" becoming "route planned" once you
 * submit it. Swaps the closeFn in place with no new history entry, so one
 * back press from here still only undoes one conceptual step. */
function replaceTopBackLayer(closeFn) {
  if (backStack.length) {
    backStack[backStack.length - 1] = closeFn;
  } else {
    pushBackLayer(closeFn);
  }
}

/** For a layer that can ALSO close as a side effect of something other than
 * its own dismiss control — e.g. the place card clearing itself because the
 * user typed a new search, not because they tapped its close button. Drops
 * it from OUR stack without consuming a real history entry. Deliberately
 * leaves one harmless extra browser-history entry behind rather than risk
 * the stack drifting out of sync with real navigation history; that stray
 * entry is silently absorbed the next time an actual back-triggered close
 * happens. Only removes it if it's still on top — a no-op otherwise. */
function forgetBackLayerIfTop(closeFn) {
  if (backStack.length && backStack[backStack.length - 1] === closeFn) backStack.pop();
}

/** For an action that collapses everything back to the true home state
 * regardless of how many layers are currently nested (e.g. the Cancel
 * button discarding a planned route even if poi-results-along-route
 * happens to be open on top of it) — empties the stack outright rather
 * than popping one at a time. Leaves any already-consumed real browser
 * history entries as harmless stray entries (same tradeoff as
 * forgetBackLayerIfTop above) instead of walking history.back() in a loop,
 * which could itself trigger cascading popstate handling. */
function clearBackLayers() {
  backStack.length = 0;
}

/** Every on-screen "close/back/cancel" control for a layer opened via
 * pushBackLayer should call this INSTEAD OF closing the layer directly —
 * routing both the hardware back button and the on-screen control through
 * the exact same history.back() → popstate → pop-and-close pipeline means
 * there's only one place that actually closes anything, so the stack can
 * never drift out of sync with what's really open. */
function goBackInApp() {
  if (backStack.length) history.back();
}

window.addEventListener('popstate', () => {
  const closeFn = backStack[backStack.length - 1];
  if (!closeFn) return; // nothing tracked — let the platform's own back behaviour proceed (exit the app / go to the previous app)
  const veto = closeFn();
  if (veto) {
    // The browser just consumed one real history entry for this popstate;
    // push an equivalent one back so the same guard catches the next back
    // press too, without growing backStack (same depth, not a new layer).
    history.pushState({ nav: backStack.length }, '');
  } else {
    backStack.pop();
  }
});

// ============================================================================
// Small utilities
// ============================================================================

/** Ensures calls spaced at least `minIntervalMs` apart — used to respect the
 * fair-use / rate limits of the public Nominatim and Valhalla instances. */
function createLimiter(minIntervalMs) {
  let lastCall = 0;
  return async function wait() {
    const now = Date.now();
    const remaining = lastCall + minIntervalMs - now;
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    lastCall = Date.now();
  };
}

function formatDistance(m) {
  if (m < 950) return Math.round(m) + ' m';
  return (m / 1000).toFixed(1) + ' km';
}

function formatDuration(s) {
  const mins = Math.round(s / 60);
  if (mins < 1) return '<1 min';
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  return h + ' h ' + (mins % 60) + ' min';
}

function formatBytes(n) {
  if (!n) return '0 MB';
  const mb = n / (1024 * 1024);
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}

/** Nominatim's `display_name` is one long comma-separated string with no
 * distinction between "the name" and "the rest of the address" — shown
 * verbatim, that's what made the search bar and every card built from it
 * read as an unbroken wall of text. Splitting on the first comma and
 * treating everything after it as secondary detail is a good enough
 * heuristic to get a bold place name + a dim address line almost
 * everywhere, matching how Google Maps presents a picked result. This is
 * purely a rendering split — `label` itself (used for recent trips,
 * favorites, and the native notification title) keeps the full string. */
function splitPlaceLabel(label) {
  const commaIndex = label.indexOf(',');
  if (commaIndex === -1) return { primary: label, secondary: '' };
  return { primary: label.slice(0, commaIndex).trim(), secondary: label.slice(commaIndex + 1).trim() };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Valhalla's maneuver `type` is a numeric enum (kLeft, kSharpRight, kUturnLeft,
// etc.) — map it to a small set of icon shapes so the turn list and the
// "next turn" banner read at a glance, the way Google Maps' arrow icons do,
// instead of relying on instruction text alone. Unlisted types (transit-only
// codes, future additions) fall through to a plain straight-ahead arrow.
const ARROW_PATH = '<path d="M12 4 L12 20 M12 4 L6 10 M12 4 L18 10"/>';
const UTURN_PATH = '<path d="M8 19 V11 a4 4 0 0 1 8 0 v3 M16 11 l3.5 3.5 M16 11 l-3.5 3.5"/>';
const ROUNDABOUT_PATH = '<circle cx="12" cy="12" r="7"/><path d="M12 5 L15 8 M12 5 L9 8"/>';
const FLAG_PATH = '<path d="M6 21 V4"/><path d="M6 5 H18 L15 9 L18 13 H6" fill="currentColor" stroke="none"/>';
const DOT_PATH = '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>';

const MANEUVER_ICONS = {
  1: { path: DOT_PATH }, 2: { path: DOT_PATH }, 3: { path: DOT_PATH },       // start
  4: { path: FLAG_PATH }, 5: { path: FLAG_PATH }, 6: { path: FLAG_PATH },    // destination
  9: { rotate: 30 }, 10: { rotate: 90 }, 11: { rotate: 120 },                // (slight/-/sharp) right
  12: { path: UTURN_PATH, flip: true }, 13: { path: UTURN_PATH },            // u-turns
  14: { rotate: -120 }, 15: { rotate: -90 }, 16: { rotate: -30 },            // sharp/-/slight left
  18: { rotate: 45 }, 19: { rotate: -45 }, 20: { rotate: 45 }, 21: { rotate: -45 }, // ramps/exits
  23: { rotate: 20 }, 24: { rotate: -20 },                                   // stay right/left
  26: { path: ROUNDABOUT_PATH }, 27: { path: ROUNDABOUT_PATH },              // roundabout
};

function maneuverIcon(type) {
  const cfg = MANEUVER_ICONS[type] || {};
  const path = cfg.path || ARROW_PATH;
  const transforms = [];
  if (cfg.rotate) transforms.push(`rotate(${cfg.rotate}deg)`);
  if (cfg.flip) transforms.push('scaleX(-1)');
  const style = transforms.length ? ` style="transform:${transforms.join(' ')}"` : '';
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" `
    + `stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${style}>${path}</svg>`;
}

function starIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" '
    + 'stroke-linejoin="round"><path d="M12 3 L14.6 9 L21 9.8 L16.3 14.1 L17.6 20.5 L12 17.3 L6.4 20.5 L7.7 14.1 L3 9.8 L9.4 9 Z"/></svg>';
}
function trashIcon() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7 h16 M9 7 V4 h6 v3 M6 7 l1 13 h10 l1-13"/></svg>';
}

let statusTimer = null;
/** Plain-language status banner. Errors stay until replaced; info/success
 * messages fade out on their own so they don't clutter a small phone screen. */
function showStatus(message, type = 'info', opts = {}) {
  clearTimeout(statusTimer);
  el.statusBanner.textContent = message;
  el.statusBanner.className = type;
  if (type !== 'error' && !opts.sticky) {
    statusTimer = setTimeout(clearStatus, opts.timeoutMs || 4000);
  }
}
function clearStatus() {
  el.statusBanner.className = 'hidden';
  el.statusBanner.textContent = '';
}

// ============================================================================
// Valhalla polyline decoding (precision 6 — different from the 1e5 precision
// used by Google's algorithm, which this is otherwise identical to).
// ============================================================================
function decodePolyline(encoded, precision = 6) {
  const factor = 10 ** precision;
  let index = 0, lat = 0, lon = 0;
  const coords = [];
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lon / factor, lat / factor]); // GeoJSON order: [lng, lat]
  }
  return coords;
}

/** Flattens a Valhalla trip (one or more legs) into a single coordinate list
 * plus a flat maneuver list, each maneuver annotated with `startDistM` — the
 * cumulative distance (metres) from the route start to the beginning of that
 * maneuver. That running total is what the live-tracking code compares
 * against the driver's snapped position to figure out "which turn is next". */
/** `stops` are the waypoints this specific trip was requested with (empty
 * for a plain A→B route), used only to relabel Valhalla's maneuver text. */
/** Concatenates every leg's decoded shape into one coordinate list — used
 * both by buildRouteState (full turn-by-turn build) and for drawing an
 * alternate route's line on the map, where only the geometry is needed. */
function decodeTripCoords(trip) {
  let coords = [];
  trip.legs.forEach((leg, legIdx) => {
    const legCoords = decodePolyline(leg.shape);
    coords = coords.concat(legIdx > 0 ? legCoords.slice(1) : legCoords);
  });
  return coords;
}

function buildRouteState(trip, stops = []) {
  const coords = decodeTripCoords(trip);
  const maneuvers = [];
  let cumM = 0;

  trip.legs.forEach((leg, legIdx) => {
    const legManeuvers = leg.maneuvers || [];

    legManeuvers.forEach((m, mIdx) => {
      const lengthM = (m.length || 0) * 1000; // requested units: kilometers
      let instruction = m.instruction || 'Continue';

      // Valhalla labels arrival at an intermediate stop the same generic way
      // as the true final destination ("You have arrived at your
      // destination."). Relabel it with the actual stop name so a
      // multi-stop trip doesn't say "destination" twice in a row.
      const isArrivalType = m.type >= 4 && m.type <= 6;
      const isEndOfLeg = mIdx === legManeuvers.length - 1;
      if (isArrivalType && isEndOfLeg && legIdx < stops.length) {
        instruction = `You have arrived at ${stops[legIdx].label}.`;
      }

      maneuvers.push({
        instruction,
        lengthM,
        timeS: m.time || 0,
        type: m.type,
        startDistM: cumM,
        legIndex: legIdx, // which origin→stop/stop→stop/stop→destination leg this belongs to
      });
      cumM += lengthM;
    });
  });

  return {
    coords,
    maneuvers,
    totalDistM: (trip.summary && trip.summary.length ? trip.summary.length * 1000 : cumM),
    totalTimeS: (trip.summary && trip.summary.time) || 0,
  };
}

// ============================================================================
// Map setup
// ============================================================================
const map = new maplibregl.Map({
  container: 'map',
  style: CONFIG.MAP_STYLE_URL,
  center: [78.9629, 22.5937], // roughly the centre of India
  zoom: 4,
  attributionControl: { compact: true },
});
// No on-map zoom control: pinch/scroll zoom covers it on a phone, and a
// visible +/- control would compete with the floating cards for screen space.

function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] };
}

const mapLoad = new Promise((resolve) => map.on('load', resolve));
mapLoad.then(() => {
  // Alternate routes render UNDER the primary line (added first, so later
  // layers draw on top) — muted gray, tappable to switch to that option,
  // exactly mirroring the route-option cards in the bottom sheet.
  map.addSource('route-alternates', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'route-alternates-line',
    type: 'line',
    source: 'route-alternates',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#6b7a90', 'line-width': 4, 'line-opacity': 0.7 },
  });

  map.addSource('route', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#3d8bfd', 'line-width': 5, 'line-opacity': 0.9 },
  });
  map.on('click', 'route-alternates-line', (e) => {
    if (e.features.length) selectRouteOption(e.features[0].properties.optionIndex);
  });
  map.on('mouseenter', 'route-alternates-line', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'route-alternates-line', () => { map.getCanvas().style.cursor = ''; });

  // Milestone 4C: harmless to always add — an empty source costs nothing,
  // and it keeps the "is transit configured" gating limited to the UI/network
  // logic below rather than needing to be threaded through map setup too.
  map.addSource('transit-route', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'transit-route-walk',
    type: 'line',
    source: 'transit-route',
    filter: ['==', ['get', 'mode'], 'WALK'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#9aabc2', 'line-width': 3, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'transit-route-transit',
    type: 'line',
    source: 'transit-route',
    filter: ['!=', ['get', 'mode'], 'WALK'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      // Bus/ferry get their own colour; rail/subway/tram/funicular/gondola
      // all fall through to the same purple rather than trying to give
      // every GTFS route_type its own hue.
      'line-color': ['match', ['get', 'mode'], 'BUS', '#3d8bfd', 'FERRY', '#06b6d4', '#a855f7'],
      'line-width': 5,
    },
  });
});
map.on('error', (e) => {
  // Most commonly a tile/style load failure — surface it once, plainly.
  console.error(e && e.error ? e.error : e);
});

// If the driver manually drags the map during navigation, stop auto-following
// until they explicitly ask to recentre. `dragstart` only fires on user
// gestures, never on our own programmatic `easeTo` calls, so this can't
// mistake auto-follow motion for a manual pan.
map.on('dragstart', () => {
  if (!state.navigating || !state.followMode) return;
  state.followMode = false;
  updateLocateBtnState();
});

// ============================================================================
// DOM markers — built from inline SVG, no external image assets.
// ============================================================================
function createPinElement(colorHex, label) {
  const div = document.createElement('div');
  div.setAttribute('aria-label', label);
  div.innerHTML = `<svg class="pin-marker" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${colorHex}"/>
    <circle cx="12" cy="12" r="5" fill="#fff"/>
  </svg>`;
  return div;
}

/** Small round dot used to highlight every candidate from a category/
 * along-route search on the map at once (distinct from the single numbered
 * pin used for a confirmed stop, or the pin used for a single picked
 * destination — this one specifically means "one of several options"). */
function createPoiMarkerElement() {
  const div = document.createElement('div');
  div.className = 'poi-marker';
  div.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="10"/></svg>';
  return div;
}

/** Clears whatever candidate markers are currently shown — called before a
 * new search, and after any candidate is picked (once you've chosen one,
 * the rest stop being relevant). */
function clearPoiMarkers() {
  state.poiMarkers.forEach((m) => m.remove());
  state.poiMarkers = [];
}

/** Drops one marker per result so the whole candidate set is visible at a
 * glance, not just whichever one ends up picked — tapping a marker selects
 * that result exactly like tapping its list row. */
function showPoiMarkers(results, onSelect) {
  clearPoiMarkers();
  results.forEach((r) => {
    const el2 = createPoiMarkerElement();
    el2.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(r);
    });
    state.poiMarkers.push(
      new maplibregl.Marker({ element: el2, anchor: 'center' }).setLngLat([r.lon, r.lat]).addTo(map),
    );
  });
}

function createStopPinElement(colorHex, number) {
  const div = document.createElement('div');
  div.setAttribute('aria-label', `Stop ${number}`);
  div.innerHTML = `<svg class="pin-marker" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${colorHex}"/>
    <circle cx="12" cy="12" r="8" fill="#fff"/>
    <text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="${colorHex}">${number}</text>
  </svg>`;
  return div;
}

function createPuckElement() {
  const div = document.createElement('div');
  div.className = 'puck-marker';
  div.setAttribute('aria-label', 'Your location');
  div.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
    <circle cx="13" cy="13" r="11" fill="#3d8bfd" fill-opacity="0.25"/>
    <circle cx="13" cy="13" r="6" fill="#3d8bfd" stroke="#fff" stroke-width="2"/>
    <path d="M13 1 L17.5 11 L13 8.3 L8.5 11 Z" fill="#fff"/>
  </svg>`;
  return div;
}

function createLocationDotElement() {
  const div = document.createElement('div');
  div.className = 'puck-marker';
  div.setAttribute('aria-label', 'Your location');
  div.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="9" fill="#3d8bfd" fill-opacity="0.25"/>
    <circle cx="11" cy="11" r="5" fill="#3d8bfd" stroke="#fff" stroke-width="2"/>
  </svg>`;
  return div;
}

/** One-shot "you are here" dot shown when the locate button is tapped
 * outside of navigation (no heading, unlike the nav puck). */
function updateMyLocationMarker(lngLat) {
  if (!state.myLocationMarker) {
    state.myLocationMarker = new maplibregl.Marker({ element: createLocationDotElement() }).setLngLat(lngLat).addTo(map);
  } else {
    state.myLocationMarker.setLngLat(lngLat);
  }
}

/** (Re)places the origin/destination pins to match state.from/state.to.
 * Called whenever a suggestion is picked, and again after navigation ends. */
/** Reads the picked place for every stop row currently in the DOM, in visit
 * order. Stop rows store their picked value directly on the input element
 * (`input._stopPlace`) rather than in a separate array, so add/remove never
 * has to keep two data structures in sync — the DOM order is the only
 * source of truth. */
function getStops() {
  return [...el.stopsContainer.querySelectorAll('.stop-row input')]
    .map((input) => input._stopPlace)
    .filter(Boolean);
}

const ROUND_TRIP_PIN_OFFSET_PX = 14; // enough for both pin bulbs to clear each other without their tips drifting far from the real point

function updatePlanningMarkers() {
  if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
  if (state.destMarker) { state.destMarker.remove(); state.destMarker = null; }
  state.stopMarkers.forEach((m) => m.remove());
  state.stopMarkers = [];

  // A round trip (destination back at the origin) would otherwise draw the
  // green and red pins exactly on top of each other, hiding one — nudge
  // them apart horizontally so both stay visible, the way Google Maps
  // offsets coincident A/B markers rather than stacking them.
  const isRoundTrip = state.from && state.to
    && turf.distance([state.from.lon, state.from.lat], [state.to.lon, state.to.lat], { units: 'meters' }) < 20;

  if (state.from) {
    state.originMarker = new maplibregl.Marker({
      element: createPinElement('#22c55e', 'Origin'),
      anchor: 'bottom',
      offset: isRoundTrip ? [-ROUND_TRIP_PIN_OFFSET_PX, 0] : [0, 0],
    }).setLngLat([state.from.lon, state.from.lat]).addTo(map);
  }
  getStops().forEach((stop, i) => {
    state.stopMarkers.push(
      new maplibregl.Marker({ element: createStopPinElement('#f59e0b', i + 1), anchor: 'bottom' })
        .setLngLat([stop.lon, stop.lat]).addTo(map),
    );
  });
  if (state.to) {
    state.destMarker = new maplibregl.Marker({
      element: createPinElement('#ef4444', 'Destination'),
      anchor: 'bottom',
      offset: isRoundTrip ? [ROUND_TRIP_PIN_OFFSET_PX, 0] : [0, 0],
    }).setLngLat([state.to.lon, state.to.lat]).addTo(map);
  }
}

// ============================================================================
// Map control stack: zoom +/- and the dual-purpose locate button (one-shot
// "where am I" before navigation, "resume following" once it's under way).
// ============================================================================
el.zoomInBtn.addEventListener('click', () => map.zoomIn({ duration: 200 }));
el.zoomOutBtn.addEventListener('click', () => map.zoomOut({ duration: 200 }));

function updateLocateBtnState() {
  el.locateBtn.classList.toggle('active', state.navigating && !state.followMode);
}

el.locateBtn.addEventListener('click', () => {
  if (state.navigating) {
    state.followMode = true;
    updateLocateBtnState();
    if (state.lastFix) followCamera([state.lastFix.lng, state.lastFix.lat], state.lastHeading);
    return;
  }
  if (!('geolocation' in navigator)) {
    showStatus('This browser does not support GPS location.', 'error');
    return;
  }
  showStatus('Finding your location…', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lngLat = [pos.coords.longitude, pos.coords.latitude];
      map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 14), duration: 800 });
      updateMyLocationMarker(lngLat);
      clearStatus();
    },
    () => showStatus('Could not get your location. Check location permissions.', 'error'),
    CONFIG.GEOLOCATION_OPTIONS,
  );
});

// ============================================================================
// Milestone 4A — Mapillary street-level imagery peek
//
// Entirely config-gated: with no MAPILLARY_ACCESS_TOKEN set, none of this
// runs — no coverage layer, no street-view buttons anywhere, no network
// calls to Mapillary at all. There's no public shared token to default to
// (every app must register its own), so "disabled" has to be the default.
// ============================================================================
const MAPILLARY_ENABLED = !!CONFIG.MAPILLARY_ACCESS_TOKEN;
let mapillaryLayerVisible = false;
const mapillarySequence = { ids: [], index: -1 };

if (MAPILLARY_ENABLED) {
  mapLoad.then(() => {
    // Mapillary's public vector tiles: an "image" point layer appears from
    // zoom 14 up (below that, coverage is a "sequence" line layer we don't
    // bother rendering — at a glance, individual points are what's useful
    // for "can I peek here?"). Schema per Mapillary's documented v4 tileset.
    map.addSource('mapillary-coverage', {
      type: 'vector',
      tiles: [`https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${CONFIG.MAPILLARY_ACCESS_TOKEN}`],
      minzoom: 6,
      maxzoom: 14,
    });
    map.addLayer({
      id: 'mapillary-coverage-layer',
      type: 'circle',
      source: 'mapillary-coverage',
      'source-layer': 'image',
      minzoom: CONFIG.MAPILLARY_COVERAGE_MIN_ZOOM,
      layout: { visibility: 'none' },
      paint: { 'circle-color': '#05cb63', 'circle-radius': 3, 'circle-opacity': 0.75 },
    });
  });

  el.mapillaryToggleBtn.classList.remove('hidden');
  el.mapillaryToggleBtn.addEventListener('click', async () => {
    mapillaryLayerVisible = !mapillaryLayerVisible;
    el.mapillaryToggleBtn.classList.toggle('active', mapillaryLayerVisible);
    await mapLoad;
    map.setLayoutProperty('mapillary-coverage-layer', 'visibility', mapillaryLayerVisible ? 'visible' : 'none');
    if (mapillaryLayerVisible && map.getZoom() < CONFIG.MAPILLARY_COVERAGE_MIN_ZOOM) {
      showStatus('Zoom in to see where street-level imagery is available.', 'info');
    }
  });

  // Tapping a rendered coverage point: we already have its image id from the
  // tile feature itself, so this skips straight to fetching that image
  // rather than doing a "nearest image" search.
  map.on('click', 'mapillary-coverage-layer', (e) => {
    if (!e.features.length) return;
    openMapillaryViewerById(e.features[0].properties.id);
  });
  map.on('mouseenter', 'mapillary-coverage-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'mapillary-coverage-layer', () => { map.getCanvas().style.cursor = ''; });
}

async function fetchMapillaryImage(imageId) {
  const url = `https://graph.mapillary.com/${imageId}?access_token=${CONFIG.MAPILLARY_ACCESS_TOKEN}&fields=id,thumb_1024_url,sequence`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapillary returned an error (HTTP ${res.status}).`);
  return res.json();
}

/** Used for search results / favorites / place-card, where the picked point
 * likely isn't exactly on a rendered coverage dot — searches within
 * MAPILLARY_SEARCH_RADIUS_M instead of requiring an exact hit. */
async function findNearestMapillaryImage(lat, lon) {
  const url = `https://graph.mapillary.com/images?access_token=${CONFIG.MAPILLARY_ACCESS_TOKEN}`
    + `&fields=id,thumb_1024_url,sequence&closeto=${lon},${lat}&radius=${CONFIG.MAPILLARY_SEARCH_RADIUS_M}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapillary returned an error (HTTP ${res.status}).`);
  const data = await res.json();
  return (data.data && data.data[0]) || null;
}

async function fetchMapillarySequenceIds(sequenceId) {
  const url = `https://graph.mapillary.com/image_ids?access_token=${CONFIG.MAPILLARY_ACCESS_TOKEN}&sequence_id=${sequenceId}`;
  const res = await fetch(url);
  if (!res.ok) return []; // non-fatal: viewer just won't offer prev/next
  const data = await res.json();
  return (data.data || []).map((d) => d.id);
}

function hideMapillaryViewer() {
  el.mapillaryViewer.classList.add('hidden');
}

function showMapillaryViewer({ loading, empty, error } = {}) {
  // This is the one true "opens the viewer" entry point — both
  // openMapillaryViewerById/Near call it first, before their loading state
  // ever resolves — so it's the right (and only) place to register the
  // back-button layer for the whole viewer session.
  if (el.mapillaryViewer.classList.contains('hidden')) pushBackLayer(hideMapillaryViewer);
  el.mapillaryViewer.classList.remove('hidden');
  el.mapillaryImage.classList.toggle('hidden', !!(loading || empty || error));
  el.mapillaryLoading.classList.toggle('hidden', !loading);
  el.mapillaryEmpty.classList.toggle('hidden', !empty);
  el.mapillaryError.classList.toggle('hidden', !error);
  if (error) el.mapillaryError.textContent = 'Could not load street-level imagery: ' + error;
  el.mapillaryPrevBtn.classList.add('hidden');
  el.mapillaryNextBtn.classList.add('hidden');
}

function renderMapillaryImage(img) {
  el.mapillaryViewer.classList.remove('hidden');
  el.mapillaryImage.src = img.thumb_1024_url;
  el.mapillaryImage.classList.remove('hidden');
  el.mapillaryLoading.classList.add('hidden');
  el.mapillaryEmpty.classList.add('hidden');
  el.mapillaryError.classList.add('hidden');
  const hasSeq = mapillarySequence.ids.length > 1 && mapillarySequence.index >= 0;
  el.mapillaryPrevBtn.classList.toggle('hidden', !hasSeq || mapillarySequence.index <= 0);
  el.mapillaryNextBtn.classList.toggle('hidden', !hasSeq || mapillarySequence.index >= mapillarySequence.ids.length - 1);
}

async function loadMapillaryImage(img) {
  mapillarySequence.ids = img.sequence ? await fetchMapillarySequenceIds(img.sequence) : [];
  mapillarySequence.index = mapillarySequence.ids.indexOf(img.id);
  renderMapillaryImage(img);
}

async function openMapillaryViewerById(imageId) {
  showMapillaryViewer({ loading: true });
  try {
    await loadMapillaryImage(await fetchMapillaryImage(imageId));
  } catch (err) {
    showMapillaryViewer({ error: err.message });
  }
}

async function openMapillaryViewerNear(lat, lon) {
  showMapillaryViewer({ loading: true });
  try {
    const img = await findNearestMapillaryImage(lat, lon);
    if (!img) { showMapillaryViewer({ empty: true }); return; }
    await loadMapillaryImage(img);
  } catch (err) {
    showMapillaryViewer({ error: err.message });
  }
}

async function stepMapillarySequence(delta) {
  const newIndex = mapillarySequence.index + delta;
  if (newIndex < 0 || newIndex >= mapillarySequence.ids.length) return;
  mapillarySequence.index = newIndex;
  try {
    renderMapillaryImage(await fetchMapillaryImage(mapillarySequence.ids[newIndex]));
  } catch (err) {
    showMapillaryViewer({ error: err.message });
  }
}

if (MAPILLARY_ENABLED) {
  el.mapillaryCloseBtn.addEventListener('click', goBackInApp);
  el.mapillaryViewer.addEventListener('click', (e) => {
    if (e.target === el.mapillaryViewer) goBackInApp(); // tap the backdrop to dismiss
  });
  el.mapillaryPrevBtn.addEventListener('click', () => stepMapillarySequence(-1));
  el.mapillaryNextBtn.addEventListener('click', () => stepMapillarySequence(1));
}

/** Builds a small camera-icon button that opens the street-view viewer for a
 * fixed point — used on search results, the place card, and favorites.
 * Returns null when Mapillary isn't configured, so call sites can skip
 * appending it entirely rather than adding a dead button. */
function streetViewButton(lat, lon) {
  if (!MAPILLARY_ENABLED) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'save-btn';
  btn.setAttribute('aria-label', 'Peek at street-level imagery');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M4 8 h3 l2-2 h6 l2 2 h3 v11 H4 Z"/><circle cx="12" cy="13" r="3.2"/></svg>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMapillaryViewerNear(lat, lon);
  });
  return btn;
}

// ============================================================================
// Milestone 3A — offline map tiles for a chosen region
//
// The download itself doesn't go through the service worker at all: the
// Cache API is available from the page just as it is from a service worker,
// so we open CONFIG.TILE_CACHE_NAME directly here and `cache.put()` each
// tile as it's fetched. The service worker's job (see sw.js) is purely to
// intercept MapLibre's future tile requests and serve from that same cache
// first — that's what makes the downloaded tiles actually get used offline,
// with no separate "offline mode" anywhere in the map layer itself.
// ============================================================================

/** Reads the MapLibre style JSON to find the vector tile URL template. Some
 * styles list `tiles` inline; others point at a separate TileJSON `url` that
 * has to be fetched too. Handling both keeps this working if OpenFreeMap (or
 * a self-hosted equivalent) changes which shape they publish. */
async function getTileUrlTemplate() {
  const res = await fetch(CONFIG.MAP_STYLE_URL);
  if (!res.ok) throw new Error('Could not read the map style to find its tile URLs.');
  const style = await res.json();
  const vectorSource = Object.values(style.sources || {}).find((s) => s.type === 'vector');
  if (!vectorSource) throw new Error('This map style has no vector tile source to download.');
  if (Array.isArray(vectorSource.tiles) && vectorSource.tiles.length) return vectorSource.tiles[0];
  if (vectorSource.url) {
    const tj = await fetch(vectorSource.url).then((r) => r.json());
    if (Array.isArray(tj.tiles) && tj.tiles.length) return tj.tiles[0];
  }
  throw new Error('Could not determine the tile URL pattern for this map style.');
}

function boundsToPlain(b) {
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
}

// Standard slippy-map tile math (Web Mercator).
function lonToTileX(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

function tilesForBounds({ west, south, east, north }, minZoom, maxZoom) {
  const tiles = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lonToTileX(west, z);
    const xMax = lonToTileX(east, z);
    const yMin = latToTileY(north, z);
    const yMax = latToTileY(south, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

function tileUrl(template, tile) {
  return template.replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);
}

let activeDownloadControl = null;

/** Fetches every tile with limited concurrency, retrying each one a few
 * times before giving up on it — one bad tile never aborts the whole batch.
 * `onProgress` is called after every attempt (success or final failure) so
 * the panel can show a live counter. Returns even if cancelled mid-way; the
 * caller decides what to do with a partial download. */
async function runTileDownload(template, tiles, onProgress) {
  const cache = await caches.open(CONFIG.TILE_CACHE_NAME);
  const control = { cancelled: false };
  activeDownloadControl = control;
  let done = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < tiles.length && !control.cancelled) {
      const tile = tiles[cursor++];
      const url = tileUrl(template, tile);
      let ok = false;
      for (let attempt = 0; attempt <= CONFIG.OFFLINE_TILE_MAX_RETRIES && !ok; attempt++) {
        try {
          const res = await fetch(url);
          if (res.ok) { await cache.put(url, res); ok = true; }
        } catch (err) {
          // Network hiccup — loop retries, or falls through to "failed" below.
        }
      }
      if (ok) done++; else failed++;
      onProgress({ done: done + failed, total: tiles.length, failed });
    }
  }

  await Promise.all(Array.from({ length: CONFIG.OFFLINE_TILE_CONCURRENCY }, worker));
  return { total: tiles.length, failed, cancelled: control.cancelled };
}

async function deleteDownloadedAreaTiles(area) {
  const cache = await caches.open(CONFIG.TILE_CACHE_NAME);
  const tiles = tilesForBounds(area.bounds, area.minZoom, area.maxZoom);
  // NOTE: if two downloaded areas overlap, this deletes their shared tiles
  // too — there's no reference counting across areas. That's a deliberate
  // simplification for a personal, single-user tool: worst case, an
  // overlapping tile just gets silently re-fetched next time you're online
  // in that spot, rather than staying available offline until re-downloaded.
  await Promise.all(tiles.map((t) => cache.delete(tileUrl(area.template, t))));
}

async function renderStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) {
    el.storageEstimate.textContent = '';
    return;
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    el.storageEstimate.textContent = `Using about ${formatBytes(usage)} of ${formatBytes(quota)} available on this device.`;
  } catch (err) {
    el.storageEstimate.textContent = '';
  }
}

async function renderDownloadedAreasList() {
  let areas = [];
  try {
    areas = await getDownloadedAreas();
  } catch (err) {
    showStatus('Could not load downloaded areas: ' + err.message, 'error');
  }
  el.downloadedAreasList.innerHTML = '';
  if (!areas.length) {
    el.downloadedAreasList.innerHTML = '<li class="empty">No areas downloaded yet.</li>';
    return;
  }
  areas.forEach((area) => {
    const li = document.createElement('li');
    const label = area.name
      || `${area.bounds.south.toFixed(2)}, ${area.bounds.west.toFixed(2)} to ${area.bounds.north.toFixed(2)}, ${area.bounds.east.toFixed(2)}`;
    const body = document.createElement('div');
    body.className = 'saved-item-body';
    body.innerHTML = `<div class="saved-item-title">${escapeHtml(label)}</div>
      <div class="saved-item-meta">Zoom ${area.minZoom}–${area.maxZoom} · ${area.tileCount.toLocaleString()} tiles`
      + `${area.failedCount ? ` (${area.failedCount} failed)` : ''}</div>`;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn small delete-btn';
    del.setAttribute('aria-label', 'Delete this downloaded area');
    del.innerHTML = trashIcon();
    del.addEventListener('click', async () => {
      try {
        await deleteDownloadedAreaTiles(area);
        await deleteDownloadedArea(area.id);
        await renderDownloadedAreasList();
        await renderStorageEstimate();
        showStatus('Downloaded area removed.', 'success');
      } catch (err) {
        showStatus('Could not remove this downloaded area: ' + err.message, 'error');
      }
    });

    li.appendChild(body);
    li.appendChild(del);
    el.downloadedAreasList.appendChild(li);
  });
}

let pendingDownloadBounds = null;

function updateTileEstimate() {
  if (!pendingDownloadBounds) return;
  const minZ = parseInt(el.zoomMinInput.value, 10);
  const maxZ = parseInt(el.zoomMaxInput.value, 10);
  if (Number.isNaN(minZ) || Number.isNaN(maxZ) || minZ > maxZ) {
    el.tileEstimate.textContent = 'Enter a valid zoom range.';
    return;
  }
  const count = tilesForBounds(pendingDownloadBounds, minZ, maxZ).length;
  // ~15 KB/tile is a rough average for vector tiles — enough to give a sense
  // of scale, not an exact figure.
  el.tileEstimate.textContent = `~${count.toLocaleString()} tiles (roughly ${formatBytes(count * 15000)})`;
}
el.zoomMinInput.addEventListener('input', updateTileEstimate);
el.zoomMaxInput.addEventListener('input', updateTileEstimate);

el.offlineBtn.addEventListener('click', async () => {
  pendingDownloadBounds = boundsToPlain(map.getBounds());
  el.zoomMinInput.value = CONFIG.OFFLINE_MIN_ZOOM_DEFAULT;
  el.zoomMaxInput.value = CONFIG.OFFLINE_MAX_ZOOM_DEFAULT;
  el.areaNameInput.value = '';
  updateTileEstimate();
  await renderDownloadedAreasList();
  await renderStorageEstimate();
  pushBackLayer(() => el.offlinePanel.classList.add('hidden'));
  el.offlinePanel.classList.remove('hidden');
});
el.offlineCloseBtn.addEventListener('click', goBackInApp);

el.downloadAreaBtn.addEventListener('click', async () => {
  if (!pendingDownloadBounds) return;
  const minZoom = parseInt(el.zoomMinInput.value, 10);
  const maxZoom = parseInt(el.zoomMaxInput.value, 10);
  if (Number.isNaN(minZoom) || Number.isNaN(maxZoom) || minZoom > maxZoom || minZoom < 0 || maxZoom > 20) {
    showStatus('Enter a valid zoom range (0–20, min at or below max).', 'error');
    return;
  }

  el.downloadAreaBtn.disabled = true;
  el.downloadProgress.classList.remove('hidden');
  el.downloadProgressFill.style.width = '0%';
  el.downloadProgressText.textContent = 'Starting…';
  const bounds = pendingDownloadBounds;

  try {
    const template = await getTileUrlTemplate();
    const tiles = tilesForBounds(bounds, minZoom, maxZoom);
    const result = await runTileDownload(template, tiles, (progress) => {
      el.downloadProgressFill.style.width = `${(progress.done / progress.total) * 100}%`;
      el.downloadProgressText.textContent = `${progress.done} / ${progress.total} tiles`
        + (progress.failed ? ` (${progress.failed} failed)` : '');
    });

    await addDownloadedArea({
      name: el.areaNameInput.value.trim() || null,
      bounds,
      minZoom,
      maxZoom,
      tileCount: result.total - result.failed,
      failedCount: result.failed,
      template,
    });

    if (result.cancelled) {
      showStatus(`Download cancelled — kept ${result.total - result.failed} of ${result.total} tiles fetched so far.`, 'error');
    } else if (result.failed) {
      showStatus(`Downloaded with ${result.failed} tile(s) that couldn't be fetched after retrying.`, 'error');
    } else {
      showStatus('Area downloaded for offline use.', 'success');
    }
    await renderDownloadedAreasList();
    await renderStorageEstimate();
  } catch (err) {
    showStatus('Could not download this area: ' + err.message, 'error');
  } finally {
    el.downloadAreaBtn.disabled = false;
    el.downloadProgress.classList.add('hidden');
    activeDownloadControl = null;
  }
});

el.cancelDownloadBtn.addEventListener('click', () => {
  if (activeDownloadControl) activeDownloadControl.cancelled = true;
});

// ============================================================================
// Geocoding (Nominatim) with debounced, rate-limited autocomplete
// ============================================================================
const nominatimLimiter = createLimiter(CONFIG.NOMINATIM_MIN_INTERVAL_MS);

// Session-only cache keyed by normalized query text (Milestone 3B): re-searching
// something already looked up this session returns instantly with no network
// call, no rate-limit wait, and works even with no connection at all.
const nominatimCache = new Map();

/** Empty string when GEOCODE_COUNTRY_CODES is unset, so callers can just
 * concatenate this without any conditional branching. */
function countryCodesParam() {
  return CONFIG.GEOCODE_COUNTRY_CODES ? `&countrycodes=${CONFIG.GEOCODE_COUNTRY_CODES}` : '';
}

/** Raw Nominatim /search call, shared by every geocoding path below
 * (plain search, "near X" anchor lookup, category-tag search, and the
 * bounded free-text fallback) so the fetch/error-handling logic exists in
 * exactly one place. `extraParams` is any additional already-encoded query
 * string fragment (e.g. a viewbox). */
async function nominatimSearch(qParam, extraParams = '') {
  await nominatimLimiter();
  const url = `${CONFIG.NOMINATIM_URL}/search?format=jsonv2&limit=10&q=${encodeURIComponent(qParam)}${countryCodesParam()}${extraParams}`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error('Could not reach the geocoding service. Check your connection or the Nominatim server address.');
  }
  if (!res.ok) throw new Error(`The geocoding service returned an error (HTTP ${res.status}).`);
  const data = await res.json();
  return data.map((r) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    // Only present when the caller asked for &extratags=1 AND the OSM
    // feature happens to have this tag — sparse in practice, so callers
    // must handle it being null rather than assuming every POI has hours.
    openingHours: (r.extratags && r.extratags.opening_hours) || null,
  }));
}

/** Adds `.distanceM` (straight-line, not route distance) from `lat,lon` to
 * every result and sorts nearest-first — used for every "near X" style
 * result list so it reads the way Google Maps' POI lists do. */
function decorateWithDistance(results, lat, lon) {
  return results
    .map((r) => ({ ...r, distanceM: turf.distance([lon, lat], [r.lon, r.lat], { units: 'meters' }) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** Same idea as decorateWithDistance, but for "along the route" results:
 * snaps each result onto the route line (the same turf.nearestPointOnLine
 * used for live GPS snapping in Milestone 2) so `.distanceM` is distance
 * *along the route* to the nearest point — "comes up in 12km", not a
 * straight-line distance from the start that a winding road would make
 * misleading. Also drops anything too far off the route to plausibly be
 * "on the way" (a wide search-sample radius can occasionally pull in a
 * result nearer a different road entirely). */
function decorateWithRouteDistance(results, lineFeature) {
  const MAX_OFFSET_M = 2000;
  return results
    .map((r) => {
      const snapped = turf.nearestPointOnLine(lineFeature, turf.point([r.lon, r.lat]), { units: 'meters' });
      return { ...r, distanceM: snapped.properties.location, offsetM: snapped.properties.dist };
    })
    .filter((r) => r.offsetM <= MAX_OFFSET_M)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** `&bounded=1&viewbox=...` — confirmed by direct testing that `bounded=1`
 * is what actually makes Nominatim honour the box as a hard filter; the
 * viewbox alone is just a soft ranking hint and gets routinely ignored
 * (e.g. a fuel-station search near Mumbai returned stations in Germany
 * without it). `radiusDeg` of 0.03 is roughly 3km at Indian latitudes. */
function viewboxParam(lat, lon, radiusDeg) {
  return `&bounded=1&viewbox=${lon - radiusDeg},${lat - radiusDeg},${lon + radiusDeg},${lat + radiusDeg}`;
}

// Session-only cache keyed by (tag, rounded lat/lon) — same idea as
// nominatimCache/valhallaCache above. Re-opening a category chip without
// panning the map, or re-checking a "search along route" category you
// already looked at for this trip, returns instantly with no network call.
// Rounding to 3 decimal places (~110m) is small relative to the ~3km search
// radius below, so it can't fold together two genuinely different searches.
const categorySearchCache = new Map();
function categorySearchCacheKey(tag, lat, lon) {
  return `${tag}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
}

/** Nominatim's bracket syntax (`q=[amenity=fuel]`) searches by OSM tag
 * rather than by name — this is what makes "petrol pumps near me" work at
 * all, since petrol pumps mostly aren't individually named in OSM. Tries
 * the default radius first, then a wider one, since some categories (EV
 * charging especially) have genuinely sparse OSM coverage in India and a
 * too-tight box can come back empty even where results do exist nearby. */
async function categorySearchNear(tag, lat, lon) {
  const cacheKey = categorySearchCacheKey(tag, lat, lon);
  if (categorySearchCache.has(cacheKey)) return categorySearchCache.get(cacheKey);
  for (const radiusDeg of [CONFIG.GEOCODE_NEAR_RADIUS_DEG_DEFAULT, CONFIG.GEOCODE_NEAR_RADIUS_DEG_WIDE]) {
    const results = await nominatimSearch(`[${tag}]`, viewboxParam(lat, lon, radiusDeg) + '&extratags=1');
    if (results.length) {
      categorySearchCache.set(cacheKey, results);
      return results;
    }
  }
  categorySearchCache.set(cacheKey, []);
  return [];
}

/** How many points along the route to sample for an along-route category
 * search — few enough to stay reasonably fast against a rate-limited public
 * Nominatim instance, more for longer trips where a couple of samples would
 * miss most of the route entirely. */
function sampleCountForRoute(totalDistM) {
  if (totalDistM < 10000) return 2;
  if (totalDistM < 50000) return 4;
  return 6;
}

/** Evenly-spaced [lon,lat] points along the route geometry, always
 * including the very first and last point. */
function sampleRouteAnchors(coords, maxSamples) {
  if (coords.length <= maxSamples) return coords;
  const step = (coords.length - 1) / (maxSamples - 1);
  const samples = [];
  for (let i = 0; i < maxSamples; i++) samples.push(coords[Math.round(i * step)]);
  return samples;
}

/** "Restaurants along my route": since Nominatim's viewbox is a single
 * rectangle, not a corridor around a path, one search can't cover a whole
 * route — instead this runs a normal categorySearchNear() at several points
 * sampled along the route and merges/dedupes the results. One bad sample
 * (network hiccup) doesn't abort the rest; it only surfaces as an error if
 * *every* sample failed, so the driver isn't left thinking "no restaurants"
 * when the real story is "the search failed outright".
 *
 * `waypoints` (origin, every stop, destination) are always searched
 * individually on top of the evenly-spaced interpolated samples below —
 * without this, a short or round trip (destination == origin) could see
 * `sampleRouteAnchors` collapse to just 2 anchors that both land on the
 * same start/end point, leaving every stop in between completely
 * unsearched. Anchors that end up geographically identical (exactly this
 * round-trip case) are still cheap: categorySearchNear's cache collapses
 * same-rounded-coordinate lookups to one real request. */
async function categorySearchAlongRoute(tag, coords, totalDistM, waypoints = []) {
  const waypointAnchors = waypoints.map((w) => [w.lon, w.lat]);
  const interpolatedAnchors = sampleRouteAnchors(coords, sampleCountForRoute(totalDistM));
  const anchors = [...waypointAnchors, ...interpolatedAnchors];
  const seen = new Set();
  const merged = [];
  let lastError = null;
  let anySucceeded = false;

  for (const [lon, lat] of anchors) {
    try {
      const results = await categorySearchNear(tag, lat, lon);
      anySucceeded = true;
      for (const r of results) {
        const key = `${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (!anySucceeded && lastError) throw lastError;
  return merged;
}

// Keyword → OSM tag mapping. Deliberately broader than just the 8 category
// chips, so a typed "near X" query (e.g. "chemist near Marine Drive") can
// still resolve to a tag-based search instead of falling through to the
// much less reliable free-text fallback below.
const CATEGORY_KEYWORDS = [
  { tag: 'amenity=fuel', keys: ['fuel', 'petrol', 'gas station', 'diesel'] },
  { tag: 'amenity=charging_station', keys: ['ev charging', 'ev station', 'charging station', 'electric vehicle', 'charging'] },
  { tag: 'amenity=pharmacy', keys: ['pharmacy', 'chemist', 'medical store', 'medicine shop'] },
  { tag: 'amenity=atm', keys: ['atm', 'cash machine', 'cash point'] },
  { tag: 'amenity=hospital', keys: ['hospital', 'clinic', 'emergency room'] },
  { tag: 'amenity=restaurant', keys: ['restaurant', 'food', 'dining', 'eatery'] },
  { tag: 'amenity=parking', keys: ['parking', 'car park'] },
  { tag: 'tourism=hotel', keys: ['hotel', 'lodging', 'accommodation'] },
];

function matchCategoryTag(subject) {
  const s = subject.toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keys.some((k) => s.includes(k))) return entry.tag;
  }
  return null;
}

// Matches "<subject> near/close to/around/in <place>" — case-insensitive,
// subject and place both required and non-empty. "in" covers the equally
// natural "EV charging stations in Kakkanad" phrasing, not just "near X" —
// the `\s+...\s+` on both sides means it only matches "in" as its own
// whitespace-delimited word, so it can't misfire on words that merely
// contain "in" (e.g. "parking", "within").
const NEAR_QUERY_PATTERN = /^(.+?)\s+(?:near|close to|around|in)\s+(.+)$/i;

/** "EV charging near Gateway of India" (or "EV charging in Kochi") → geocode
 * the place first as the anchor, then search "EV charging" around that
 * anchor rather than near the device's own location — the whole point of a
 * location-biased "X near/in Y" query. */
async function geocodeNear(subject, anchorQuery) {
  const anchorResults = await nominatimSearch(anchorQuery);
  if (!anchorResults.length) throw new Error(`Could not find "${anchorQuery}" to search near.`);
  const anchor = anchorResults[0];

  const tag = matchCategoryTag(subject);
  if (tag) {
    const results = await categorySearchNear(tag, anchor.lat, anchor.lon);
    if (results.length) return results;
  }
  // Fall back to a bounded free-text search. Confirmed via testing this is
  // markedly less reliable than the tag-based search (natural-language
  // "petrol pump near X" phrasing alone returns zero results from
  // Nominatim), but bounding a plain-text query to the anchor's area is
  // still better than an unconstrained search that could return anywhere.
  return nominatimSearch(subject, viewboxParam(anchor.lat, anchor.lon, CONFIG.GEOCODE_NEAR_RADIUS_DEG_WIDE));
}

async function geocodeSearch(query) {
  const trimmed = query.trim();
  const cacheKey = trimmed.toLowerCase();
  if (nominatimCache.has(cacheKey)) return nominatimCache.get(cacheKey);

  const nearMatch = trimmed.match(NEAR_QUERY_PATTERN);
  const results = nearMatch
    ? await geocodeNear(nearMatch[1].trim(), nearMatch[2].trim())
    : await nominatimSearch(trimmed);

  nominatimCache.set(cacheKey, results);
  return results;
}

/** Wires a text input + its suggestion <ul> to Nominatim. `onSelect` is
 * called with a {label,lat,lon} result when the user picks one, or with
 * `null` as soon as they start typing again (so a stale pick can never be
 * silently submitted as if it were still valid). */
function hideSuggestionList(listEl) {
  listEl.classList.add('hidden');
  listEl.innerHTML = '';
}

/** Shown the moment a search actually fires, so there's visible feedback
 * while Nominatim's match is in flight (typically a couple hundred ms,
 * longer on a self-hosted instance under load, or for a "near X" search
 * which needs two sequential requests — see geocodeNear()). */
function showSuggestionLoading(listEl) {
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'loading';
  li.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Searching…</span>';
  listEl.appendChild(li);
  listEl.classList.remove('hidden');
}

/** Renders a results list into `listEl`, identically whether it came from
 * live-typed autocomplete or a one-tap category search — same bold-name/
 * dim-address row, save star, and street-view button everywhere. `inputEl`
 * is optional (category search has no single field to fill in). */
function renderSuggestionResults(listEl, inputEl, results, onSelect, emptyMessage, distanceSuffix = 'away') {
  listEl.innerHTML = '';
  if (!results.length) {
    hideSuggestionList(listEl);
    if (emptyMessage) showStatus(emptyMessage, 'info');
    return;
  }
  results.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'result-item';

    const { primary, secondary } = splitPlaceLabel(r.label);
    // Distance/hours meta line — only present on results that came from a
    // category/along-route search (decorateWithDistance + extratags=1);
    // plain live-typed autocomplete results never have these, so the line
    // just doesn't render for those, no separate code path needed.
    const metaParts = [];
    if (r.distanceM != null) metaParts.push(formatDistance(r.distanceM) + ' ' + distanceSuffix);
    if (r.openingHours) metaParts.push(r.openingHours);
    const text = document.createElement('span');
    text.className = 'result-text';
    text.innerHTML = `<span class="result-primary">${escapeHtml(primary)}</span>`
      + (secondary ? `<span class="result-secondary">${escapeHtml(secondary)}</span>` : '')
      + (metaParts.length ? `<span class="result-meta">${escapeHtml(metaParts.join(' · '))}</span>` : '');
    text.addEventListener('click', () => {
      if (inputEl) inputEl.value = primary; // the field shows the short name; r.label (full address) is kept in state for accuracy elsewhere
      hideSuggestionList(listEl);
      onSelect(r);
    });

    // Save-to-favorites star (Milestone 3C) — stopPropagation so tapping
    // it saves the place without also picking it as the field's value.
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'save-btn';
    saveBtn.setAttribute('aria-label', 'Save to favorites');
    saveBtn.innerHTML = starIcon();
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await addFavorite({ label: r.label, lat: r.lat, lon: r.lon });
        saveBtn.classList.add('saved');
        showStatus('Saved to favorites.', 'success');
      } catch (err) {
        showStatus('Could not save this favorite: ' + err.message, 'error');
      }
    });

    li.appendChild(text);
    const svBtn = streetViewButton(r.lat, r.lon); // null when Mapillary isn't configured
    if (svBtn) li.appendChild(svBtn);
    li.appendChild(saveBtn);
    listEl.appendChild(li);
  });
  listEl.classList.remove('hidden');
}

function setupAutocomplete(inputEl, listEl, onSelect) {
  let debounceTimer = null;
  let seq = 0; // guards against out-of-order network responses

  inputEl.addEventListener('input', () => {
    onSelect(null);
    const query = inputEl.value.trim();
    clearTimeout(debounceTimer);
    hideSuggestionList(listEl);
    if (query.length < 3) return;
    debounceTimer = setTimeout(async () => {
      const mySeq = ++seq;
      showSuggestionLoading(listEl);
      try {
        const results = await geocodeSearch(query);
        if (mySeq !== seq) return; // a newer keystroke has already superseded this
        renderSuggestionResults(listEl, inputEl, results, onSelect, 'No matching places found for that search.');
      } catch (err) {
        if (mySeq !== seq) return;
        hideSuggestionList(listEl);
        showStatus(err.message, 'error');
      }
    }, CONFIG.NOMINATIM_DEBOUNCE_MS);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== inputEl && !listEl.contains(e.target)) hideSuggestionList(listEl);
  });
}

function showPlaceCard({ label, lat, lon }) {
  const { primary, secondary } = splitPlaceLabel(label);
  el.placeCardPrimary.textContent = primary;
  el.placeCardSecondary.textContent = secondary;
  const existingBtn = el.placeCardActions.querySelector('.street-view-btn');
  if (existingBtn) existingBtn.remove();
  const svBtn = streetViewButton(lat, lon); // null when Mapillary isn't configured
  if (svBtn) {
    svBtn.classList.add('street-view-btn');
    el.placeCardActions.insertBefore(svBtn, el.placeClearBtn);
  }
  el.placeCard.classList.remove('hidden');
}
function hidePlaceCard() {
  el.placeCard.classList.add('hidden');
}

/** The place card's own close-layer callback (registered via pushBackLayer).
 * Kept minimal and side-effect-only — it must NOT itself touch the back
 * stack (see forgetBackLayerIfTop below), since popstate already owns
 * popping when this runs as a real back-triggered close. */
function closePlaceCard() {
  state.to = null;
  updatePlanningMarkers();
  hidePlaceCard();
}

// ---- Default view: single search box, Google-Maps-style "search here" ----
/** Sets `picked` as the destination and shows its place card — shared by
 * the main search box and one-tap category results, so picking a nearby
 * pharmacy from a category search behaves exactly like picking any other
 * search result. The card can also close as a side effect of typing a new
 * query (setupAutocomplete's onSelect(null) below) rather than via its own
 * dismiss button — forgetBackLayerIfTop keeps the back-stack honest either
 * way without routing every keystroke through history.back(). */
function selectPlace(picked) {
  state.to = picked;
  updatePlanningMarkers();
  if (picked) {
    if (el.placeCard.classList.contains('hidden')) pushBackLayer(closePlaceCard);
    showPlaceCard(picked);
    map.flyTo({ center: [picked.lon, picked.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  } else {
    forgetBackLayerIfTop(closePlaceCard);
    hidePlaceCard();
  }
}

setupAutocomplete(el.placeInput, el.placeSuggestions, selectPlace);

el.placeClearBtn.addEventListener('click', () => {
  el.placeInput.value = '';
  goBackInApp();
});

// ---- One-tap POI category search (petrol, EV charging, pharmacy, ...) ----
const CHIP_CATEGORY_TAGS = {
  fuel: 'amenity=fuel',
  ev: 'amenity=charging_station',
  pharmacy: 'amenity=pharmacy',
  atm: 'amenity=atm',
  hospital: 'amenity=hospital',
  restaurant: 'amenity=restaurant',
  parking: 'amenity=parking',
  hotel: 'tourism=hotel',
};

el.categoryChips.querySelectorAll('.chip').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const tag = CHIP_CATEGORY_TAGS[btn.dataset.category];
    const label = btn.dataset.label;
    el.placeInput.value = label;
    showSuggestionLoading(el.placeSuggestions);
    try {
      // Search around the current map view, not the device's GPS location —
      // this is "what's near what I'm looking at", matching how someone
      // would actually use the chips while panning around the map.
      const center = map.getCenter();
      const rawResults = await categorySearchNear(tag, center.lat, center.lng);
      const results = decorateWithDistance(rawResults, center.lat, center.lng);
      // Picking any one result clears the rest of the candidate markers —
      // once you've chosen, the other options aren't relevant anymore.
      const onPick = (r) => { clearPoiMarkers(); selectPlace(r); };
      showPoiMarkers(results, onPick);
      renderSuggestionResults(el.placeSuggestions, el.placeInput, results, onPick, `No ${label.toLowerCase()} found nearby. Try panning the map or zooming out.`);
    } catch (err) {
      hideSuggestionList(el.placeSuggestions);
      showStatus(err.message, 'error');
    }
  });
});

// ---- "Search along the route" (shown once a drive route is planned) ------

/** Leaves whatever the bottom sheet's "search along route" results view was
 * showing and goes back to the plain turn-by-turn list — called when
 * backing out of a search, when a stop actually gets added (the updated
 * maneuver list is what should show next), and whenever navigation/route
 * state changes underneath it (starting nav, ending it, cancelling). */
function resetToRouteView() {
  el.poiResultsHeader.classList.add('hidden');
  el.poiResultsList.classList.add('hidden');
  el.maneuverList.classList.remove('hidden');
  clearPoiMarkers();
}

el.poiBackBtn.addEventListener('click', goBackInApp);

/** Appends `picked` as a new stop just before the destination and re-plans
 * the route immediately — this is the "along the route" selection
 * behaviour the plain search doesn't have: picking a result modifies the
 * current trip instead of replacing the destination or requiring a fresh
 * "Get directions" tap. */
async function addStopFromPoi(picked) {
  forgetBackLayerIfTop(resetToRouteView); // closing by side effect (a pick was made), not via goBackInApp
  resetToRouteView();
  addStopRow(picked);
  showStatus(`Adding ${splitPlaceLabel(picked.label).primary} as a stop…`, 'info', { sticky: true });
  try {
    // Mid-drive (picked from the "ahead" search), route from where you
    // actually are, through only the stops not yet visited — exactly like
    // triggerReroute's off-route recalculation. Otherwise (still planning)
    // this is unchanged: from the origin, through every stop.
    const isMidDrive = state.navigating && state.lastFix;
    const fromPoint = isMidDrive ? { lat: state.lastFix.lat, lon: state.lastFix.lng } : state.from;
    const stops = isMidDrive ? getStops().slice(state.currentLegIndex) : getStops();
    if (!isMidDrive) state.currentLegIndex = 0; // mid-drive: left alone, the next GPS fix recomputes it against the new route
    const { trip } = await requestRoute(fromPoint, state.to, stops); // no alternates — adding a stop already commits you to a specific trip
    state.routeOptions = [trip];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    await renderRoute(trip, { stops, fitView: !isMidDrive }); // mid-drive: camera stays following the puck
    showStatus(`Added ${splitPlaceLabel(picked.label).primary} as a stop.`, 'success');
  } catch (err) {
    showStatus('Could not add that stop: ' + err.message, 'error');
  }
}

/** Reveals the "search along route" popover positioned just above
 * #route-search-btn, wherever that button currently sits — computed from
 * its live bounding rect rather than a hardcoded offset so this keeps
 * working regardless of how tall the FAB stack above it is (the Mapillary
 * button only sometimes appears). Tracked on the back-stack like every
 * other dismissable overlay this app has: hardware back or tapping outside
 * both close it via goBackInApp. */
function openRouteChipsPopover() {
  const btnRect = el.routeSearchBtn.getBoundingClientRect();
  el.routeChips.style.bottom = `${window.innerHeight - btnRect.top + 10}px`;
  el.routeChips.classList.remove('hidden');
  el.routeSearchBtn.classList.add('active');
  el.routeSearchBtn.setAttribute('aria-expanded', 'true');
  pushBackLayer(closeRouteChipsPopover);
  document.addEventListener('pointerdown', onOutsideRouteChipsPointerDown, { capture: true });
}

function closeRouteChipsPopover() {
  el.routeChips.classList.add('hidden');
  el.routeSearchBtn.classList.remove('active');
  el.routeSearchBtn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onOutsideRouteChipsPointerDown, { capture: true });
}

function onOutsideRouteChipsPointerDown(e) {
  if (el.routeChips.contains(e.target) || el.routeSearchBtn.contains(e.target)) return;
  goBackInApp();
}

el.routeSearchBtn.addEventListener('click', () => {
  if (el.routeChips.classList.contains('hidden')) openRouteChipsPopover();
  else goBackInApp();
});

/** Shows/hides the along-route search feature as a whole (the FAB, not just
 * the popover) — used everywhere the feature becomes available or
 * unavailable (route planned/canceled, navigation started/ended, transit
 * mode). If the popover happens to be open when the feature is hidden out
 * from under it (e.g. Cancel while it's open), close it too rather than
 * leaving an orphaned open popover with an invisible trigger button. */
function showRouteSearchFeature() {
  el.routeSearchBtn.classList.remove('hidden');
}
function hideRouteSearchFeature() {
  el.routeSearchBtn.classList.add('hidden');
  if (!el.routeChips.classList.contains('hidden')) {
    forgetBackLayerIfTop(closeRouteChipsPopover);
    closeRouteChipsPopover();
  }
}

/** What "along the route" means depends on whether you're still planning or
 * actually driving. Before navigation, it's the whole route — origin,
 * every stop, destination. Once navigating, re-searching the whole original
 * route would keep surfacing places behind you that you've already passed;
 * Google Maps scopes its own along-route search to what's still ahead once
 * you're underway, so this does the same — sliced from the live GPS
 * position to the destination, with stops already visited dropped. Using
 * the sliced line (not the full one) for the returned `lineFeature` also
 * means downstream distance labels read as "X km ahead of you" rather than
 * "X km from where you originally started". */
function routeSearchScope() {
  if (!state.navigating || !state.lastFix || state.traveledM == null) {
    return {
      lineFeature: state.route.lineFeature,
      coords: state.route.coords,
      totalDistM: state.route.totalDistM,
      waypoints: [state.from, ...getStops(), state.to],
    };
  }
  const currentPoint = { lat: state.lastFix.lat, lon: state.lastFix.lng };
  const remainingM = Math.max(0, state.route.totalDistM - state.traveledM);
  if (remainingM < 200) {
    // Essentially at the destination already — nothing meaningful to slice.
    const here = [state.lastFix.lng, state.lastFix.lat];
    return {
      lineFeature: turf.lineString([here, here]),
      coords: [here],
      totalDistM: 0,
      waypoints: [currentPoint, state.to],
    };
  }
  const ahead = turf.lineSliceAlong(state.route.lineFeature, state.traveledM, state.route.totalDistM, { units: 'meters' });
  return {
    lineFeature: ahead,
    coords: ahead.geometry.coordinates,
    totalDistM: remainingM,
    waypoints: [currentPoint, ...getStops().slice(state.currentLegIndex), state.to],
  };
}

el.routeChips.querySelectorAll('.chip').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (!state.route) return;
    forgetBackLayerIfTop(closeRouteChipsPopover); // closing by side effect of picking a category, not via goBackInApp
    closeRouteChipsPopover();
    const tag = CHIP_CATEGORY_TAGS[btn.dataset.category];
    const label = btn.dataset.label;
    const scope = routeSearchScope();

    el.poiResultsLabel.textContent = state.navigating ? `${label} ahead` : `${label} along your route`;
    el.poiResultsHeader.classList.remove('hidden');
    el.maneuverList.classList.add('hidden');
    el.bottomSheet.classList.add('expanded');
    pushBackLayer(resetToRouteView);
    showSuggestionLoading(el.poiResultsList);

    try {
      const rawResults = await categorySearchAlongRoute(tag, scope.coords, scope.totalDistM, scope.waypoints);
      const results = decorateWithRouteDistance(rawResults, scope.lineFeature);
      const onPick = (r) => { clearPoiMarkers(); addStopFromPoi(r); };
      showPoiMarkers(results, onPick);
      renderSuggestionResults(
        el.poiResultsList, null, results, onPick,
        `No ${label.toLowerCase()} found ${state.navigating ? 'ahead' : 'along this route'}.`,
        state.navigating ? 'ahead' : 'along your route',
      );
    } catch (err) {
      hideSuggestionList(el.poiResultsList);
      showStatus(err.message, 'error');
    }
  });
});

/** Switches the search card between the single-search view and the from/to
 * directions editor. Shared by the "Directions" button, the back arrow, and
 * tapping a favorite/recent entry (Milestone 3C), so there's one place that
 * knows which sibling elements need to hide/show together. Doesn't touch the
 * back-stack itself — callers decide whether entering directions is a new
 * layer (pushBackLayer) or just a mode flip within a layer already tracked
 * some other way (see cancelPlannedRoute, which calls this directly). */
function setPlanningUiMode(mode) {
  const isSimple = mode === 'simple';
  el.searchSimple.classList.toggle('hidden', !isSimple);
  el.searchDirections.classList.toggle('hidden', isSimple);
  if (!isSimple) el.placeCard.classList.add('hidden');
}

/** Jumps straight into directions mode with the given origin/destination
 * already filled in and ready to route — used by favorites and recent trips,
 * where the intent is clearly "take me here now" rather than "look this up". */
function shortLabel(place) {
  return place ? splitPlaceLabel(place.label).primary : '';
}

/** The directions editor's own back arrow AND the hardware/gesture back
 * button both end up here (see goBackInApp) — leaving directions mode always
 * means "return to simple search", restoring the destination place card if
 * there was one, exactly like Google Maps dropping you back on the search
 * result you started from. */
function leaveDirectionsMode() {
  setPlanningUiMode('simple');
  if (state.to) {
    el.placeInput.value = shortLabel(state.to);
    showPlaceCard(state.to);
    pushBackLayer(closePlaceCard); // this popstate consumed the directions layer; the place card it reveals is a new closeable layer of its own
  }
}

function goToDirections({ from, to } = {}) {
  if (from) state.from = from;
  if (to) state.to = to;
  clearStops(); // a favorite/recent pick starts a fresh trip — don't carry over a previous one's stops; also redraws markers
  el.fromInput.value = shortLabel(state.from);
  el.toInput.value = shortLabel(state.to);
  setPlanningUiMode('directions');
  pushBackLayer(leaveDirectionsMode);
  if (!state.from) el.fromInput.focus();
}

el.placeDirectionsBtn.addEventListener('click', () => {
  el.toInput.value = shortLabel(state.to);
  clearStops();
  setPlanningUiMode('directions');
  pushBackLayer(leaveDirectionsMode);
  el.fromInput.focus();
});

el.directionsBackBtn.addEventListener('click', goBackInApp);

// ============================================================================
// Milestone 3C — favorites & recent trips
//
// Google-Maps-style placement: these never occupy permanent screen space.
// They appear inside a field's own suggestions dropdown the moment you focus
// it empty, exactly where a search result would go, and vanish the instant
// you type or pick something. See showQuickPicksFor() below.
// ============================================================================

function clockIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7 v5 l3 3"/></svg>';
}
function locationPinIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.58 7-12A7 7 0 0 0 5 9c0 4.42 7 12 7 12z"/>'
    + '<circle cx="12" cy="9" r="2.5"/></svg>';
}

/** One row inside a suggestions dropdown for a recent trip or favorite:
 * icon + label on the left (tap to route there), a small delete button on
 * the right. Reuses the same `.result-item`/`.save-btn` layout as a normal
 * search result, so it costs no extra vertical space or new visual language. */
function quickPickRow({ iconSvg, label, onSelect, onDelete, extraBtn }) {
  const li = document.createElement('li');
  li.className = 'result-item';

  const text = document.createElement('span');
  text.className = 'result-text';
  text.innerHTML = `<span class="quick-pick-text">${iconSvg}<span>${escapeHtml(label)}</span></span>`;
  text.addEventListener('click', onSelect);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'save-btn';
  del.setAttribute('aria-label', 'Remove');
  del.innerHTML = trashIcon();
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    await onDelete();
  });

  li.appendChild(text);
  if (extraBtn) li.appendChild(extraBtn);
  li.appendChild(del);
  return li;
}

/** Appends up to a handful of recent trips + favorites to `listEl`. Returns
 * true if anything was added, so the caller knows whether to reveal the
 * (otherwise-empty) dropdown at all. `onChanged` re-renders after a delete. */
async function appendQuickPicks(listEl, onChanged) {
  let recents = [];
  let favorites = [];
  try { recents = (await getRecentTrips()).slice(0, 4); } catch (err) { /* non-critical UI enhancement */ }
  try { favorites = (await getFavorites()).slice(0, 5); } catch (err) { /* non-critical UI enhancement */ }
  if (!recents.length && !favorites.length) return false;

  recents.forEach((trip) => {
    listEl.appendChild(quickPickRow({
      iconSvg: clockIcon(),
      label: `${splitPlaceLabel(trip.originLabel).primary} → ${splitPlaceLabel(trip.destLabel).primary}`,
      onSelect: () => {
        listEl.classList.add('hidden');
        goToDirections({
          from: { label: trip.originLabel, lat: trip.originLat, lon: trip.originLon },
          to: { label: trip.destLabel, lat: trip.destLat, lon: trip.destLon },
        });
      },
      onDelete: async () => {
        try { await deleteRecentTrip(trip.id); await onChanged(); }
        catch (err) { showStatus('Could not delete this trip: ' + err.message, 'error'); }
      },
    }));
  });

  favorites.forEach((fav) => {
    listEl.appendChild(quickPickRow({
      iconSvg: starIcon(),
      label: splitPlaceLabel(fav.name).primary,
      extraBtn: streetViewButton(fav.lat, fav.lon), // null when Mapillary isn't configured
      onSelect: () => {
        listEl.classList.add('hidden');
        goToDirections({ to: { label: fav.name, lat: fav.lat, lon: fav.lon } });
      },
      onDelete: async () => {
        try { await deleteFavorite(fav.id); await onChanged(); }
        catch (err) { showStatus('Could not delete this favorite: ' + err.message, 'error'); }
      },
    }));
  });

  return true;
}

/** Focus handler shared by the search box and the from/to fields: shown only
 * when the field is genuinely empty, so it can never clobber an existing
 * pick or interrupt someone mid-search. */
async function showQuickPicksFor(inputEl, listEl, { includeLocationOption = false } = {}) {
  if (inputEl.value.trim()) return;
  const render = () => showQuickPicksFor(inputEl, listEl, { includeLocationOption });

  listEl.innerHTML = '';
  if (includeLocationOption) {
    const li = document.createElement('li');
    li.className = 'quick-option';
    li.innerHTML = `${locationPinIcon()}<span>Use my current location</span>`;
    li.addEventListener('click', useCurrentLocationAsFrom);
    listEl.appendChild(li);
  }
  await appendQuickPicks(listEl, render);

  if (listEl.children.length) listEl.classList.remove('hidden');
}

function useCurrentLocationAsFrom() {
  el.fromSuggestions.classList.add('hidden');
  el.fromSuggestions.innerHTML = '';
  if (!('geolocation' in navigator)) {
    showStatus('This browser does not support GPS location.', 'error');
    return;
  }
  showStatus('Finding your location…', 'info', { sticky: true });
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.from = { label: 'Your location', lat: pos.coords.latitude, lon: pos.coords.longitude };
      el.fromInput.value = 'Your location';
      updatePlanningMarkers();
      clearStatus();
    },
    () => showStatus('Could not get your location. Check location permissions.', 'error'),
    CONFIG.GEOLOCATION_OPTIONS,
  );
}

el.placeInput.addEventListener('focus', () => showQuickPicksFor(el.placeInput, el.placeSuggestions));
el.toInput.addEventListener('focus', () => showQuickPicksFor(el.toInput, el.toSuggestions));
el.fromInput.addEventListener('focus', () => showQuickPicksFor(el.fromInput, el.fromSuggestions, { includeLocationOption: true }));

// ---- Long-press on the map: drop a pin and save it as a favorite ----------
let longPressTimer = null;
let longPressStartPoint = null;
let favoritePromptMarker = null;

// On touchscreens, a plain tap fires touchstart/touchend AND the browser
// then synthesizes a compatibility mousedown/mouseup a moment later (for
// pages that only listen for mouse events). Without this guard, that
// synthetic mousedown restarts a second long-press timer right after the
// real one was correctly cancelled by touchend — which is what made a
// quick tap sometimes still drop a pin. Any real touch interaction
// suppresses the mouse-based path for the next second, since a synthetic
// mouse event is guaranteed to follow within that window.
let suppressMouseUntil = 0;

function cancelLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressStartPoint = null;
}

map.on('mousedown', (e) => startLongPress(e, false));
map.on('touchstart', (e) => startLongPress(e, true));
map.on('mousemove', (e) => moveLongPress(e));
map.on('touchmove', (e) => moveLongPress(e));
map.on('mouseup', cancelLongPress);
map.on('touchend', cancelLongPress);
map.on('dragstart', cancelLongPress);

function startLongPress(e, isTouch) {
  if (state.navigating) return; // don't let a bump while driving pop up a save prompt
  if (isTouch) {
    suppressMouseUntil = Date.now() + 1000;
  } else if (Date.now() < suppressMouseUntil) {
    return; // this "mousedown" is just the browser's synthetic echo of the touch above
  }
  longPressStartPoint = e.point;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    handleLongPress(e.lngLat);
  }, 600);
}
function moveLongPress(e) {
  if (!longPressTimer || !longPressStartPoint) return;
  const dx = e.point.x - longPressStartPoint.x;
  const dy = e.point.y - longPressStartPoint.y;
  if (Math.hypot(dx, dy) > 8) cancelLongPress(); // a real drag, not a held tap
}

async function handleLongPress(lngLat) {
  showStatus('Looking up this location…', 'info');
  let label = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  try {
    const res = await fetch(`${CONFIG.NOMINATIM_URL}/reverse?format=jsonv2&lat=${lngLat.lat}&lon=${lngLat.lng}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) label = data.display_name;
    }
  } catch (err) {
    // Offline or unreachable: fall back to the raw coordinates label already set above.
  }
  clearStatus();
  showFavoritePrompt(label, lngLat);
}

function showFavoritePrompt(label, lngLat) {
  if (favoritePromptMarker) favoritePromptMarker.remove();
  favoritePromptMarker = new maplibregl.Marker({ element: createPinElement('#3d8bfd', 'New favorite'), anchor: 'bottom' })
    .setLngLat(lngLat).addTo(map);
  el.favoritePromptInput.value = label;
  el.favoritePrompt.dataset.lat = lngLat.lat;
  el.favoritePrompt.dataset.lon = lngLat.lng;
  if (el.favoritePrompt.classList.contains('hidden')) pushBackLayer(hideFavoritePrompt);
  el.favoritePrompt.classList.remove('hidden');
  el.favoritePromptInput.focus();
}
function hideFavoritePrompt() {
  el.favoritePrompt.classList.add('hidden');
  if (favoritePromptMarker) { favoritePromptMarker.remove(); favoritePromptMarker = null; }
}
el.favoritePromptCancel.addEventListener('click', goBackInApp);
el.favoritePromptSave.addEventListener('click', async () => {
  const name = el.favoritePromptInput.value.trim() || 'Saved place';
  const lat = parseFloat(el.favoritePrompt.dataset.lat);
  const lon = parseFloat(el.favoritePrompt.dataset.lon);
  try {
    await addFavorite({ label: name, lat, lon });
    showStatus('Saved to favorites.', 'success');
  } catch (err) {
    showStatus('Could not save this favorite: ' + err.message, 'error');
  } finally {
    goBackInApp();
  }
});

// ---- Directions view: from/to fields ----
setupAutocomplete(el.fromInput, el.fromSuggestions, (picked) => {
  state.from = picked;
  updatePlanningMarkers();
});
setupAutocomplete(el.toInput, el.toSuggestions, (picked) => {
  state.to = picked;
  updatePlanningMarkers();
});

/** Reverses the visit order of stop rows — each `.stop-unit` wrapper already
 * glues a row to its divider (see addStopRow), so reversing the container's
 * direct children is enough on its own. */
function reverseStopRows() {
  [...el.stopsContainer.children].reverse().forEach((unit) => el.stopsContainer.appendChild(unit));
}

el.swapBtn.addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  el.fromInput.value = shortLabel(state.from);
  el.toInput.value = shortLabel(state.to);
  reverseStopRows(); // a reversed trip should visit its stops in reverse order too
  updatePlanningMarkers();
});

/** Removes every stop row (and its marker) — used whenever a fresh
 * directions request starts (a new search, favorite, or recent trip), so
 * stops from a previous trip don't linger onto an unrelated one. */
function clearStops() {
  el.stopsContainer.innerHTML = '';
  updatePlanningMarkers();
}

/** Adds one stop row to the directions card. `prefill` (used when restoring
 * a saved trip) fills it in immediately instead of leaving it empty and
 * focused. Each row wires its own debounced Nominatim autocomplete exactly
 * like the from/to fields, via the same setupAutocomplete() used everywhere
 * else — multi-stop search gets the same loader, quick-picks, etc. for free.
 * Row + divider live inside one `.stop-unit` wrapper (see startStopDrag)
 * so the two always move together, whether via remove, reverse, or drag. */
function addStopRow(prefill) {
  if (el.stopsContainer.querySelectorAll('.stop-row').length >= CONFIG.MAX_STOPS) {
    showStatus(`You can add up to ${CONFIG.MAX_STOPS} stops.`, 'error');
    return;
  }

  const unit = document.createElement('div');
  unit.className = 'stop-unit';

  const row = document.createElement('div');
  row.className = 'search-row stop-row';

  const dot = document.createElement('span');
  dot.className = 'dot dot-stop';
  dot.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Add a stop';
  input.autocomplete = 'off';
  input.inputMode = 'search';

  const suggestions = document.createElement('ul');
  suggestions.className = 'suggestions hidden';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-stop-btn';
  removeBtn.setAttribute('aria-label', 'Remove this stop');
  removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" '
    + 'stroke-width="2.4" stroke-linecap="round"><path d="M5 5 L19 19 M19 5 L5 19"/></svg>';

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'stop-drag-handle';
  dragHandle.setAttribute('aria-label', 'Drag to reorder this stop');
  dragHandle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">'
    + '<circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>'
    + '<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>'
    + '<circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

  row.appendChild(dot);
  row.appendChild(input);
  row.appendChild(suggestions);
  row.appendChild(removeBtn);
  row.appendChild(dragHandle);

  const divider = document.createElement('div');
  divider.className = 'search-divider';

  unit.appendChild(row);
  unit.appendChild(divider);

  removeBtn.addEventListener('click', () => {
    unit.remove();
    updatePlanningMarkers();
  });
  dragHandle.addEventListener('pointerdown', (e) => startStopDrag(unit, e));

  el.stopsContainer.appendChild(unit);

  setupAutocomplete(input, suggestions, (picked) => {
    input._stopPlace = picked || null;
    updatePlanningMarkers();
  });

  if (prefill) {
    input.value = shortLabel(prefill);
    input._stopPlace = prefill;
    updatePlanningMarkers(); // the setupAutocomplete onSelect path above handles this for a manually-typed stop; a prefilled one needs it explicitly
  } else {
    input.focus();
  }
}

el.addStopBtn.addEventListener('click', () => addStopRow());

/** Custom pointer-based drag reorder for stop units — plain HTML5
 * draggable/dragstart doesn't work reliably on touch (this is a mobile-first
 * PWA), so this follows the same Pointer Events approach already used for
 * the bottom-sheet drag-resize above. Only the drag-handle button starts a
 * drag, so tapping/typing in the stop's own input is never mistaken for one.
 * The dragged unit is pulled out of flow (`position: fixed`) and tracks the
 * pointer directly; the *other* units simply reflow around it as it's moved
 * past their midpoint in the live DOM, which is what gives the "make room"
 * sortable-list feel without a drag-and-drop library. */
function startStopDrag(unit, downEvent) {
  downEvent.preventDefault();
  const rect = unit.getBoundingClientRect();
  const startY = downEvent.clientY;
  const startTop = rect.top;

  unit.classList.add('stop-unit-dragging');
  unit.style.position = 'fixed';
  unit.style.top = `${startTop}px`;
  unit.style.left = `${rect.left}px`;
  unit.style.width = `${rect.width}px`;

  function onMove(e) {
    const dy = e.clientY - startY;
    const newTop = startTop + dy;
    unit.style.top = `${newTop}px`;
    const draggedCenter = newTop + rect.height / 2;

    const siblings = [...el.stopsContainer.children].filter((c) => c !== unit);
    let insertBeforeEl = null;
    for (const sib of siblings) {
      const sibRect = sib.getBoundingClientRect();
      if (draggedCenter < sibRect.top + sibRect.height / 2) { insertBeforeEl = sib; break; }
    }
    if (insertBeforeEl) {
      if (unit.nextSibling !== insertBeforeEl) el.stopsContainer.insertBefore(unit, insertBeforeEl);
    } else if (el.stopsContainer.lastElementChild !== unit) {
      el.stopsContainer.appendChild(unit);
    }
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    unit.classList.remove('stop-unit-dragging');
    unit.style.position = '';
    unit.style.top = '';
    unit.style.left = '';
    unit.style.width = '';
    updatePlanningMarkers(); // stop order may have changed — redraw pins/labels in the new sequence
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ============================================================================
// Routing (Valhalla)
// ============================================================================
const valhallaLimiter = createLimiter(CONFIG.VALHALLA_MIN_INTERVAL_MS);

/** `stops` (optional) are intermediate waypoints visited in order between
 * `from` and `to`. Valhalla returns one leg per consecutive pair of
 * locations, and buildRouteState() already concatenates however many legs
 * come back — so multi-stop trips fall out of the existing single-leg
 * plumbing for free, right down to Valhalla's own "you have arrived at
 * <stop>" maneuver text between legs. */
/** Catches the case where Valhalla's road graph has no drivable access near
 * one of the picked points (a common issue for pedestrianized landmarks and
 * monument plazas — e.g. Gateway of India in Mumbai has no `auto`-accessible
 * edge except the tourist ferry piers, so *any* query resolving to that
 * exact node routes via a ferry no matter the phrasing or costing options —
 * confirmed by direct testing against the routing service). Rather than
 * silently presenting an absurd multi-km ferry detour between two points a
 * short walk apart, flag it plainly so the user knows to try a nearby
 * street address instead. This is advisory, not a hard failure — the route
 * is still shown, since a ferry is occasionally the genuinely correct
 * answer for real coastal trips. */
function checkRoutePlausibility(trip, from, to, hasStops = false) {
  const straightLineM = turf.distance([from.lon, from.lat], [to.lon, to.lat], { units: 'meters' });
  const routeM = (trip.summary && trip.summary.length ? trip.summary.length * 1000 : 0);
  const hasFerry = !!(trip.summary && trip.summary.has_ferry);
  // These are two distinct situations, worth two distinct messages: a ferry
  // can be entirely legitimate on a long real road trip (e.g. a multi-stop
  // Kerala→Mumbai drive that happens to end at a landmark with ferry-only
  // road access), so "unusually long detour for how close these points are"
  // would be actively misleading there — that phrasing only fits the second
  // case, where the two points genuinely are close together.
  //
  // The detour heuristic only makes sense for a direct from→to trip: once
  // stops are involved the route is SUPPOSED to detour away from the
  // straight line between from/to — most obviously for a round trip, where
  // straight-line distance is ~0 and any stop-having route would otherwise
  // always look like an "infinite" detour.
  const isImplausibleDetour = !hasStops && straightLineM < 5000 && routeM > straightLineM * 4;
  if (isImplausibleDetour) {
    return 'This route is an unusually long detour for how close these points are — the destination may have '
      + 'limited direct road access in the map data. Try a nearby street address instead.';
  }
  if (hasFerry) {
    return 'This route includes a ferry crossing — possibly because the destination has no direct road access '
      + 'in the map data (common for pedestrianized landmarks). Check that a ferry is actually what you want.';
  }
  return null;
}

// Session-only cache keyed by the rounded waypoint list (Milestone-5 polish
// pass): re-planning the exact same trip — tapping "Get directions" twice,
// going back into directions and re-submitting unchanged — returns instantly
// with no network call. Rounding to ~1m precision means it still hits on
// float-noise-identical coordinates without accidentally caching two
// genuinely different nearby points as "the same" request. Live-position
// reroutes are never cache hits (the coordinates are different every time by
// design), so this only ever saves the redundant-resubmit case, not real trips.
const valhallaCache = new Map();
function routeCacheKey(from, to, stops, wantAlternates) {
  return JSON.stringify([wantAlternates, ...[from, ...stops, to].map((p) => [p.lat.toFixed(5), p.lon.toFixed(5)])]);
}

/** Valhalla will happily return an "alternate" that's barely different from
 * the primary, or one that's technically a different road but dramatically
 * worse — neither is a meaningful choice to show. Confirmed by direct
 * testing: a real alternate can be +88% distance/+66% time for no benefit,
 * which nobody would rationally pick. Keep an alternate only if it's
 * meaningfully different in distance/time (not a near-duplicate, roughly
 * 5-50% apart) OR it differs on tolls/highway/ferry even at similar time —
 * a toll-free option worth surfacing even if it's not faster. */
function filterMeaningfulAlternates(primaryTrip, alternateTrips) {
  const pDist = primaryTrip.summary.length;
  const pTime = primaryTrip.summary.time;
  return alternateTrips.filter((t) => {
    const dDist = Math.abs(t.summary.length - pDist) / pDist;
    const dTime = Math.abs(t.summary.time - pTime) / pTime;
    if (dDist < 0.05 && dTime < 0.05) return false; // near-duplicate of the primary
    const distinctFlags = t.summary.has_toll !== primaryTrip.summary.has_toll
      || t.summary.has_highway !== primaryTrip.summary.has_highway
      || t.summary.has_ferry !== primaryTrip.summary.has_ferry;
    const dominated = t.summary.length > pDist * 1.5 && t.summary.time > pTime * 1.5;
    return !dominated || distinctFlags;
  });
}

/** `wantAlternates` (0 by default) asks Valhalla for up to that many extra
 * route choices — only used for the initial "Get directions" plan; reroutes
 * and adding a stop mid-trip both request 0, keeping those fast and simple
 * since you're already committed to a trip at that point. Always returns
 * `{ trip, alternates }` (alternates is `[]` when none were requested or
 * none passed the meaningful-difference filter above), so every caller has
 * one consistent shape regardless of whether it asked for alternates. */
async function requestRoute(from, to, stops = [], wantAlternates = 0) {
  const cacheKey = routeCacheKey(from, to, stops, wantAlternates);
  if (valhallaCache.has(cacheKey)) return valhallaCache.get(cacheKey);

  await valhallaLimiter();
  const body = {
    locations: [from, ...stops, to].map((p) => ({ lat: p.lat, lon: p.lon })),
    costing: 'auto',
    units: 'kilometers',
    // Ferries are essentially never wanted for ordinary driving in India.
    // This is a soft penalty, not a hard exclusion, so it won't fix every
    // bad case (a destination with literally no drivable road access in the
    // map data can still resolve to a — possibly longer — ferry route; see
    // checkRoutePlausibility below for catching that instead).
    costing_options: { auto: { use_ferry: 0 } },
  };
  if (wantAlternates > 0) body.alternates = wantAlternates;
  let res;
  try {
    res = await fetch(`${CONFIG.VALHALLA_URL}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error('Could not reach the routing service. Check your connection or the Valhalla server address.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch (_) { /* ignore parse failure */ }
    throw new Error(detail || `The routing service returned an error (HTTP ${res.status}).`);
  }
  const data = await res.json();
  if (!data.trip || !data.trip.legs || !data.trip.legs.length) {
    throw new Error('No route could be found between those two points.');
  }
  const rawAlternates = (data.alternates || []).map((a) => a.trip);
  const alternates = wantAlternates > 0 ? filterMeaningfulAlternates(data.trip, rawAlternates) : [];
  const result = { trip: data.trip, alternates };
  valhallaCache.set(cacheKey, result);
  return result;
}

/** One label per option in state.routeOptions: "Fastest"/"Shortest" (won't
 * both appear on the same card unless they're the same option), or a
 * toll callout when the options actually differ on that — no point saying
 * "No tolls" on every card when none of them have tolls anyway. */
function buildRouteOptionTags(trips) {
  const minTime = Math.min(...trips.map((t) => t.summary.time));
  const minDist = Math.min(...trips.map((t) => t.summary.length));
  const anyToll = trips.some((t) => t.summary.has_toll);
  const notAllSameToll = anyToll && trips.some((t) => !t.summary.has_toll);

  return trips.map((t) => {
    if (t.summary.time === minTime) return 'Fastest';
    if (t.summary.length === minDist) return 'Shortest';
    if (notAllSameToll) return t.summary.has_toll ? 'Has tolls' : 'No tolls';
    return '';
  });
}

/** Redraws the gray alternate-route lines on the map — everything in
 * routeOptions except whichever is currently selected (that one is drawn by
 * the normal primary 'route' source/layer instead, on top of these). */
async function updateAlternateRouteLines() {
  const features = state.routeOptions
    .map((trip, i) => ({ trip, i }))
    .filter(({ i }) => i !== state.selectedRouteIndex)
    .map(({ trip, i }) => ({
      type: 'Feature',
      properties: { optionIndex: i },
      geometry: { type: 'LineString', coordinates: decodeTripCoords(trip) },
    }));
  await mapLoad;
  map.getSource('route-alternates').setData({ type: 'FeatureCollection', features });
}

/** Populates the route-option cards and the map's gray alternate lines.
 * Hides both entirely when there's nothing to choose between (0 or 1
 * option) — most trips never show this UI at all, only ones where Valhalla
 * actually found a meaningfully different second route. Awaits the map's
 * own load before touching its sources — this can run as the very first
 * thing on a fresh page load (clearing stale options before a new plan
 * request), before the map has necessarily finished loading. */
async function renderRouteOptions() {
  el.routeOptionsRow.innerHTML = '';
  if (state.routeOptions.length < 2) {
    el.routeOptionsRow.classList.add('hidden');
    await mapLoad;
    map.getSource('route-alternates').setData(emptyFeatureCollection());
    return;
  }
  const tags = buildRouteOptionTags(state.routeOptions);
  state.routeOptions.forEach((trip, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'route-option-card' + (i === state.selectedRouteIndex ? ' active' : '');
    card.innerHTML = `<div class="route-option-time">${formatDuration(trip.summary.time)}</div>
      <div class="route-option-dist">${formatDistance(trip.summary.length * 1000)}</div>
      ${tags[i] ? `<div class="route-option-tag">${escapeHtml(tags[i])}</div>` : ''}`;
    card.addEventListener('click', () => selectRouteOption(i));
    el.routeOptionsRow.appendChild(card);
  });
  el.routeOptionsRow.classList.remove('hidden');
  updateAlternateRouteLines();
}

/** Switches the active route to routeOptions[index] — no network call,
 * everything needed is already sitting in memory from the initial request. */
async function selectRouteOption(index) {
  if (index === state.selectedRouteIndex || !state.routeOptions[index]) return;
  state.selectedRouteIndex = index;
  const trip = state.routeOptions[index];
  const stops = getStops();
  await renderRoute(trip, { stops });
  await renderRouteOptions(); // refreshes card highlighting + which line is gray vs primary
  const warning = checkRoutePlausibility(trip, state.from, state.to, stops.length > 0);
  if (warning) showStatus(warning, 'error'); else clearStatus();
}

/** Draws/replaces the route line and itinerary. `fitView` is false during a
 * mid-navigation reroute, since the camera is already following the puck and
 * a sudden fitBounds jump would be jarring. */
async function renderRoute(trip, { fitView = true, stops = [] } = {}) {
  const built = buildRouteState(trip, stops);
  built.lineFeature = turf.lineString(built.coords);
  state.route = built;
  state.spoken = new Set();
  state.arrivedAnnounced = false;

  await mapLoad;
  map.getSource('route').setData(built.lineFeature);

  if (fitView) {
    const bounds = built.coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(built.coords[0], built.coords[0]),
    );
    map.fitBounds(bounds, { padding: 60, duration: 500 });
  }

  renderManeuverList(built.maneuvers);
  if (!state.navigating) renderRouteSummary(built.totalDistM, built.totalTimeS);
  el.bottomSheet.classList.remove('hidden');
  el.mapControls.classList.add('raised');

  // Milestone 3B: persist the route so a killed/reloaded tab mid-drive can
  // restore it without a network round trip. Non-fatal if it fails — the
  // trip keeps working from in-memory state either way, this only affects
  // whether it survives a reload.
  try {
    await saveCurrentTrip({ route: built, from: state.from, to: state.to, stops: getStops() });
  } catch (err) {
    showStatus('Could not save trip progress locally: ' + err.message, 'error');
  }
}

function renderManeuverList(maneuvers) {
  el.maneuverList.innerHTML = '';
  maneuvers.forEach((m) => {
    const li = document.createElement('li');
    const cumulativeM = m.startDistM + m.lengthM;
    li.innerHTML = `<div class="m-icon">${maneuverIcon(m.type)}</div>
      <div class="m-body">
        <div class="instr">${escapeHtml(m.instruction)}</div>
        <div class="meta">${formatDistance(m.lengthM)} &middot; cumulative ${formatDistance(cumulativeM)}</div>
      </div>`;
    el.maneuverList.appendChild(li);
  });
}

/** Static "before navigation" summary line in the bottom sheet. Once
 * navigating, updateActiveManeuver() overwrites this with live ETA info
 * instead, so this is only ever seen in the planning view. */
function renderRouteSummary(totalDistM, totalTimeS) {
  el.sheetSummary.textContent = `${formatDistance(totalDistM)} · about ${formatDuration(totalTimeS)}`;
}

/** Highlights the upcoming maneuver in the list and keeps it scrolled into view. */
function highlightManeuver(idx) {
  [...el.maneuverList.children].forEach((li, i) => {
    li.classList.toggle('active', i === idx);
    li.classList.toggle('done', i < idx);
  });
  const activeLi = el.maneuverList.children[idx];
  if (activeLi) activeLi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ============================================================================
// Milestone 4C — Transit mode via OpenTripPlanner 2
//
// Entirely config-gated on OTP2_URL, same philosophy as Mapillary: with
// nothing configured, the mode toggle never appears and none of this runs.
// Scope note: this covers planning + distinct rendering + transit-specific
// maneuver text only, not live GPS-guided transit navigation — boarding/
// alighting detection for buses and trains is a materially different
// problem from Milestone 2's road-snapping and was out of scope here, so
// "Start navigation" simply isn't offered for a transit itinerary.
// ============================================================================
const TRANSIT_ENABLED = !!CONFIG.OTP2_URL;

if (TRANSIT_ENABLED) {
  el.travelModeToggle.classList.remove('hidden');
  el.travelModeToggle.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.travelMode = btn.dataset.mode;
      el.travelModeToggle.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
}

function transitLegIcon(mode) {
  const paths = {
    WALK: '<circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/>'
      + '<path d="M11 8 L9 15 M13 8 L15 21 M9 15 L6 19 M9 15 L12 17 L13 8"/>',
    BUS: '<rect x="4" y="5" width="16" height="12" rx="2.5"/><path d="M4 11 h16"/>'
      + '<circle cx="8" cy="19" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
    FERRY: '<path d="M4 15 h16 l-2 5 H6 Z"/><path d="M7 15 V7 h10 v8"/><path d="M12 7 V3"/>',
  };
  const railLike = '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11 h12"/>'
    + '<circle cx="9" cy="19" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.3" fill="currentColor" stroke="none"/>';
  const path = paths[mode] || railLike; // RAIL/SUBWAY/TRAM/FUNICULAR/GONDOLA all read as "a train"
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

/** OTP2's classic REST trip planner endpoint — stable across OTP1/OTP2,
 * simpler to call than constructing a GraphQL query for this app's needs. */
async function requestTransitRoute(from, to) {
  const url = `${CONFIG.OTP2_URL}/otp/routers/default/plan?fromPlace=${from.lat},${from.lon}`
    + `&toPlace=${to.lat},${to.lon}&mode=TRANSIT,WALK&numItineraries=1`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error('Could not reach the transit routing service. Check your connection or the OTP2 server address.');
  }
  if (!res.ok) throw new Error(`The transit routing service returned an error (HTTP ${res.status}).`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.msg || 'No transit route could be found between those two points.');
  const itineraries = data.plan && data.plan.itineraries;
  if (!itineraries || !itineraries.length) throw new Error('No transit route could be found between those two points.');
  return itineraries[0];
}

function renderTransitManeuverList(legs) {
  el.maneuverList.innerHTML = '';
  legs.forEach((leg, i) => {
    const li = document.createElement('li');
    let instruction;
    if (leg.mode === 'WALK') {
      const destName = i === legs.length - 1 ? 'your destination' : (leg.to && leg.to.name) || 'the next stop';
      instruction = `Walk to ${destName}`;
    } else {
      const routeName = leg.route || leg.routeShortName || leg.mode;
      const headsign = leg.headsign ? ` towards ${leg.headsign}` : '';
      const stopCount = leg.intermediateStops ? leg.intermediateStops.length + 1 : null;
      const stops = stopCount ? `, ride ${stopCount} stop${stopCount === 1 ? '' : 's'}` : '';
      instruction = `Board ${routeName}${headsign}${stops}, alight at ${(leg.to && leg.to.name) || 'the stop'}`;
    }
    li.innerHTML = `<div class="m-icon">${transitLegIcon(leg.mode)}</div>
      <div class="m-body">
        <div class="instr">${escapeHtml(instruction)}</div>
        <div class="meta">${formatDistance(leg.distance || 0)} &middot; ${formatDuration(leg.duration || 0)}</div>
      </div>`;
    el.maneuverList.appendChild(li);
  });
}

/** Draws a transit itinerary as one line per leg, colour/style-coded by
 * mode (see the transit-route-walk/transit-route-transit layers added at
 * map setup). No live-navigation counterpart — see the scope note above. */
async function renderTransitRoute(itinerary) {
  state.transitItinerary = itinerary;
  const features = itinerary.legs.map((leg) => ({
    type: 'Feature',
    properties: { mode: leg.mode },
    // OTP encodes leg geometry at Google's standard polyline precision (5),
    // unlike Valhalla's precision-6 shapes — same decoder, different precision.
    geometry: { type: 'LineString', coordinates: decodePolyline(leg.legGeometry.points, 5) },
  }));

  await mapLoad;
  map.getSource('route').setData(emptyFeatureCollection()); // clear any driving route
  map.getSource('transit-route').setData({ type: 'FeatureCollection', features });

  const allCoords = features.flatMap((f) => f.geometry.coordinates);
  const bounds = allCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(allCoords[0], allCoords[0]));
  map.fitBounds(bounds, { padding: 60, duration: 500 });

  renderTransitManeuverList(itinerary.legs);
  const totalDistM = itinerary.legs.reduce((sum, l) => sum + (l.distance || 0), 0);
  el.sheetSummary.textContent = `${formatDistance(totalDistM)} · about ${formatDuration(itinerary.duration)}`;
  el.bottomSheet.classList.remove('hidden');
  el.mapControls.classList.add('raised');
}

el.planBtn.addEventListener('click', async () => {
  if (!state.from || !state.to) {
    showStatus('Please pick both a starting point and a destination from the suggestion list.', 'error');
    return;
  }
  el.planBtn.disabled = true;
  showStatus(state.travelMode === 'transit' ? 'Finding transit route…' : 'Finding route…', 'info', { sticky: true });
  try {
    forgetBackLayerIfTop(resetToRouteView); // closing poi-results (if open) by side effect of re-submitting the form
    resetToRouteView();
    state.routeOptions = [];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    if (state.travelMode === 'transit') {
      const itinerary = await requestTransitRoute(state.from, state.to);
      await renderTransitRoute(itinerary);
      el.bottomSheet.classList.remove('expanded');
      el.startNavBtn.classList.add('hidden'); // no live transit navigation — see scope note above
      el.cancelRouteBtn.classList.remove('hidden');
      hideRouteSearchFeature(); // along-route search is drive-only (see scope note above addStopFromPoi)
      clearStatus();
    } else {
      state.currentLegIndex = 0;
      const stops = getStops();
      const { trip, alternates } = await requestRoute(state.from, state.to, stops, 2);
      state.routeOptions = [trip, ...alternates];
      state.selectedRouteIndex = 0;
      await renderRouteOptions();
      await renderRoute(trip, { stops });
      el.bottomSheet.classList.remove('expanded');
      el.startNavBtn.classList.remove('hidden');
      el.cancelRouteBtn.classList.remove('hidden');
      showRouteSearchFeature();
      const warning = checkRoutePlausibility(trip, state.from, state.to, stops.length > 0);
      if (warning) showStatus(warning, 'error'); else clearStatus();
    }
    // Replaces whatever was on top (the bare directions form, or an earlier
    // planned route being re-submitted) — one back press from a planned
    // route now discards the whole route, matching the Cancel button below.
    replaceTopBackLayer(cancelPlannedRoute);
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    el.planBtn.disabled = false;
  }
});

// ---- Bottom sheet: drag the handle to resize, or just tap it to toggle ----
// Pointer Events (not separate mouse/touch listeners) since this is a plain
// DOM button outside the map canvas — no risk of the touch/synthetic-mouse
// double-fire that the map's own long-press handling has to guard against.
const SHEET_PEEK_PX = 136; // keep in sync with #bottom-sheet's base max-height in style.css
function sheetExpandedPx() { return window.innerHeight * 0.72; } // keep in sync with .expanded's 72vh

let sheetDragStartY = null;
let sheetDragStartHeight = null;
let sheetDragging = false;
let sheetDragDistance = 0;

el.sheetHandle.addEventListener('pointerdown', (e) => {
  sheetDragging = true;
  sheetDragDistance = 0;
  sheetDragStartY = e.clientY;
  sheetDragStartHeight = el.bottomSheet.getBoundingClientRect().height;
  el.bottomSheet.classList.add('dragging');
  el.sheetHandle.setPointerCapture(e.pointerId);
});

el.sheetHandle.addEventListener('pointermove', (e) => {
  if (!sheetDragging) return;
  const dy = sheetDragStartY - e.clientY; // positive while dragging upward
  sheetDragDistance = Math.max(sheetDragDistance, Math.abs(dy));
  const height = Math.min(sheetExpandedPx(), Math.max(SHEET_PEEK_PX, sheetDragStartHeight + dy));
  el.bottomSheet.style.maxHeight = `${height}px`;
});

function endSheetDrag(e) {
  if (!sheetDragging) return;
  sheetDragging = false;
  el.bottomSheet.classList.remove('dragging');
  el.bottomSheet.style.maxHeight = ''; // hand control back to the CSS class
  if (sheetDragDistance < 10) {
    // Barely moved — treat it as a plain tap on the handle.
    el.bottomSheet.classList.toggle('expanded');
    return;
  }
  const dy = sheetDragStartY - e.clientY;
  const finalHeight = Math.min(sheetExpandedPx(), Math.max(SHEET_PEEK_PX, sheetDragStartHeight + dy));
  const midpoint = (SHEET_PEEK_PX + sheetExpandedPx()) / 2;
  el.bottomSheet.classList.toggle('expanded', finalHeight > midpoint);
}
el.sheetHandle.addEventListener('pointerup', endSheetDrag);
el.sheetHandle.addEventListener('pointercancel', endSheetDrag);

/** Discards the currently planned route entirely and returns to a blank
 * search — the equivalent of Google Maps' "✕" on the directions panel. */
function cancelPlannedRoute() {
  clearBackLayers(); // discards the whole route (and anything nested on top, e.g. poi-results) back to true home
  state.route = null;
  state.transitItinerary = null;
  state.routeOptions = [];
  state.selectedRouteIndex = 0;
  state.from = null;
  state.to = null;
  map.getSource('route').setData(emptyFeatureCollection());
  map.getSource('transit-route').setData(emptyFeatureCollection());
  map.getSource('route-alternates').setData(emptyFeatureCollection());
  el.routeOptionsRow.classList.add('hidden');

  resetToRouteView();
  el.bottomSheet.classList.add('hidden');
  el.bottomSheet.classList.remove('expanded');
  el.maneuverList.innerHTML = '';
  el.startNavBtn.classList.add('hidden');
  el.cancelRouteBtn.classList.add('hidden');
  hideRouteSearchFeature();
  el.mapControls.classList.remove('raised');

  el.fromInput.value = '';
  el.toInput.value = '';
  el.placeInput.value = '';
  hidePlaceCard();
  clearStops(); // also redraws (now-empty) planning markers
  setPlanningUiMode('simple');

  clearCurrentTrip().catch(() => { /* non-fatal: a stale resume record just won't restore next launch */ });
}
el.cancelRouteBtn.addEventListener('click', cancelPlannedRoute); // explicit "discard everything", not a single back-step — see clearBackLayers

// ============================================================================
// Milestone 2 — live tracking, voice guidance, deviation/reroute
// ============================================================================

function speak(text) {
  if (!('speechSynthesis' in window)) return; // silently unsupported, never crashes navigation
  window.speechSynthesis.cancel(); // never let prompts queue up / overlap
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function updatePuck(lngLat, headingDeg) {
  if (!state.puckMarker) {
    state.puckMarker = new maplibregl.Marker({
      element: createPuckElement(),
      rotationAlignment: 'map',
      pitchAlignment: 'map',
    }).setLngLat(lngLat).addTo(map);
  } else {
    state.puckMarker.setLngLat(lngLat);
  }
  state.puckMarker.setRotation(headingDeg);
}

function followCamera(lngLat, headingDeg) {
  map.easeTo({
    center: lngLat,
    bearing: headingDeg,
    pitch: CONFIG.NAV_PITCH,
    zoom: CONFIG.NAV_ZOOM,
    duration: CONFIG.FOLLOW_EASE_MS,
  });
}

/** Figures out which maneuver is "next" from how far the driver has
 * travelled along the route, updates the banner/list, and fires the voice
 * prompt once we're within VOICE_PROMPT_DISTANCE_M of it. */
function updateActiveManeuver(traveledM) {
  const maneuvers = state.route.maneuvers;
  let currentIdx = 0;
  for (let i = 0; i < maneuvers.length; i++) {
    if (maneuvers[i].startDistM <= traveledM) currentIdx = i;
    else break;
  }
  // Which origin→stop/stop→stop/stop→destination leg we're currently on. A
  // reroute only needs to route through the stops still ahead — see
  // triggerReroute() — so this has to track live as the trip progresses.
  state.currentLegIndex = maneuvers[currentIdx].legIndex;
  const nextIdx = currentIdx + 1 < maneuvers.length ? currentIdx + 1 : null;

  if (nextIdx !== null) {
    const distToNextM = Math.max(0, maneuvers[nextIdx].startDistM - traveledM);
    highlightManeuver(nextIdx);
    el.navBannerIcon.innerHTML = maneuverIcon(maneuvers[nextIdx].type);
    el.navBannerInstruction.textContent = maneuvers[nextIdx].instruction;
    el.navBannerDistance.textContent = 'in ' + formatDistance(distToNextM);

    if (distToNextM <= CONFIG.VOICE_PROMPT_DISTANCE_M && !state.spoken.has(nextIdx)) {
      speak(maneuvers[nextIdx].instruction);
      state.spoken.add(nextIdx);
    }
  } else {
    // Past the start of the final maneuver: we've arrived.
    highlightManeuver(currentIdx);
    el.navBannerIcon.innerHTML = maneuverIcon(4); // flag
    el.navBannerInstruction.textContent = maneuvers[currentIdx].instruction || 'You have arrived';
    el.navBannerDistance.textContent = 'Arriving';
    if (!state.arrivedAnnounced) {
      state.arrivedAnnounced = true;
      speak('You have arrived at your destination.');
      showStatus('You have arrived at your destination.', 'success');
    }
  }

  // Live ETA line in the collapsed bottom sheet, replacing the static
  // total-trip summary shown before navigation started.
  const remainingM = Math.max(0, state.route.totalDistM - traveledM);
  const remainingTimeS = state.route.totalDistM > 0
    ? state.route.totalTimeS * (remainingM / state.route.totalDistM)
    : 0;
  el.sheetSummary.textContent = `${formatDistance(remainingM)} remaining · about ${formatDuration(remainingTimeS)}`;
}

/** Tracks how long the driver has been continuously off-route and triggers a
 * reroute once that exceeds DEVIATION_DURATION_MS. The timer resets the
 * instant they're back within the threshold, so brief GPS noise near the
 * route line never fires a spurious reroute. */
function checkDeviation(offsetM, currentLngLat) {
  if (state.isRerouting) return;
  if (offsetM > CONFIG.DEVIATION_THRESHOLD_M) {
    if (state.offRouteSince == null) state.offRouteSince = Date.now();
    if (Date.now() - state.offRouteSince > CONFIG.DEVIATION_DURATION_MS) {
      triggerReroute(currentLngLat);
    }
  } else {
    state.offRouteSince = null;
  }
}

/** Milestone 3B: reroute requests are the one part of live navigation that
 * needs the network (everything else — position snapping, maneuver-advance,
 * voice guidance — runs off GPS + the already-fetched route with Turf.js,
 * entirely client-side, and keeps working with no signal at all). If we're
 * offline or the request fails, we don't error out or strand the driver:
 * keep guiding off the last known-good route, remember where we wanted to
 * reroute from, and automatically retry the instant connectivity returns
 * (see the `online` listener below) — no need to wait for the next
 * off-route dwell cycle. */
async function triggerReroute(currentLngLat) {
  if (state.isRerouting) return;
  state.isRerouting = true;

  if (!navigator.onLine) {
    showStatus('Off route, no signal — continuing on the current route until reconnected.', 'error', { sticky: true });
    state.pendingRerouteFrom = currentLngLat;
    state.offRouteSince = null;
    state.isRerouting = false;
    return;
  }

  showStatus('Off route — recalculating…', 'info', { sticky: true });
  try {
    const from = { lat: currentLngLat[1], lon: currentLngLat[0] };
    // Only route through stops still ahead — currentLegIndex tracks how many
    // have already been visited, so a stop you've already been to is never
    // routed back through on a reroute.
    const remainingStops = getStops().slice(state.currentLegIndex);
    const { trip } = await requestRoute(from, state.to, remainingStops); // no alternates — mid-reroute isn't the moment for route choice
    state.routeOptions = [trip];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    await renderRoute(trip, { fitView: false, stops: remainingStops }); // camera keeps following the puck
    state.pendingRerouteFrom = null;
    const warning = checkRoutePlausibility(trip, from, state.to, remainingStops.length > 0);
    if (warning) showStatus(warning, 'error'); else clearStatus();
  } catch (err) {
    showStatus('Off route, no signal — continuing on the current route until reconnected.', 'error', { sticky: true });
    state.pendingRerouteFrom = currentLngLat;
  } finally {
    state.offRouteSince = null;
    state.isRerouting = false;
  }
}

// The instant the browser reports connectivity again, retry a reroute that
// was deferred while offline, rather than waiting for the next off-route
// dwell cycle to notice.
window.addEventListener('online', () => {
  if (state.navigating && state.pendingRerouteFrom && !state.isRerouting) {
    showStatus('Back online — recalculating your route…', 'info', { sticky: true });
    triggerReroute(state.pendingRerouteFrom);
  }
});

function onPositionUpdate(pos) {
  const { latitude: lat, longitude: lng, heading } = pos.coords;
  const lngLat = [lng, lat];

  // --- Heading: prefer the device's own compass/course-over-ground; fall
  // back to a bearing computed from the last two fixes when unavailable
  // (common on some Android devices/browsers while stationary or slow). ---
  let headingDeg = state.lastHeading;
  if (typeof heading === 'number' && !Number.isNaN(heading)) {
    headingDeg = heading;
  } else if (state.lastFix) {
    const movedM = turf.distance([state.lastFix.lng, state.lastFix.lat], lngLat, { units: 'meters' });
    if (movedM > 2) { // ignore GPS jitter when barely moving
      headingDeg = (turf.bearing([state.lastFix.lng, state.lastFix.lat], lngLat) + 360) % 360;
    }
  }
  state.lastHeading = headingDeg;
  state.lastFix = { lng, lat, t: pos.timestamp || Date.now() };

  updatePuck(lngLat, headingDeg);
  if (state.followMode) followCamera(lngLat, headingDeg);
  if (!state.route) return;

  // --- Snap the live fix onto the route line. `location` is the distance
  // travelled along the line to the snapped point; `dist` is the
  // perpendicular offset — both in metres. This is the basis for both the
  // maneuver-advance logic and deviation detection below. ---
  const snapped = turf.nearestPointOnLine(state.route.lineFeature, turf.point(lngLat), { units: 'meters' });
  const traveledM = snapped.properties.location;
  const offsetM = snapped.properties.dist;
  state.traveledM = traveledM;

  updateActiveManeuver(traveledM);
  checkDeviation(offsetM, lngLat);
}

function onPositionError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    showStatus('Location access was denied. Allow location permission for this site to use turn-by-turn navigation.', 'error');
    endNavigation();
  } else if (err.code === err.TIMEOUT) {
    showStatus('Still waiting for a GPS fix…', 'info');
  } else {
    showStatus('Lost GPS signal. Still trying to reconnect…', 'info');
  }
}

/** The back-layer closeFn while actively driving. Returns `true` (a veto)
 * so a stray back press can never silently drop the user out of turn-by-turn
 * guidance — Google Maps has the same guard, since a system back gesture
 * mid-drive is far more often an accidental swipe than deliberate intent to
 * quit. Ending navigation for real is only ever done via the explicit "End"
 * button (see endNavigation), which never goes through this. */
function navigatingBackGuard() {
  showStatus('Tap "End" to stop navigating.', 'info');
  return true;
}

async function startNavigation() {
  if (!state.route) return;
  if (!('geolocation' in navigator)) {
    showStatus('This browser does not support GPS location, so live navigation is not available.', 'error');
    return;
  }

  state.navigating = true;
  state.followMode = true;
  state.offRouteSince = null;
  state.isRerouting = false;
  state.pendingRerouteFrom = null;
  state.spoken = new Set();
  state.arrivedAnnounced = false;
  state.lastFix = null;

  // Milestone 3C: auto-record this as a recent trip. Non-fatal if it fails —
  // navigation itself doesn't depend on this succeeding.
  addRecentTrip({
    originLabel: state.from.label, originLat: state.from.lat, originLon: state.from.lon,
    destLabel: state.to.label, destLat: state.to.lat, destLon: state.to.lon,
  }).catch((err) => {
    showStatus('Could not save this trip to Recent: ' + err.message, 'error');
  });

  forgetBackLayerIfTop(resetToRouteView); // closing poi-results (if open) by side effect of starting to drive
  resetToRouteView(); // don't start driving mid-way through browsing "restaurants along the route"
  // Once driving, back should warn rather than silently discard the route —
  // Google Maps never lets a stray back press during turn-by-turn exit
  // navigation; only the explicit "End" button does that (see endNavigation).
  replaceTopBackLayer(navigatingBackGuard);
  el.searchCard.classList.add('hidden');
  el.placeCard.classList.add('hidden');
  el.navBanner.classList.remove('hidden');
  el.bottomSheet.classList.remove('expanded');
  el.startNavBtn.classList.add('hidden');
  el.cancelRouteBtn.classList.add('hidden');
  // Along-route search stays available while driving (see routeCoordsAhead) —
  // scoped to what's still ahead of you rather than the whole original route.
  el.routeOptionsRow.classList.add('hidden'); // no more switching routes once you're committed and driving
  map.getSource('route-alternates').setData(emptyFeatureCollection());
  el.endNavBtn.classList.remove('hidden');
  updateLocateBtnState();

  // The live puck takes over as the "where am I" marker.
  if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
  if (state.myLocationMarker) { state.myLocationMarker.remove(); state.myLocationMarker = null; }

  showStatus('Getting your location…', 'info');
  try {
    // On a plain web deployment this is navigator.geolocation.watchPosition
    // under the hood, unchanged from Milestones 1-3. Inside the optional
    // Capacitor Android shell (Milestone 4B), it instead starts a real
    // Android foreground service via a background-geolocation plugin, whose
    // native callback feeds the exact same onPositionUpdate() below — see
    // native-location.js for why that matters with the screen off.
    state.watchId = await startLocationWatch(onPositionUpdate, onPositionError, CONFIG.GEOLOCATION_OPTIONS, {
      title: 'Navigating to ' + state.to.label,
      message: 'Tracking your location for turn-by-turn guidance.',
    });
  } catch (err) {
    showStatus('Could not start location tracking: ' + err.message, 'error');
    endNavigation();
  }
}

function endNavigation() {
  // Direct call, not goBackInApp — this is the one explicit action allowed
  // to actually leave navigation; it restores the "route planned, not yet
  // driving" back-layer in its place rather than consuming a real back-press.
  replaceTopBackLayer(cancelPlannedRoute);
  if (state.watchId != null) stopLocationWatch(state.watchId).catch(() => { /* best-effort cleanup */ });
  state.watchId = null;
  state.navigating = false;

  if (state.puckMarker) { state.puckMarker.remove(); state.puckMarker = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  el.navBanner.classList.add('hidden');
  el.endNavBtn.classList.add('hidden');
  el.startNavBtn.classList.remove('hidden');
  el.cancelRouteBtn.classList.remove('hidden');
  showRouteSearchFeature(); // endNavigation is only reachable from a drive-mode session
  el.searchCard.classList.remove('hidden');
  renderRouteOptions(); // typically just re-hides the row: rerouting while driving collapses options down to one
  updateLocateBtnState();

  if (state.route) renderRouteSummary(state.route.totalDistM, state.route.totalTimeS);
  updatePlanningMarkers(); // restore the original origin pin for the planning view
  clearStatus();

  clearCurrentTrip().catch(() => { /* non-fatal: a stale resume record just won't restore next launch */ });
}

el.startNavBtn.addEventListener('click', startNavigation);
el.endNavBtn.addEventListener('click', endNavigation);

// ============================================================================
// PWA installability
// ============================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* non-fatal: app still works */ });
  });
}

// ============================================================================
// Startup: offer to resume an in-progress trip (Milestone 3B) if the tab was
// reloaded or restarted mid-drive. Favorites/recents need no startup work of
// their own — they're loaded on demand when a search field is focused.
// ============================================================================
(async () => {
  try {
    const saved = await loadCurrentTrip();
    if (saved && saved.route && saved.to) {
      state.route = saved.route;
      state.route.lineFeature = turf.lineString(state.route.coords);
      state.from = saved.from;
      state.to = saved.to;

      await mapLoad;
      map.getSource('route').setData(state.route.lineFeature);
      const bounds = state.route.coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(state.route.coords[0], state.route.coords[0]),
      );
      map.fitBounds(bounds, { padding: 60, duration: 0 });
      renderManeuverList(state.route.maneuvers);
      renderRouteSummary(state.route.totalDistM, state.route.totalTimeS);
      el.bottomSheet.classList.remove('hidden');
      el.mapControls.classList.add('raised');
      el.startNavBtn.classList.remove('hidden');
      el.cancelRouteBtn.classList.remove('hidden');
      showRouteSearchFeature(); // currentTrip only ever persists a drive route (transit has none)
      goToDirections({ from: state.from, to: state.to }); // also clears stops — repopulate after
      replaceTopBackLayer(cancelPlannedRoute); // a route is already active here, not just the bare directions form
      (saved.stops || []).forEach((stop) => addStopRow(stop));
      updatePlanningMarkers();
      showStatus('Restored your in-progress route.', 'info');
    }
  } catch (err) {
    // Non-fatal: just start fresh at the planning screen.
  }
})();
