import { CONFIG } from './config.js';
import {
  addFavorite, getFavorites, deleteFavorite,
  addRecentTrip, getRecentTrips, deleteRecentTrip,
  addDownloadedArea, getDownloadedAreas, deleteDownloadedArea,
  saveCurrentTrip, loadCurrentTrip, clearCurrentTrip,
} from './idb.js';

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
  placeCardLabel: document.getElementById('place-card-label'),
  placeCardActions: document.getElementById('place-card-actions'),
  placeDirectionsBtn: document.getElementById('place-directions-btn'),
  placeClearBtn: document.getElementById('place-clear-btn'),
  offlineBtn: document.getElementById('offline-btn'),
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
  planBtn: document.getElementById('plan-route-btn'),
  bottomSheet: document.getElementById('bottom-sheet'),
  sheetHandle: document.getElementById('sheet-handle'),
  sheetSummary: document.getElementById('sheet-summary'),
  startNavBtn: document.getElementById('start-nav-btn'),
  endNavBtn: document.getElementById('end-nav-btn'),
  mapControls: document.getElementById('map-controls'),
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
  travelMode: 'drive', // 'drive' | 'transit' (Milestone 4C — transit has no live-navigation counterpart)
  transitItinerary: null, // last-planned OTP2 itinerary, kept separate from `route` since it's a different shape
  originMarker: null,
  destMarker: null,
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
function buildRouteState(trip) {
  let coords = [];
  const maneuvers = [];
  let cumM = 0;

  trip.legs.forEach((leg, legIdx) => {
    const legCoords = decodePolyline(leg.shape);
    coords = coords.concat(legIdx > 0 ? legCoords.slice(1) : legCoords);

    (leg.maneuvers || []).forEach((m) => {
      const lengthM = (m.length || 0) * 1000; // requested units: kilometers
      maneuvers.push({
        instruction: m.instruction || 'Continue',
        lengthM,
        timeS: m.time || 0,
        type: m.type,
        startDistM: cumM,
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
  map.addSource('route', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#3d8bfd', 'line-width': 5, 'line-opacity': 0.9 },
  });

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
function updatePlanningMarkers() {
  if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
  if (state.destMarker) { state.destMarker.remove(); state.destMarker = null; }
  if (state.from) {
    state.originMarker = new maplibregl.Marker({ element: createPinElement('#22c55e', 'Origin'), anchor: 'bottom' })
      .setLngLat([state.from.lon, state.from.lat]).addTo(map);
  }
  if (state.to) {
    state.destMarker = new maplibregl.Marker({ element: createPinElement('#ef4444', 'Destination'), anchor: 'bottom' })
      .setLngLat([state.to.lon, state.to.lat]).addTo(map);
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

function showMapillaryViewer({ loading, empty, error } = {}) {
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
  el.mapillaryCloseBtn.addEventListener('click', () => el.mapillaryViewer.classList.add('hidden'));
  el.mapillaryViewer.addEventListener('click', (e) => {
    if (e.target === el.mapillaryViewer) el.mapillaryViewer.classList.add('hidden'); // tap the backdrop to dismiss
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
  el.offlinePanel.classList.remove('hidden');
});
el.offlineCloseBtn.addEventListener('click', () => el.offlinePanel.classList.add('hidden'));

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

async function geocodeSearch(query) {
  const cacheKey = query.trim().toLowerCase();
  if (nominatimCache.has(cacheKey)) return nominatimCache.get(cacheKey);

  await nominatimLimiter();
  const url = `${CONFIG.NOMINATIM_URL}/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error('Could not reach the geocoding service. Check your connection or the Nominatim server address.');
  }
  if (!res.ok) throw new Error(`The geocoding service returned an error (HTTP ${res.status}).`);
  const data = await res.json();
  const results = data.map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lon: parseFloat(r.lon) }));
  nominatimCache.set(cacheKey, results);
  return results;
}

/** Wires a text input + its suggestion <ul> to Nominatim. `onSelect` is
 * called with a {label,lat,lon} result when the user picks one, or with
 * `null` as soon as they start typing again (so a stale pick can never be
 * silently submitted as if it were still valid). */
function setupAutocomplete(inputEl, listEl, onSelect) {
  let debounceTimer = null;
  let seq = 0; // guards against out-of-order network responses

  function hideList() {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
  }

  /** Shown the moment a debounced search actually fires, so there's visible
   * feedback while Nominatim's fuzzy match is in flight (typically a couple
   * hundred ms, longer on a self-hosted instance under load). */
  function showLoading() {
    listEl.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'loading';
    li.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Searching…</span>';
    listEl.appendChild(li);
    listEl.classList.remove('hidden');
  }

  function renderResults(results) {
    listEl.innerHTML = '';
    if (!results.length) {
      hideList();
      showStatus('No matching places found for that search.', 'info');
      return;
    }
    results.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'result-item';

      const text = document.createElement('span');
      text.className = 'result-text';
      text.textContent = r.label;
      text.addEventListener('click', () => {
        inputEl.value = r.label;
        hideList();
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

  inputEl.addEventListener('input', () => {
    onSelect(null);
    const query = inputEl.value.trim();
    clearTimeout(debounceTimer);
    hideList();
    if (query.length < 3) return;
    debounceTimer = setTimeout(async () => {
      const mySeq = ++seq;
      showLoading();
      try {
        const results = await geocodeSearch(query);
        if (mySeq !== seq) return; // a newer keystroke has already superseded this
        renderResults(results);
      } catch (err) {
        if (mySeq !== seq) return;
        hideList();
        showStatus(err.message, 'error');
      }
    }, CONFIG.NOMINATIM_DEBOUNCE_MS);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== inputEl && !listEl.contains(e.target)) hideList();
  });
}

function showPlaceCard({ label, lat, lon }) {
  el.placeCardLabel.textContent = label;
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

// ---- Default view: single search box, Google-Maps-style "search here" ----
setupAutocomplete(el.placeInput, el.placeSuggestions, (picked) => {
  state.to = picked;
  updatePlanningMarkers();
  if (picked) {
    showPlaceCard(picked);
    map.flyTo({ center: [picked.lon, picked.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  } else {
    hidePlaceCard();
  }
});

el.placeClearBtn.addEventListener('click', () => {
  state.to = null;
  el.placeInput.value = '';
  hidePlaceCard();
  updatePlanningMarkers();
});

/** Switches the search card between the single-search view and the from/to
 * directions editor. Shared by the "Directions" button, the back arrow, and
 * tapping a favorite/recent entry (Milestone 3C), so there's one place that
 * knows which sibling elements need to hide/show together. */
function setPlanningUiMode(mode) {
  const isSimple = mode === 'simple';
  el.searchSimple.classList.toggle('hidden', !isSimple);
  el.searchDirections.classList.toggle('hidden', isSimple);
  if (!isSimple) el.placeCard.classList.add('hidden');
}

/** Jumps straight into directions mode with the given origin/destination
 * already filled in and ready to route — used by favorites and recent trips,
 * where the intent is clearly "take me here now" rather than "look this up". */
function goToDirections({ from, to } = {}) {
  if (from) state.from = from;
  if (to) state.to = to;
  updatePlanningMarkers();
  el.fromInput.value = state.from ? state.from.label : '';
  el.toInput.value = state.to ? state.to.label : '';
  setPlanningUiMode('directions');
  if (!state.from) el.fromInput.focus();
}

el.placeDirectionsBtn.addEventListener('click', () => {
  el.toInput.value = state.to ? state.to.label : '';
  setPlanningUiMode('directions');
  el.fromInput.focus();
});

el.directionsBackBtn.addEventListener('click', () => {
  setPlanningUiMode('simple');
  if (state.to) {
    el.placeInput.value = state.to.label;
    showPlaceCard(state.to);
  }
});

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
      label: `${trip.originLabel} → ${trip.destLabel}`,
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
      label: fav.name,
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

function cancelLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressStartPoint = null;
}

map.on('mousedown', (e) => startLongPress(e));
map.on('touchstart', (e) => startLongPress(e));
map.on('mousemove', (e) => moveLongPress(e));
map.on('touchmove', (e) => moveLongPress(e));
map.on('mouseup', cancelLongPress);
map.on('touchend', cancelLongPress);
map.on('dragstart', cancelLongPress);

function startLongPress(e) {
  if (state.navigating) return; // don't let a bump while driving pop up a save prompt
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
  el.favoritePrompt.classList.remove('hidden');
  el.favoritePromptInput.focus();
}
function hideFavoritePrompt() {
  el.favoritePrompt.classList.add('hidden');
  if (favoritePromptMarker) { favoritePromptMarker.remove(); favoritePromptMarker = null; }
}
el.favoritePromptCancel.addEventListener('click', hideFavoritePrompt);
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
    hideFavoritePrompt();
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

el.swapBtn.addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  el.fromInput.value = state.from ? state.from.label : '';
  el.toInput.value = state.to ? state.to.label : '';
  updatePlanningMarkers();
});

// ============================================================================
// Routing (Valhalla)
// ============================================================================
const valhallaLimiter = createLimiter(CONFIG.VALHALLA_MIN_INTERVAL_MS);

async function requestRoute(from, to) {
  await valhallaLimiter();
  const body = {
    locations: [
      { lat: from.lat, lon: from.lon },
      { lat: to.lat, lon: to.lon },
    ],
    costing: 'auto',
    units: 'kilometers',
  };
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
  return data.trip;
}

/** Draws/replaces the route line and itinerary. `fitView` is false during a
 * mid-navigation reroute, since the camera is already following the puck and
 * a sudden fitBounds jump would be jarring. */
async function renderRoute(trip, { fitView = true } = {}) {
  const built = buildRouteState(trip);
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
    await saveCurrentTrip({ route: built, from: state.from, to: state.to });
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

el.planBtn.addEventListener('click', async () => {
  if (!state.from || !state.to) {
    showStatus('Please pick both a starting point and a destination from the suggestion list.', 'error');
    return;
  }
  el.planBtn.disabled = true;
  showStatus('Finding route…', 'info', { sticky: true });
  try {
    const trip = await requestRoute(state.from, state.to);
    await renderRoute(trip);
    el.bottomSheet.classList.remove('expanded');
    el.startNavBtn.classList.remove('hidden');
    clearStatus();
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    el.planBtn.disabled = false;
  }
});

el.sheetHandle.addEventListener('click', () => {
  el.bottomSheet.classList.toggle('expanded');
});

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
    const trip = await requestRoute(from, state.to);
    await renderRoute(trip, { fitView: false }); // camera keeps following the puck
    state.pendingRerouteFrom = null;
    clearStatus();
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

function startNavigation() {
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

  el.searchCard.classList.add('hidden');
  el.placeCard.classList.add('hidden');
  el.navBanner.classList.remove('hidden');
  el.bottomSheet.classList.remove('expanded');
  el.startNavBtn.classList.add('hidden');
  el.endNavBtn.classList.remove('hidden');
  updateLocateBtnState();

  // The live puck takes over as the "where am I" marker.
  if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
  if (state.myLocationMarker) { state.myLocationMarker.remove(); state.myLocationMarker = null; }

  showStatus('Getting your location…', 'info');
  state.watchId = navigator.geolocation.watchPosition(onPositionUpdate, onPositionError, CONFIG.GEOLOCATION_OPTIONS);
}

function endNavigation() {
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
  state.navigating = false;

  if (state.puckMarker) { state.puckMarker.remove(); state.puckMarker = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  el.navBanner.classList.add('hidden');
  el.endNavBtn.classList.add('hidden');
  el.startNavBtn.classList.remove('hidden');
  el.searchCard.classList.remove('hidden');
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
      goToDirections({ from: state.from, to: state.to });
      showStatus('Restored your in-progress route.', 'info');
    }
  } catch (err) {
    // Non-fatal: just start fresh at the planning screen.
  }
})();
