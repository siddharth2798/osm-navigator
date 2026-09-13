import { CONFIG } from './config.js';
import {
  addFavorite, getFavorites, deleteFavorite, moveFavoriteToList,
  addList, getLists, renameList, deleteList, getOrCreateNamedListId,
  addRecentTrip, getRecentTrips, deleteRecentTrip,
  addDownloadedArea, getDownloadedAreas, deleteDownloadedArea,
  saveCurrentTrip, loadCurrentTrip, clearCurrentTrip,
  setQuickPlace, getQuickPlace,
} from './idb.js';
import { startLocationWatch, stopLocationWatch, isNativePlatform, ensureLocationEnabled } from './native-location.js';
import { speakNative, primeNativeVoices, stopNative } from './native-tts.js';
import { initNativeBackButton } from './native-back.js';
import { setNavigating as setPipNavigating, updateTurnCard as updatePipTurnCard } from './native-pip.js';
import { setNavigating as setCarNavNavigating, updateTurnCard as updateCarNavTurnCard, updateRoute as updateCarNavRoute, updatePosition as updateCarNavPosition } from './native-car.js';
import { formatDistance, formatDuration, formatWaitText, formatWaitsText, formatBytes, formatFareINR } from './lib/format-utils.js';
import { splitPlaceLabel, escapeHtml, isSafeHttpUrl } from './lib/text-utils.js';
import { parseGoogleMapsUrl } from './lib/google-maps-url.js';
import { nearestKochiStation, findKochiTransferPoints as findKochiTransferPointsPure, feederRouteMetroEnd } from './lib/kochi-geo.js';
import { stopDragPromoteTarget } from './lib/stop-drag-utils.js';
import { kochiItineraryBaseParts, buildTransitItineraryLabels } from './lib/transit-labels.js';
// Plus Code decoding is dynamically imported below — rarely needed, so skip loading it up front.

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
  resolverDebugPanel: document.getElementById('resolver-debug-panel'),
  resolverDebugLogEl: document.getElementById('resolver-debug-log'),
  resolverDebugCollapseToggleBtn: document.getElementById('resolver-debug-collapse-toggle'),
  resolverDebugCopyBtn: document.getElementById('resolver-debug-copy'),
  resolverDebugCloseBtn: document.getElementById('resolver-debug-close'),
  resolverDebugEndBtn: document.getElementById('resolver-debug-end'),
  debugModeToggle: document.getElementById('debug-mode-toggle'),
  selfHostedValhallaToggle: document.getElementById('self-hosted-valhalla-toggle'),
  tomtomToggle: document.getElementById('tomtom-toggle'),
  voiceSelect: document.getElementById('voice-select'),
  searchCard: document.getElementById('search-card'),
  searchSimple: document.getElementById('search-simple'),
  placeInput: document.getElementById('place-input'),
  placeSuggestions: document.getElementById('place-suggestions'),
  placeCard: document.getElementById('place-card'),
  placeCardPrimary: document.getElementById('place-card-primary'),
  placeCardSecondary: document.getElementById('place-card-secondary'),
  placeCardActions: document.getElementById('place-card-actions'),
  evDetailsCard: document.getElementById('ev-details-card'),
  evConnectorLine: document.getElementById('ev-connector-line'),
  evOperatorLine: document.getElementById('ev-operator-line'),
  evStatusDot: document.getElementById('ev-status-dot'),
  evStatusText: document.getElementById('ev-status-text'),
  evOperatorLink: document.getElementById('ev-operator-link'),
  evViewDetailsBtn: document.getElementById('ev-view-details-btn'),
  evDetailsPanel: document.getElementById('ev-details-panel'),
  evDetailsPanelTitle: document.getElementById('ev-details-panel-title'),
  evDetailsPanelCloseBtn: document.getElementById('ev-details-panel-close-btn'),
  evDetailsPanelStatusDot: document.getElementById('ev-details-panel-status-dot'),
  evDetailsPanelStatusText: document.getElementById('ev-details-panel-status-text'),
  evDetailsPanelConnectors: document.getElementById('ev-details-panel-connectors'),
  evDetailsPanelOperator: document.getElementById('ev-details-panel-operator'),
  evDetailsPanelCost: document.getElementById('ev-details-panel-cost'),
  evDetailsPanelAddressSection: document.getElementById('ev-details-panel-address-section'),
  evDetailsPanelAddress: document.getElementById('ev-details-panel-address'),
  evDetailsPanelCommentsSection: document.getElementById('ev-details-panel-comments-section'),
  evDetailsPanelComments: document.getElementById('ev-details-panel-comments'),
  tripSummaryPanel: document.getElementById('trip-summary-panel'),
  tripSummaryTitle: document.getElementById('trip-summary-title'),
  tripSummaryCloseBtn: document.getElementById('trip-summary-close-btn'),
  tripSummaryStats: document.getElementById('trip-summary-stats'),
  placeDirectionsBtn: document.getElementById('place-directions-btn'),
  placeCardSaveBtn: document.getElementById('place-card-save-btn'),
  placeClearBtn: document.getElementById('place-clear-btn'),
  offlineBtn: document.getElementById('offline-btn'),
  savedBtn: document.getElementById('saved-btn'),
  categoryChips: document.getElementById('category-chips'),
  routeOptionsRow: document.getElementById('route-options'),
  transitItineraryOptionsRow: document.getElementById('transit-itinerary-options'),
  elevationProfile: document.getElementById('elevation-profile'),
  routeChips: document.getElementById('route-chips'),
  routeChipsStops: document.getElementById('route-chips-stops'),
  routeChipsInline: document.getElementById('route-chips-inline'),
  poiResultsHeader: document.getElementById('poi-results-header'),
  poiResultsLabel: document.getElementById('poi-results-label'),
  poiBackBtn: document.getElementById('poi-back-btn'),
  poiResultsList: document.getElementById('poi-results-list'),
  listNamePrompt: document.getElementById('list-name-prompt'),
  listNamePromptTitle: document.getElementById('list-name-prompt-title'),
  listNamePromptInput: document.getElementById('list-name-prompt-input'),
  listNamePromptCancel: document.getElementById('list-name-prompt-cancel'),
  listNamePromptSave: document.getElementById('list-name-prompt-save'),
  saveToListPrompt: document.getElementById('save-to-list-prompt'),
  saveToListPlaceName: document.getElementById('save-to-list-place-name'),
  saveToListOptions: document.getElementById('save-to-list-options'),
  saveToListNewName: document.getElementById('save-to-list-new-name'),
  saveToListNewBtn: document.getElementById('save-to-list-new-btn'),
  saveToListCancel: document.getElementById('save-to-list-cancel'),
  saveToListSave: document.getElementById('save-to-list-save'),
  searchDirections: document.getElementById('search-directions'),
  directionsSummaryRow: document.getElementById('directions-summary-row'),
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
  sheetActions: document.getElementById('sheet-actions'),
  sheetSummary: document.getElementById('sheet-summary'),
  shareRouteBtn: document.getElementById('share-route-btn'),
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
  navSpeedRow: document.getElementById('nav-speed-row'),
  navSpeed: document.getElementById('nav-speed'),
  speedLimitSign: document.getElementById('speed-limit-sign'),
  speedLimitValue: document.getElementById('speed-limit-value'),
  boardConfirmBtn: document.getElementById('board-confirm-btn'),
  trafficBadge: document.getElementById('traffic-badge'),
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
  savedPanel: document.getElementById('saved-panel'),
  savedBackBtn: document.getElementById('saved-back-btn'),
  savedPanelTitle: document.getElementById('saved-panel-title'),
  savedCloseBtn: document.getElementById('saved-close-btn'),
  savedListsView: document.getElementById('saved-lists-view'),
  quickPlacesList: document.getElementById('quick-places-list'),
  savedListsList: document.getElementById('saved-lists-list'),
  newListBtn: document.getElementById('new-list-btn'),
  savedListDetailView: document.getElementById('saved-list-detail-view'),
  savedListDetailName: document.getElementById('saved-list-detail-name'),
  renameListBtn: document.getElementById('rename-list-btn'),
  deleteListDetailBtn: document.getElementById('delete-list-detail-btn'),
  savedListDetailItems: document.getElementById('saved-list-detail-items'),
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
  routeAvoidToggle: document.getElementById('route-avoid-toggle'),
  mapControlsLeft: document.getElementById('map-controls-left'),
  effortBtn: document.getElementById('effort-btn'),
  voiceModeBtn: document.getElementById('voice-mode-btn'),
  mapLayerBtn: document.getElementById('map-layer-btn'),
  mapStylePopover: document.getElementById('map-style-popover'),
  weatherBadge: document.getElementById('weather-badge'),
  weatherEmoji: document.getElementById('weather-emoji'),
  weatherTemp: document.getElementById('weather-temp'),
  docsBtn: document.getElementById('docs-btn'),
  docsPanel: document.getElementById('docs-panel'),
  docsCloseBtn: document.getElementById('docs-close-btn'),
};

// ============================================================================
// App state — the single source of truth for what's currently on screen.
// ============================================================================
const state = {
  from: null,          // {label, lat, lon}
  to: null,            // {label, lat, lon}
  route: null,         // {coords, maneuvers, totalDistM, totalTimeS, lineFeature}
  routeOptions: [],    // raw Valhalla trip objects
  routeOptionDetourTrips: new Set(), // subset tagged "Avoids traffic" by maybeAddTrafficDetourOption
  selectedRouteIndex: 0, // which routeOptions entry is drawn/active
  travelMode: 'drive', // 'drive' | 'walk' | 'transit'
  avoidTolls: false,   // drive-only; see costingOptionsFor()
  avoidHighways: false, // drive-only; see costingOptionsFor()
  filterOpenNow: false, // see applyOpenNowFilter
  transitItinerary: null, // last-planned OTP2 itinerary; different shape from `route`
  transitItineraryOptions: [], // candidates from requestTransitItineraries
  selectedTransitItineraryIndex: 0, // which entry is drawn/active
  pendingQuickPlaceKind: null, // 'home' | 'work' when the next picked place should be saved, not routed to
  originMarker: null,
  destMarker: null,
  stopMarkers: [],     // numbered pins for intermediate stops, in visit order
  poiMarkers: [],      // current category/along-route search results
  elevationHighlightMarker: null, // marks a tapped elevation-chart point on the route
  currentLegIndex: 0,  // which leg of a multi-stop trip we're on
  currentManeuverIdx: 0, // forward-only ratchet into state.route.maneuvers
  currentSpeedMps: null, // live GPS speed, or null if unavailable/unreliable
  traveledM: null,     // distance travelled along state.route so far
  puckMarker: null,
  myLocationMarker: null, // "you are here" arrow shown before navigation starts
  idleLocationWatchId: null, // geolocation.watchPosition id, null when not sharing
  navigating: false,
  watchId: null,
  // Maneuvers already spoken, tracked per prompt stage (far/near) so each is announced once.
  spokenFar: new Set(),
  spokenNear: new Set(),
  spokenContinue: new Set(), // "Continue straight for X km", spoken once per long straight maneuver
  spokenInclines: new Set(), // grade-segment start indices already announced
  voiceMode: 'all', // 'all' | 'off'
  arrivedAnnounced: false,
  arrivalCandidateStreak: 0, // consecutive fixes within ARRIVAL_RADIUS_M
  lastFix: null,       // {lng, lat, t} of the previous GPS fix, for bearing fallback
  lastHeading: 0,
  offRouteSince: null, // timestamp when we first went off-route, or null
  isRerouting: false,
  pendingRerouteFrom: null, // last known-good lngLat owed a reroute once connectivity returns
  followMode: true,    // whether the camera auto-follows the live position
  // Live traffic (TomTom Flow Segment Data), all reset together by resetTrafficTracking().
  lastTrafficCheckAt: null,     // Date.now() of the last check-in
  lastTrafficCheckDistM: null,  // state.traveledM at the last check-in
  trafficCheckInFlight: false,  // guards against overlapping check-ins
  trafficRatio: null,           // last averaged currentSpeed/freeFlowSpeed, or null
  // Not reset by resetTrafficTracking (fires on every reroute); only start/endNavigation clear this.
  lastTrafficRerouteAt: null,
  navigationStartedAt: null, // Date.now() when the trip started
  liveAscentM: 0,       // accumulated live climb this trip (walk mode)
  liveDescentM: 0,       // accumulated live descent this trip (walk mode)
  lastElevationHeightM: null, // height at the previous tick's traveledM

  // Kochi-transit live tracking, kept separate from currentLegIndex/currentManeuverIdx
  // since a transit itinerary is a sequence of distinct legs (walk, ride, walk, ...).
  transitTracking: false,   // true only between startTransitNavigation and endTransitNavigation
  transitLegIndex: 0,       // which leg of state.transitItinerary is active
  transitLegManeuverIdx: 0, // ratchet into the current WALK/CAR leg's own maneuvers
  transitLegLineFeature: null, // turf.lineString of the current leg's geometry
  transitLegArrivalStreak: 0,  // consecutive fixes within arrival radius of the current leg's destination
  transitRideBoarded: false,   // current ride leg only
  transitRideOffRouteSince: null, // current ride leg only; separate from offRouteSince above
  transitRideHidden: false,    // true once a sustained deviation makes live progress untrustworthy
  transitRideStationIdx: null, // last-rendered "next station" index, ratchets DOM updates
};

// ============================================================================
// Android/mobile "back" button handling
// ============================================================================
// Each closeable UI layer pushes a dummy history entry on open, and popstate closes it —
// undo one layer at a time, like Google Maps. native-back.js routes the hardware/gesture
// back button through this same goBackInApp()/backStack pipeline.
const backStack = []; // close-callbacks, most-recently-opened layer last

/** Call when a closeable layer opens. `closeFn` must be idempotent, and may
 * return `true` to VETO the close (used by the active-navigation guard). */
function pushBackLayer(closeFn) {
  backStack.push(closeFn);
  history.pushState({ nav: backStack.length }, '');
}

/** Call when an open layer's meaning changes without changing its depth
 * (e.g. directions form -> route planned). Swaps closeFn with no new history entry. */
function replaceTopBackLayer(closeFn) {
  if (backStack.length) {
    backStack[backStack.length - 1] = closeFn;
  } else {
    pushBackLayer(closeFn);
  }
}

/** For a layer that can also close itself without a back press (e.g. the
 * place card clearing on a new search). Drops it from the stack without
 * consuming a history entry; only removes it if still on top. */
function forgetBackLayerIfTop(closeFn) {
  if (backStack.length && backStack[backStack.length - 1] === closeFn) backStack.pop();
}

/** Collapses everything back to home state regardless of nesting depth,
 * instead of popping one at a time. */
function clearBackLayers() {
  backStack.length = 0;
}

/** Every on-screen close/back/cancel control should call this instead of
 * closing its layer directly, so hardware and on-screen back stay in sync. */
function goBackInApp() {
  if (backStack.length) history.back();
}

window.addEventListener('popstate', () => {
  const closeFn = backStack[backStack.length - 1];
  if (!closeFn) return; // nothing tracked — let the platform's own back behaviour proceed
  const veto = closeFn();
  if (veto) {
    // Push an equivalent history entry back so the same guard catches the next back press.
    history.pushState({ nav: backStack.length }, '');
  } else if (backStack[backStack.length - 1] === closeFn) {
    // Only pop if closeFn is still on top — some closeFns push/replace their
    // own layer as a side effect, which would otherwise get popped instead.
    backStack.pop();
  }
});

if (isNativePlatform()) {
  initNativeBackButton({
    hasOpenLayer: () => backStack.length > 0 || !el.resolverDebugPanel.classList.contains('hidden'),
    goBack: () => {
      // Debug panel isn't tracked in backStack, so check it explicitly first.
      if (!el.resolverDebugPanel.classList.contains('hidden')) {
        el.resolverDebugPanel.classList.add('hidden');
        return;
      }
      goBackInApp();
    },
  });
}

// ============================================================================
// Small utilities
// ============================================================================

/** Plain fetch() has no timeout, so wraps it with an AbortController. */
async function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Ensures calls are spaced at least `minIntervalMs` apart, chaining callers
 * onto a shared queue so concurrent calls don't race to read/write `lastCall`. */
function createLimiter(minIntervalMs) {
  let lastCall = 0;
  let queue = Promise.resolve();
  function wait() {
    const myTurn = queue.then(async () => {
      const remaining = lastCall + minIntervalMs - Date.now();
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      lastCall = Date.now();
    });
    queue = myTurn;
    return myTurn;
  }
  return wait;
}

/** Like formatDistance but spells out units for speechSynthesis ("m" is read as the letter). */
function formatDistanceForSpeech(m) {
  if (m < 950) return `${Math.floor(m / 10) * 10} meters`;
  return `${(m / 1000).toFixed(1)} kilometers`;
}

/** Converts a target lead TIME to a lead DISTANCE at current speed, clamped
 * to [minM, maxM] — time-based so it's neither too early at city speed nor too late on a highway. */
function dynamicVoiceLeadM(leadTimeS, minM, maxM) {
  const speedMps = state.currentSpeedMps ?? CONFIG.VOICE_DEFAULT_SPEED_MPS;
  return Math.min(maxM, Math.max(minM, speedMps * leadTimeS));
}

/** Extra lead distance so "in X meters" is still accurate once the whole
 * sentence finishes speaking, not just when it starts. */
function speechDurationLeadM(text) {
  const speedMps = state.currentSpeedMps ?? CONFIG.VOICE_DEFAULT_SPEED_MPS;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return speedMps * (words / CONFIG.VOICE_SPEAKING_RATE_WPM) * 60;
}

// Number of upcoming departures shown in the "Next departures in X, Y, Z min" line (display-only).
const TRANSIT_UPCOMING_DEPARTURES = 3;

// Maps Valhalla's numeric maneuver `type` enum to icon shapes. Unlisted types fall back to a straight arrow.
const ARROW_PATH = '<path d="M12 4 L12 20 M12 4 L6 10 M12 4 L18 10"/>';
const UTURN_PATH = '<path d="M8 19 V11 a4 4 0 0 1 8 0 v3 M16 11 l3.5 3.5 M16 11 l-3.5 3.5"/>';
const ROUNDABOUT_PATH = '<circle cx="12" cy="12" r="7"/><path d="M12 5 L15 8 M12 5 L9 8"/>';
const FLAG_PATH = '<path d="M6 21 V4"/><path d="M6 5 H18 L15 9 L18 13 H6" fill="currentColor" stroke="none"/>';
const DOT_PATH = '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>';

const MANEUVER_ICONS = {
  1: { path: DOT_PATH }, 2: { path: DOT_PATH }, 3: { path: DOT_PATH },       // start
  4: { path: FLAG_PATH }, 5: { path: FLAG_PATH }, 6: { path: FLAG_PATH },    // destination
  8: {},                                                                    // continue straight (kContinue)
  9: { rotate: 30 }, 10: { rotate: 90 }, 11: { rotate: 120 },                // (slight/-/sharp) right
  12: { path: UTURN_PATH, flip: true }, 13: { path: UTURN_PATH },            // u-turns
  14: { rotate: -120 }, 15: { rotate: -90 }, 16: { rotate: -30 },            // sharp/-/slight left
  18: { rotate: 45 }, 19: { rotate: -45 }, 20: { rotate: 45 }, 21: { rotate: -45 }, // ramps/exits
  22: {},                                                                   // stay straight (kStayStraight)
  23: { rotate: 20 }, 24: { rotate: -20 },                                   // stay right/left
  26: { path: ROUNDABOUT_PATH }, 27: { path: ROUNDABOUT_PATH },              // roundabout
};

// "Continue straight for X km" types; kBecomes ("road becomes X") counts as straight-through too.
const CONTINUE_STRAIGHT_TYPES = new Set([7, 8, 22]);
const CONTINUE_STRAIGHT_MIN_LENGTH_M = 1000;

/** Sums maneuvers[startIdx] plus every consecutive straight-through maneuver
 * after it, since Valhalla often splits one long straight stretch into several. */
function straightAheadDistanceM(maneuvers, startIdx) {
  let total = 0;
  for (let i = startIdx; i < maneuvers.length && CONTINUE_STRAIGHT_TYPES.has(maneuvers[i].type); i++) {
    total += maneuvers[i].lengthM;
  }
  return total;
}

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

/** Maps a Valhalla maneuver type to a fixed icon-key string for the native
 * Picture-in-Picture mini view (see native-pip.js / MainActivity.java). */
function maneuverPipIconKey(type) {
  const cfg = MANEUVER_ICONS[type];
  if (!cfg) return 'straight';
  if (cfg.path === FLAG_PATH) return 'arrive';
  if (cfg.path === UTURN_PATH) return 'uturn';
  if (cfg.path === ROUNDABOUT_PATH) return 'roundabout';
  if (cfg.path === DOT_PATH || !cfg.rotate) return 'straight';
  if (cfg.rotate === 90) return 'right';
  if (cfg.rotate === -90) return 'left';
  if (cfg.rotate === 120) return 'sharp-right';
  if (cfg.rotate === -120) return 'sharp-left';
  return cfg.rotate > 0 ? 'slight-right' : 'slight-left';
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
/** Plain-language status banner. Auto-dismisses unless `opts.sticky` (used
 * for in-progress states like "Finding route…" that need a real follow-up
 * event to replace them). Errors get a longer delay but still auto-dismiss.
 * `opts.link` (`{href, text}`) appends a tappable `<a>`, built via DOM APIs
 * and gated by isSafeHttpUrl since href may trace back to attacker-influenceable
 * text; pass `sticky: true` alongside a link so there's time to tap it. */
function showStatus(message, type = 'info', opts = {}) {
  clearTimeout(statusTimer);
  // Reset any leftover swipe-drag transform/opacity from a previous message.
  el.statusBanner.style.transform = '';
  el.statusBanner.style.opacity = '';
  el.statusBanner.textContent = message;
  el.statusBanner.className = type;
  if (opts.link && isSafeHttpUrl(opts.link.href)) {
    const a = document.createElement('a');
    a.href = opts.link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = opts.link.text;
    // Own line, underlined so it reads as tappable.
    a.style.display = 'block';
    a.style.marginTop = '4px';
    a.style.textDecoration = 'underline';
    a.style.color = 'inherit';
    el.statusBanner.appendChild(a);
  }
  // `opts.action` (`{text, onClick}`) is like opts.link but for an in-app
  // action. Dismisses the banner before invoking onClick, so a callback that
  // opens its own sticky showStatus isn't immediately wiped by this dismissal.
  if (opts.action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opts.action.text;
    btn.style.display = 'block';
    btn.style.marginTop = '4px';
    btn.style.textDecoration = 'underline';
    btn.style.color = 'inherit';
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.font = 'inherit';
    btn.style.cursor = 'pointer';
    btn.style.padding = '0';
    btn.addEventListener('click', () => {
      clearStatus();
      opts.action.onClick();
    });
    el.statusBanner.appendChild(btn);
  }
  if (!opts.sticky) {
    statusTimer = setTimeout(clearStatus, opts.timeoutMs || (type === 'error' ? 8000 : 4000));
  }
}
function clearStatus() {
  el.statusBanner.className = 'hidden';
  el.statusBanner.textContent = '';
}

// Swipe the status banner left or right to dismiss it immediately.
(function setupStatusBannerSwipe() {
  const DISMISS_THRESHOLD_PX = 60;
  const FLING_DISTANCE_PX = 300; // how far off-screen the slide-out animates to, not a real distance check
  let dragStartX = 0;
  let dragX = 0;
  let dragging = false;

  el.statusBanner.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragStartX = e.clientX;
    dragX = 0;
    el.statusBanner.style.transition = 'none';
    el.statusBanner.setPointerCapture(e.pointerId);
  });
  el.statusBanner.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragX = e.clientX - dragStartX;
    el.statusBanner.style.transform = `translateX(${dragX}px)`;
    el.statusBanner.style.opacity = String(Math.max(0, 1 - Math.abs(dragX) / 150));
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    el.statusBanner.style.transition = '';
    if (Math.abs(dragX) > DISMISS_THRESHOLD_PX) {
      const direction = dragX > 0 ? 1 : -1;
      el.statusBanner.style.transform = `translateX(${direction * FLING_DISTANCE_PX}px)`;
      el.statusBanner.style.opacity = '0';
      clearTimeout(statusTimer);
      // Let the slide-out transition play before clearStatus hides the element.
      setTimeout(clearStatus, 200);
    } else {
      // Below the threshold — snap back rather than treating a small nudge as a dismiss.
      el.statusBanner.style.transform = '';
      el.statusBanner.style.opacity = '';
    }
  }
  el.statusBanner.addEventListener('pointerup', endDrag);
  el.statusBanner.addEventListener('pointercancel', endDrag);
})();

// ============================================================================
// Valhalla polyline decoding (precision 6, vs. Google's 1e5)
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

/** Concatenates every leg's decoded shape into one coordinate list. */
function decodeTripCoords(trip) {
  let coords = [];
  trip.legs.forEach((leg, legIdx) => {
    const legCoords = decodePolyline(leg.shape);
    coords = coords.concat(legIdx > 0 ? legCoords.slice(1) : legCoords);
  });
  return coords;
}

/** Valhalla says "Bear left/right"; swap for "Slight left/right" like Google Maps. */
function rewordInstruction(instruction) {
  return instruction.replace(/\bbear\b/gi, (match) => (match[0] === 'B' ? 'Slight' : 'slight'));
}

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/** Builds "Take the 2nd exit" wording instead of relying on Valhalla's own
 * template. `roundabout_exit_count` actually arrives on the kRoundaboutEnter
 * maneuver (type 26), not kRoundaboutExit (27) as the docs describe, so both
 * are checked. On the enter maneuver, `street_names` is the roundabout's own
 * name, not the exit road — that's on `nextM`, the following exit maneuver. */
function applyRoundaboutPhrasing(instruction, m, nextM) {
  const isEnter = m.type === 26;
  const isExit = m.type === 27;
  if (!isEnter && !isExit) return instruction;
  const exitCount = m.roundabout_exit_count || (isEnter && nextM && nextM.roundabout_exit_count);
  if (!exitCount) return instruction;
  const exitStreetSource = isEnter ? nextM : m;
  const streetPart = exitStreetSource && exitStreetSource.street_names && exitStreetSource.street_names.length
    ? ` onto ${exitStreetSource.street_names[0]}` : '';
  return `Take the ${ordinal(exitCount)} exit at the roundabout${streetPart}.`;
}

function buildRouteState(trip, stops = []) {
  const coords = decodeTripCoords(trip);
  const maneuvers = [];
  let cumM = 0;

  trip.legs.forEach((leg, legIdx) => {
    const legManeuvers = leg.maneuvers || [];

    legManeuvers.forEach((m, mIdx) => {
      const lengthM = (m.length || 0) * 1000; // requested units: kilometers
      let instruction = applyRoundaboutPhrasing(rewordInstruction(m.instruction || 'Continue'), m, legManeuvers[mIdx + 1]);

      const isArrivalType = m.type >= 4 && m.type <= 6;

      // Disambiguates a real flyover from Valhalla's generic "ramp"/"exit" wording.
      if (m.bridge && !isArrivalType) {
        instruction += ' — this leads onto a flyover.';
      }

      // Relabel arrival at an intermediate stop so a multi-stop trip doesn't say "destination" twice.
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
        // verbal_multi_cue marks a maneuver right before a short segment;
        // verbal_pre_transition_instruction is already a combined phrase for both. See updateActiveManeuver.
        verbalMultiCue: !!m.verbal_multi_cue,
        verbalPreTransition: m.verbal_pre_transition_instruction || null,
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

/** `mapLoad` never rejects on its own, so this races it against a timeout
 * to avoid hanging forever if tiles/style never finish loading. */
function awaitMapLoad() {
  return Promise.race([
    mapLoad,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('The map failed to load — check your connection and reload the page.')),
      CONFIG.MAP_LOAD_TIMEOUT_MS,
    )),
  ]);
}

// Layers of the base "liberty" vector style, captured before our own sources/layers are added.
let baseStyleLayerIds = [];
let mapViewMode = 'map'; // 'map' | 'satellite'

/** Toggles between the vector map and Esri World Imagery satellite tiles by
 * hiding base-style layers rather than swapping styles, so runtime-added
 * layers (route, puck, etc.) stay intact. */
// Only these layer types paint a solid area that would obscure the imagery; roads/labels stay visible.
const SATELLITE_HIDE_LAYER_TYPES = new Set(['background', 'fill', 'fill-extrusion', 'raster']);

function setMapViewMode(mode) {
  mapViewMode = mode;
  const satellite = mode === 'satellite';
  baseStyleLayerIds.forEach((id) => {
    const layer = map.getLayer(id);
    if (!layer) return;
    const shouldHide = satellite && SATELLITE_HIDE_LAYER_TYPES.has(layer.type);
    map.setLayoutProperty(id, 'visibility', shouldHide ? 'none' : 'visible');
  });
  map.setLayoutProperty('satellite-layer', 'visibility', satellite ? 'visible' : 'none');
  el.mapLayerBtn.classList.toggle('active', satellite);
  // Keep popover options in sync since setMapViewMode can be called from multiple places.
  el.mapStylePopover.querySelectorAll('.map-style-opt').forEach((opt) => {
    opt.setAttribute('aria-checked', String(opt.dataset.style === mode));
  });
}

mapLoad.then(() => {
  baseStyleLayerIds = map.getStyle().layers.map((l) => l.id);

  // Inserted with an explicit beforeId so it lands at the BOTTOM of the layer
  // stack, under the road/label layers setMapViewMode keeps visible.
  map.addSource('satellite', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    // Real Esri imagery resolution often maxes out around z17-19; capping
    // here lets MapLibre upscale instead of showing a gray placeholder tile.
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });
  map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, baseStyleLayerIds[0]);

  // Alternate routes render under the primary line — muted gray, tappable to switch to that option.
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
  // Painted over route-line for the portion already driven — see updateTraveledRouteSegment.
  map.addSource('route-traveled', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'route-traveled-line',
    type: 'line',
    source: 'route-traveled',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5b6472', 'line-width': 5, 'line-opacity': 0.85 },
  });
  // Colors the SELECTED route by TomTom traffic — short dashes ahead during
  // live nav (runTrafficCheckin), or full coverage at planning time
  // (paintRouteOptionsTrafficOverlay). Only populated when TomTom features
  // are enabled and in drive mode; empty otherwise.
  map.addSource('route-traffic', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'route-traffic-line',
    type: 'line',
    source: 'route-traffic',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': 6,
      // Amber breakpoint reuses CONFIG.TRAFFIC_HEAVY_THRESHOLD to match the badge/ETA cutoff.
      'line-color': ['interpolate', ['linear'], ['get', 'ratio'],
        0.3, '#ef4444',
        CONFIG.TRAFFIC_HEAVY_THRESHOLD, '#f59e0b',
        0.85, '#22c55e',
      ],
    },
  });
  map.on('click', 'route-alternates-line', (e) => {
    if (e.features.length) selectRouteOption(e.features[0].properties.optionIndex);
  });
  map.on('mouseenter', 'route-alternates-line', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'route-alternates-line', () => { map.getCanvas().style.cursor = ''; });

  map.addSource('transit-route', { type: 'geojson', data: emptyFeatureCollection() });
  // WALK and CAR both get to/from the transit leg — dashed, distinct from
  // solid ride legs. CAR is the park-and-ride case (driveOrWalkLeg).
  map.addLayer({
    id: 'transit-route-walk',
    type: 'line',
    source: 'transit-route',
    filter: ['in', ['get', 'mode'], ['literal', ['WALK', 'CAR']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'mode'], 'CAR', '#3d8bfd', '#9aabc2'],
      'line-width': 3,
      'line-dasharray': [2, 2],
    },
  });
  map.addLayer({
    id: 'transit-route-transit',
    type: 'line',
    source: 'transit-route',
    filter: ['!', ['in', ['get', 'mode'], ['literal', ['WALK', 'CAR']]]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      // Bus/ferry get their own color; other modes fall through to purple.
      'line-color': ['match', ['get', 'mode'], 'BUS', '#3d8bfd', 'FERRY', '#06b6d4', '#a855f7'],
      'line-width': 5,
    },
  });
});
map.on('error', (e) => {
  console.error(e && e.error ? e.error : e);
});

// If the driver manually drags the map during navigation, stop auto-following.
// `dragstart` only fires on user gestures, never our own programmatic `easeTo` calls.
map.on('dragstart', () => {
  // transitTracking also auto-follows the live position, same as state.navigating.
  if (!(state.navigating || state.transitTracking) || !state.followMode) return;
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

/** Small round dot marking one candidate from a category/along-route search,
 * with a name-tag bubble above it. The label is absolutely positioned so it
 * doesn't shift the dot's center off the marker's lngLat. `statusKey` (EV
 * results only) tints the dot with the place card's operational-status coloring. */
function createPoiMarkerElement(labelText, statusKey) {
  const wrap = document.createElement('div');
  wrap.className = 'poi-marker-wrap';
  const primary = splitPlaceLabel(labelText).primary;
  const dotClass = statusKey ? `poi-marker ev-marker-${statusKey}` : 'poi-marker';
  wrap.innerHTML = `
    <div class="poi-marker-label">${escapeHtml(primary)}</div>
    <div class="${dotClass}"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="10"/></svg></div>
  `;
  return wrap;
}

function clearPoiMarkers() {
  state.poiMarkers.forEach((m) => m.remove());
  state.poiMarkers = [];
}

/** Drops one marker per result; tapping a marker selects that result like tapping its list row. */
function showPoiMarkers(results, onSelect) {
  clearPoiMarkers();
  results.forEach((r) => {
    const el2 = createPoiMarkerElement(r.label, r.evDetails && r.evDetails.statusKey);
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

/** Live-navigation puck — bigger and more distinct than the idle dot (createLocationDotElement). */
function createPuckElement() {
  const div = document.createElement('div');
  div.className = 'puck-marker puck-marker-nav';
  div.setAttribute('aria-label', 'Your location');
  div.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="17" fill="#3d8bfd" fill-opacity="0.20"/>
    <path d="M20 3 L33 33 L20 25 L7 33 Z" fill="#3d8bfd" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
  </svg>`;
  return div;
}

/** Idle "you are here" marker — smaller than the nav puck so it doesn't look like navigation is active. */
function createLocationDotElement() {
  const div = document.createElement('div');
  div.className = 'puck-marker';
  div.setAttribute('aria-label', 'Your location');
  div.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
    <circle cx="13" cy="13" r="11" fill="#3d8bfd" fill-opacity="0.20"/>
    <path d="M13 1 L18 10 L13 7.5 L8 10 Z" fill="#3d8bfd" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="13" cy="13" r="6" fill="#3d8bfd" stroke="#fff" stroke-width="2"/>
  </svg>`;
  return div;
}

/** Live "you are here" marker for the locate button outside navigation.
 * Rotates to `headingDeg` when available; `null` leaves the last rotation in place. */
function updateMyLocationMarker(lngLat, headingDeg) {
  if (!state.myLocationMarker) {
    state.myLocationMarker = new maplibregl.Marker({
      element: createLocationDotElement(),
      rotationAlignment: 'map',
      pitchAlignment: 'map',
    }).setLngLat(lngLat).addTo(map);
  } else {
    state.myLocationMarker.setLngLat(lngLat);
  }
  if (headingDeg != null) state.myLocationMarker.setRotation(headingDeg);
}

/** Device-compass heading — fallback for the idle location marker while
 * stationary, when GPS course-over-ground is meaningless (needs movement). */
let compassHeadingDeg = null;
function handleDeviceOrientation(event) {
  // iOS exposes webkitCompassHeading directly. Elsewhere, `alpha` from the
  // absolute variant is CCW degrees from north, so 360-alpha converts it.
  // Non-absolute events have no fixed reference frame and are ignored.
  const heading = typeof event.webkitCompassHeading === 'number'
    ? event.webkitCompassHeading
    : (event.absolute && typeof event.alpha === 'number' ? (360 - event.alpha) % 360 : null);
  if (heading != null) compassHeadingDeg = heading;
}

let deviceOrientationActive = false;
/** iOS 13+ requires this permission prompt from within a user-gesture
 * handler, so it's called from the locate button's click handler. No-op elsewhere. */
async function enableDeviceOrientation() {
  if (deviceOrientationActive) return;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
    } catch {
      return;
    }
  }
  window.addEventListener('deviceorientationabsolute', handleDeviceOrientation);
  window.addEventListener('deviceorientation', handleDeviceOrientation); // carries iOS's webkitCompassHeading
  deviceOrientationActive = true;
}

/** Stops the compass sensor once the idle location marker (its only consumer) is off.
 * Called everywhere state.idleLocationWatchId is cleared. */
function disableDeviceOrientation() {
  if (!deviceOrientationActive) return;
  window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation);
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  deviceOrientationActive = false;
  compassHeadingDeg = null;
}

/** Reads the picked place for every stop row in the DOM, in visit order.
 * Stop rows store their value on `input._stopPlace` so DOM order is the only source of truth. */
function getStops() {
  return [...el.stopsContainer.querySelectorAll('.stop-row input')]
    .map((input) => input._stopPlace)
    .filter(Boolean);
}

const ROUND_TRIP_PIN_OFFSET_PX = 14; // lets both pin bulbs clear each other

function updatePlanningMarkers() {
  if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
  if (state.destMarker) { state.destMarker.remove(); state.destMarker = null; }
  state.stopMarkers.forEach((m) => m.remove());
  state.stopMarkers = [];

  // Round trip: origin and destination pins would otherwise sit exactly on top of each other.
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
// Map control stack: zoom +/- and the dual-purpose locate button.
// ============================================================================
el.zoomInBtn.addEventListener('click', () => map.zoomIn({ duration: 200 }));
el.zoomOutBtn.addEventListener('click', () => map.zoomOut({ duration: 200 }));

/** Two distinct glyphs rather than just a recolor, since a color-only change is easy to miss while driving. */
function locateBtnIcon(offCenter) {
  if (offCenter) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><path d="M12 2 L19 21 L12 17 L5 21 Z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
    + '<circle cx="12" cy="12" r="3"/><path d="M12 2 v3.5 M12 18.5 v3 M2.5 12 h3.5 M18.5 12 h3"/></svg>';
}

// null (not false) so the first updateLocateBtnState() call always paints an icon.
let lastLocateBtnOffCenter = null;
function updateLocateBtnState() {
  const offCenter = (state.navigating || state.transitTracking) && !state.followMode;
  el.locateBtn.classList.toggle('active', offCenter);
  if (offCenter !== lastLocateBtnOffCenter) {
    el.locateBtn.innerHTML = locateBtnIcon(offCenter);
    el.locateBtn.setAttribute('aria-label', offCenter ? 'Recenter on your location' : 'Show my location');
    if (offCenter) {
      // Remove-reflow-readd so the pulse animation retriggers even if this fires twice in a row.
      el.locateBtn.classList.remove('pulse-once');
      void el.locateBtn.offsetWidth;
      el.locateBtn.classList.add('pulse-once');
    }
    lastLocateBtnOffCenter = offCenter;
  }
}
el.locateBtn.addEventListener('animationend', () => el.locateBtn.classList.remove('pulse-once'));
updateLocateBtnState(); // paints the default (following) icon on load

/** Starts the idle "where am I" GPS share backing state.myLocationMarker.
 * `silent` (used for auto-start on app open) skips enableDeviceOrientation
 * (gesture-gated on iOS) and all showStatus calls, so an unprompted
 * permission ask doesn't also nag with an error banner if declined. */
async function startIdleLocationShare({ silent = false } = {}) {
  if (state.idleLocationWatchId != null) return;
  if (!('geolocation' in navigator)) {
    resolverDebugLog(`startIdleLocationShare(silent=${silent}): no geolocation support in this browser/WebView.`, 'error');
    if (!silent) showStatus('This browser does not support GPS location.', 'error');
    return;
  }
  resolverDebugLog(`startIdleLocationShare(silent=${silent}) called — this is the ${silent ? 'automatic on-open' : 'locate-button'} share, separate from real navigation's own GPS watch.`);
  if (!silent) await enableDeviceOrientation(); // gesture-gated on this same tap
  // Uses plain navigator.geolocation (unlike real navigation's startLocationWatch),
  // but still needs the "turn on Location?" nudge if the OS service is off.
  if (isNativePlatform()) await ensureLocationEnabled();
  if (!silent) showStatus('Finding your location…', 'info');
  let flownToOnce = false;
  state.idleLocationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lngLat = [pos.coords.longitude, pos.coords.latitude];
      if (!flownToOnce) {
        flownToOnce = true;
        resolverDebugLog(`startIdleLocationShare(silent=${silent}): first GPS fix received, flying map there.`, 'success');
        map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 14), duration: 800 });
        if (!silent) clearStatus();
        el.locateBtn.classList.add('active');
      }
      // GPS course-over-ground while moving, device compass while stationary — same order as onPositionUpdate.
      const headingDeg = typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : compassHeadingDeg;
      updateMyLocationMarker(lngLat, headingDeg);
    },
    (err) => {
      // Reset so a retry tap doesn't hit stopIdleLocationShare's "already sharing" no-op.
      resolverDebugLog(`startIdleLocationShare(silent=${silent}): watchPosition error "${err.message}" (code ${err.code}) — ${silent ? 'staying quiet, this was an unprompted attempt' : 'showing an error banner'}.`, 'error');
      navigator.geolocation.clearWatch(state.idleLocationWatchId);
      state.idleLocationWatchId = null;
      el.locateBtn.classList.remove('active');
      disableDeviceOrientation();
      // POSITION_UNAVAILABLE (2) means the device's Location service is off, distinct from PERMISSION_DENIED (1).
      if (!silent) {
        showStatus(
          err.code === err.POSITION_UNAVAILABLE
            ? 'Could not get your location. Check that Location is turned on for this device.'
            : 'Could not get your location. Check location permissions.',
          'error',
        );
      }
    },
    CONFIG.GEOLOCATION_OPTIONS,
  );
}

/** Stops the idle share — only called automatically when navigation starts (see startNavigation). */
function stopIdleLocationShare() {
  if (state.idleLocationWatchId == null) return;
  navigator.geolocation.clearWatch(state.idleLocationWatchId);
  state.idleLocationWatchId = null;
  if (state.myLocationMarker) { state.myLocationMarker.remove(); state.myLocationMarker = null; }
  el.locateBtn.classList.remove('active');
  disableDeviceOrientation();
}

el.locateBtn.addEventListener('click', async () => {
  if (state.navigating || state.transitTracking) {
    state.followMode = true;
    updateLocateBtnState();
    if (state.lastFix) followCamera([state.lastFix.lng, state.lastFix.lat], state.lastHeading);
    return;
  }
  // Already sharing — re-center rather than stopping, matching Google/Apple Maps' locate button behavior.
  if (state.idleLocationWatchId != null) {
    if (state.myLocationMarker) {
      map.flyTo({ center: state.myLocationMarker.getLngLat(), zoom: Math.max(map.getZoom(), 14), duration: 500 });
    }
    return;
  }
  await startIdleLocationShare();
});

// ============================================================================
// Mapillary street-level imagery peek
//
// Entirely config-gated: with no MAPILLARY_ACCESS_TOKEN set, none of this
// runs at all (every app must register its own token).
// ============================================================================
const MAPILLARY_ENABLED = !!CONFIG.MAPILLARY_ACCESS_TOKEN;
let mapillaryLayerVisible = false;
const mapillarySequence = { ids: [], index: -1 };
// Guards against a rapid open of two different street-view buttons racing —
// a slower first response arriving after a second one would otherwise clobber the viewer.
let mapillaryOpenSeq = 0;

if (MAPILLARY_ENABLED) {
  mapLoad.then(() => {
    // Mapillary's public vector tiles: "image" points appear from zoom 14 up. Schema per Mapillary's v4 tileset.
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
    await awaitMapLoad();
    map.setLayoutProperty('mapillary-coverage-layer', 'visibility', mapillaryLayerVisible ? 'visible' : 'none');
    if (mapillaryLayerVisible && map.getZoom() < CONFIG.MAPILLARY_COVERAGE_MIN_ZOOM) {
      showStatus('Zoom in to see where street-level imagery is available.', 'info');
    }
  });

  // Tile feature already has the image id, so skip straight to fetching it.
  map.on('click', 'mapillary-coverage-layer', (e) => {
    if (!e.features.length) return;
    openMapillaryViewerById(e.features[0].properties.id);
  });
  map.on('mouseenter', 'mapillary-coverage-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'mapillary-coverage-layer', () => { map.getCanvas().style.cursor = ''; });
}

async function fetchMapillaryImage(imageId) {
  const url = `https://graph.mapillary.com/${imageId}?access_token=${CONFIG.MAPILLARY_ACCESS_TOKEN}&fields=id,thumb_1024_url,sequence`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    resolverDebugLog(`Mapillary: request failed for image ${imageId} — ${err.message}`, 'error');
    throw err;
  }
  if (!res.ok) {
    resolverDebugLog(`Mapillary: returned HTTP ${res.status} for image ${imageId}.`, 'error');
    throw new Error(`Mapillary returned an error (HTTP ${res.status}).`);
  }
  return res.json();
}

/** Searches within MAPILLARY_SEARCH_RADIUS_M since the picked point likely isn't exactly on a coverage dot. */
async function findNearestMapillaryImage(lat, lon) {
  const url = `https://graph.mapillary.com/images?access_token=${CONFIG.MAPILLARY_ACCESS_TOKEN}`
    + `&fields=id,thumb_1024_url,sequence&closeto=${lon},${lat}&radius=${CONFIG.MAPILLARY_SEARCH_RADIUS_M}&limit=1`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    resolverDebugLog(`Mapillary: nearest-image search failed for ${lat},${lon} — ${err.message}`, 'error');
    throw err;
  }
  if (!res.ok) {
    resolverDebugLog(`Mapillary: nearest-image search returned HTTP ${res.status}.`, 'error');
    throw new Error(`Mapillary returned an error (HTTP ${res.status}).`);
  }
  const data = await res.json();
  if (!data.data || !data.data.length) resolverDebugLog(`Mapillary: no coverage within ${CONFIG.MAPILLARY_SEARCH_RADIUS_M}m of ${lat},${lon}.`, 'warn');
  return (data.data && data.data[0]) || null;
}

async function fetchMapillarySequenceIds(sequenceId) {
  const url = `https://graph.mapillary.com/image_ids?access_token=${CONFIG.MAPILLARY_ACCESS_TOKEN}&sequence_id=${sequenceId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      resolverDebugLog(`Mapillary: sequence lookup returned HTTP ${res.status} — prev/next won't be offered.`, 'warn');
      return []; // non-fatal: viewer just won't offer prev/next
    }
    const data = await res.json();
    return (data.data || []).map((d) => d.id);
  } catch (err) {
    resolverDebugLog(`Mapillary: sequence lookup failed — ${err.message}`, 'warn');
    return [];
  }
}

function hideMapillaryViewer() {
  el.mapillaryViewer.classList.add('hidden');
}

function showMapillaryViewer({ loading, empty, error } = {}) {
  // The one true "opens the viewer" entry point, so it's the right place to register the back layer.
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
  const mySeq = ++mapillaryOpenSeq;
  showMapillaryViewer({ loading: true });
  try {
    const img = await fetchMapillaryImage(imageId);
    if (mySeq !== mapillaryOpenSeq) return; // a newer open request has since started — don't clobber it
    await loadMapillaryImage(img);
  } catch (err) {
    if (mySeq !== mapillaryOpenSeq) return;
    showMapillaryViewer({ error: err.message });
  }
}

async function openMapillaryViewerNear(lat, lon) {
  const mySeq = ++mapillaryOpenSeq;
  showMapillaryViewer({ loading: true });
  try {
    const img = await findNearestMapillaryImage(lat, lon);
    if (mySeq !== mapillaryOpenSeq) return; // a newer open request has since started — don't clobber it
    if (!img) { showMapillaryViewer({ empty: true }); return; }
    await loadMapillaryImage(img);
  } catch (err) {
    if (mySeq !== mapillaryOpenSeq) return;
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

/** Camera-icon button opening the street-view viewer for a point. Returns null when Mapillary isn't configured. */
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
// Offline map tiles for a chosen region
//
// Download writes directly to CONFIG.TILE_CACHE_NAME via the Cache API (no
// service worker involved). sw.js then intercepts future tile requests and
// serves from that same cache first.
// ============================================================================

/** Reads the MapLibre style JSON to find the vector tile URL template. Handles
 * both inline `tiles` and a separate TileJSON `url` that must be fetched too. */
async function getTileUrlTemplate() {
  let res;
  try {
    res = await fetch(CONFIG.MAP_STYLE_URL);
  } catch (err) {
    resolverDebugLog(`Offline download: could not reach the map style — ${err.message}`, 'error');
    throw new Error('Could not read the map style to find its tile URLs.');
  }
  if (!res.ok) {
    resolverDebugLog(`Offline download: map style fetch returned HTTP ${res.status}.`, 'error');
    throw new Error('Could not read the map style to find its tile URLs.');
  }
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

/** Fetches every tile with limited concurrency, retrying a few times each so
 * one bad tile never aborts the batch. Returns even if cancelled mid-way. */
async function runTileDownload(template, tiles, onProgress) {
  const cache = await caches.open(CONFIG.TILE_CACHE_NAME);
  const control = { cancelled: false };
  activeDownloadControl = control;
  let done = 0;
  let failed = 0;
  let cursor = 0;
  // One log at start and end, not per-tile — would flood the debug ring buffer.
  resolverDebugLog(`Offline download: starting ${tiles.length} tile(s).`);

  async function worker() {
    while (cursor < tiles.length && !control.cancelled) {
      const tile = tiles[cursor++];
      const url = tileUrl(template, tile);
      let ok = false;
      for (let attempt = 0; attempt <= CONFIG.OFFLINE_TILE_MAX_RETRIES && !ok; attempt++) {
        try {
          // fetchWithTimeout, not a bare fetch — a stalled tile (flaky network,
          // captive portal) would otherwise hang this worker's loop forever.
          const res = await fetchWithTimeout(url);
          if (res.ok) { await cache.put(url, res); ok = true; }
        } catch (err) {
          // Network hiccup or timeout — loop retries, or falls through to "failed" below.
        }
      }
      if (ok) done++; else failed++;
      onProgress({ done: done + failed, total: tiles.length, failed });
    }
  }

  await Promise.all(Array.from({ length: CONFIG.OFFLINE_TILE_CONCURRENCY }, worker));
  resolverDebugLog(
    `Offline download: ${control.cancelled ? 'cancelled' : 'finished'} — ${done}/${tiles.length} succeeded, ${failed} failed.`,
    control.cancelled ? 'warn' : (failed ? 'warn' : 'success'),
  );
  return { total: tiles.length, failed, cancelled: control.cancelled };
}

async function deleteDownloadedAreaTiles(area) {
  const cache = await caches.open(CONFIG.TILE_CACHE_NAME);
  const tiles = tilesForBounds(area.bounds, area.minZoom, area.maxZoom);
  // NOTE: no reference counting across areas — overlapping tiles get deleted too and re-fetched later.
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

// Session-only cache keyed by normalized query text: re-searching something
// already looked up this session returns instantly with no network call,
// no rate-limit wait, and works even with no connection at all.
const nominatimCache = new Map();

function countryCodesParam() {
  return CONFIG.GEOCODE_COUNTRY_CODES ? `&countrycodes=${CONFIG.GEOCODE_COUNTRY_CODES}` : '';
}

/** Raw Nominatim /search call shared by every geocoding path, so fetch/error handling lives in one place. */
async function nominatimSearch(qParam, extraParams = '') {
  await nominatimLimiter();
  const url = `${CONFIG.NOMINATIM_URL}/search?format=jsonv2&limit=10&q=${encodeURIComponent(qParam)}${countryCodesParam()}${extraParams}`;
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    // Failures only — logging every autocomplete keystroke would flood the debug ring buffer.
    resolverDebugLog(`Nominatim: request failed for "${qParam}" — ${err.message}`, 'error');
    throw new Error(err.name === 'AbortError'
      ? 'The geocoding service is taking too long to respond. Try again in a moment.'
      : 'Could not reach the geocoding service. Check your connection or the Nominatim server address.');
  }
  if (!res.ok) {
    resolverDebugLog(`Nominatim: returned HTTP ${res.status} for "${qParam}".`, 'error');
    throw new Error(`The geocoding service returned an error (HTTP ${res.status}).`);
  }
  const data = await res.json();
  return data.map((r) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    // Only present with &extratags=1 and if the OSM feature has this tag — often null.
    openingHours: (r.extratags && r.extratags.opening_hours) || null,
  }));
}

/** [lon, lat] of the user's current live position, or null if unavailable. Used to bias search results (geocodeSearch). */
function currentLiveLngLat() {
  if (state.navigating && state.lastFix) return [state.lastFix.lng, state.lastFix.lat];
  if (state.myLocationMarker) {
    const ll = state.myLocationMarker.getLngLat();
    return [ll.lng, ll.lat];
  }
  return null;
}

/** Adds `.distanceM` (straight-line) from `lat,lon` to every result and sorts nearest-first. */
function decorateWithDistance(results, lat, lon) {
  return results
    .map((r) => ({ ...r, distanceM: turf.distance([lon, lat], [r.lon, r.lat], { units: 'meters' }) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** Like decorateWithDistance but snaps onto the route line so `.distanceM`
 * is distance along the route, not a misleading straight line. Drops results too far off the route. */
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

const OSM_DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index matches Date#getDay()

function dayCodeMatches(daySpec, dayIndex) {
  return daySpec.split(',').some((part) => {
    const range = part.split('-');
    const startIdx = OSM_DAY_CODES.indexOf(range[0]);
    if (startIdx === -1) return false;
    if (range.length === 1) return startIdx === dayIndex;
    const endIdx = OSM_DAY_CODES.indexOf(range[1]);
    if (endIdx === -1) return false;
    return startIdx <= endIdx
      ? dayIndex >= startIdx && dayIndex <= endIdx
      : dayIndex >= startIdx || dayIndex <= endIdx; // wraps the week, e.g. "Fr-Mo"
  });
}

/** Best-effort "is this place open now" from an OSM opening_hours string, for
 * the "Open now" filter. Covers common syntax (day/time ranges, overnight
 * spans, 24/7, off/closed) but bails to null on anything more exotic
 * (holidays, month ranges, sunrise/sunset) rather than risk a wrong answer.
 * Callers (applyOpenNowFilter) treat null as unknown, never as closed. */
function isPlaceOpenNow(openingHours, now = new Date()) {
  if (!openingHours) return null;
  const value = openingHours.trim();
  if (!value) return null;
  if (/^24\/7$/i.test(value)) return true;
  // PH/SH (public/school holiday) rules, quoted comments, month/week
  // qualifiers, and sunrise/sunset keywords all change the meaning in ways
  // a plain day+time parse would get wrong — bail out entirely rather than
  // guess.
  if (/"|PH|SH|week|sunrise|sunset|easter|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(value)) return null;

  const nowDay = now.getDay();
  const yesterday = (nowDay + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let matchedToday = false;
  let open = false;

  for (const rawGroup of value.split(';')) {
    const group = rawGroup.trim();
    if (!group) continue;
    const parts = group.split(/\s+/);
    const looksLikeDaySpec = /^[A-Za-z]{2}(-[A-Za-z]{2})?(,[A-Za-z]{2}(-[A-Za-z]{2})?)*$/.test(parts[0]);
    const daySpec = looksLikeDaySpec ? parts[0] : null;
    const timeParts = daySpec ? parts.slice(1) : parts;
    // No day-spec at all means the rule applies every day (e.g. a plain
    // "09:00-18:00" tag).
    const appliesToday = daySpec ? dayCodeMatches(daySpec, nowDay) : true;
    const appliedYesterday = daySpec ? dayCodeMatches(daySpec, yesterday) : true;
    if (!appliesToday && !appliedYesterday) continue;

    const timeSpec = timeParts.join(' ');
    if (/^(off|closed)$/i.test(timeSpec)) {
      if (appliesToday) matchedToday = true;
      continue;
    }

    for (const range of timeSpec.split(',')) {
      const m = range.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if (!m) return null; // unrecognized time format — don't guess
      const startMin = Number(m[1]) * 60 + Number(m[2]);
      let endMin = Number(m[3]) * 60 + Number(m[4]);
      if (endMin <= startMin) endMin += 24 * 60; // overnight, e.g. 22:00-02:00
      if (appliesToday) {
        matchedToday = true;
        if (nowMinutes >= startMin && nowMinutes < endMin) open = true;
      }
      // Yesterday's overnight range can still cover right now, e.g. now is 01:00 Sat, rule is "Fr 22:00-02:00".
      if (appliedYesterday && endMin > 24 * 60) {
        if (nowMinutes + 24 * 60 >= startMin && nowMinutes + 24 * 60 < endMin) open = true;
      }
    }
  }

  if (open) return true;
  return matchedToday ? false : null;
}

/** Drops results confidently known to be closed right now, when the
 * "Open now" filter chip is on — keeps anything open AND anything whose
 * hours this couldn't determine (see isPlaceOpenNow), so a sparse or
 * unparseable opening_hours tag never wrongly hides a real result. */
function applyOpenNowFilter(results) {
  if (!state.filterOpenNow) return results;
  return results.filter((r) => isPlaceOpenNow(r.openingHours) !== false);
}

/** `&bounded=1&viewbox=...` — confirmed by direct testing that `bounded=1`
 * is what actually makes Nominatim honour the box as a hard filter; the
 * viewbox alone is just a soft ranking hint and gets routinely ignored
 * (e.g. a fuel-station search near Mumbai returned stations in Germany
 * without it). `radiusDeg` of 0.03 is roughly 3km at Indian latitudes. */
function viewboxParam(lat, lon, radiusDeg) {
  return `&bounded=1&viewbox=${lon - radiusDeg},${lat - radiusDeg},${lon + radiusDeg},${lat + radiusDeg}`;
}

// Session-only cache keyed by (tag, rounded lat/lon), rounded to ~110m — small relative to the ~3km search radius.
const categorySearchCache = new Map();
function categorySearchCacheKey(tag, lat, lon) {
  return `${tag}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
}

/** Nominatim's per-tag search often returns the same amenity twice — once as
 * an OSM way (building/canopy footprint) and once as a node (the actual
 * point), tens of meters apart with an identical name. Collapses any two
 * results with the same primary name within DUPLICATE_DISTANCE_M down to the first one seen. */
const DUPLICATE_DISTANCE_M = 120;
function dedupeSameNamedNearbyResults(results) {
  const kept = [];
  for (const r of results) {
    const name = splitPlaceLabel(r.label).primary.toLowerCase();
    const isDuplicate = kept.some((k) => (
      splitPlaceLabel(k.label).primary.toLowerCase() === name
      && turf.distance([k.lon, k.lat], [r.lon, r.lat], { units: 'meters' }) < DUPLICATE_DISTANCE_M
    ));
    if (!isDuplicate) kept.push(r);
  }
  return kept;
}

// ============================================================================
// EV charging details: Open Charge Map (see CONFIG.OPENCHARGEMAP_ENABLED).
// Only called when a key is configured — see categorySearchNear below.
// ============================================================================
const EV_CHARGING_TAG = 'amenity=charging_station'; // matches CHIP_CATEGORY_TAGS.ev / POI_CATEGORY_TAGS, kept as a literal deliberately
const openChargeMapLimiter = createLimiter(CONFIG.OPENCHARGEMAP_MIN_INTERVAL_MS);

// Open Charge Map's StatusType.Title strings mapped to CSS-safe keys. Never invents a status — see normalizeChargingStation.
const OCM_STATUS_KEY_BY_TITLE = {
  Operational: 'operational',
  'Partly Operational': 'operational',
  'Not Operational': 'not-operational',
  'Temporarily Unavailable': 'not-operational',
};

/** "4 months ago" / "3 days ago" / "today" for Open Charge Map's DateLastStatusUpdate.
 * Returns null for a missing/unparseable date rather than showing a wrong one. */
function formatRelativeAge(isoDate) {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/** Normalizes one Open Charge Map POI into this app's {label, lat, lon} shape plus an `evDetails` object (showPlaceCard). */
function normalizeChargingStation(poi) {
  const addr = poi.AddressInfo || {};
  const connections = (poi.Connections || []).map((c) => ({
    type: (c.ConnectionType && c.ConnectionType.Title) || 'Unknown connector',
    powerKW: c.PowerKW || null,
    quantity: c.Quantity || 1,
    currentType: (c.CurrentType && c.CurrentType.Title) || null,
  }));
  const statusTitle = (poi.StatusType && poi.StatusType.Title) || null;
  const addressParts = [addr.AddressLine1, addr.Town, addr.StateOrProvince, addr.Postcode].filter(Boolean);
  return {
    label: addr.Title || 'Charging station',
    lat: addr.Latitude,
    lon: addr.Longitude,
    evDetails: {
      connections,
      operatorName: (poi.OperatorInfo && poi.OperatorInfo.Title) || null,
      operatorPhone: (poi.OperatorInfo && poi.OperatorInfo.PhonePrimaryContact) || null,
      operatorWebsite: (poi.OperatorInfo && poi.OperatorInfo.WebsiteURL) || null,
      usageType: (poi.UsageType && poi.UsageType.Title) || null,
      usageCost: poi.UsageCost || null,
      numberOfPoints: poi.NumberOfPoints || null,
      statusLabel: statusTitle,
      statusKey: statusTitle ? (OCM_STATUS_KEY_BY_TITLE[statusTitle] || 'unknown') : 'unknown',
      statusAge: formatRelativeAge(poi.DateLastStatusUpdate),
      comments: poi.GeneralComments || null,
      address: addressParts.length ? addressParts.join(', ') : null,
      accessComments: addr.AccessComments || null,
    },
  };
}

/** Open Charge Map-backed EV search, via this deployment's own /api/opencharge-poi
 * (the real API key is a Cloudflare secret, never sent to the client).
 * Returns null (not an error) when OPENCHARGEMAP_ENABLED is set but the
 * server-side API key isn't configured yet — categorySearchNear falls back to OSM search for that case. */
async function fetchNearbyChargingStations(lat, lon) {
  await openChargeMapLimiter();
  const base = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
  const url = `${base}/api/opencharge-poi?latitude=${lat}&longitude=${lon}`
    + `&distance=${CONFIG.OPENCHARGEMAP_SEARCH_RADIUS_KM}&maxresults=25`;
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'Open Charge Map is taking too long to respond. Try again in a moment.'
      : 'Could not reach Open Charge Map. Check your connection.');
  }
  if (res.status === 501) {
    // OPENCHARGEMAP_API_KEY not set server-side yet.
    resolverDebugLog('EV charging: Open Charge Map is enabled but /api/opencharge-poi returned 501 (OPENCHARGEMAP_API_KEY not set on this deployment) — falling back to OSM search.', 'warn');
    return null;
  }
  if (!res.ok) {
    resolverDebugLog(`EV charging: Open Charge Map returned an error (HTTP ${res.status}) via /api/opencharge-poi.`, 'error');
    throw new Error(`Open Charge Map returned an error (HTTP ${res.status}).`);
  }
  const data = await res.json();
  const results = data
    .map(normalizeChargingStation)
    .filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number');
  resolverDebugLog(`EV charging: using Open Charge Map — found ${results.length} station(s) within ${CONFIG.OPENCHARGEMAP_SEARCH_RADIUS_KM}km.`, 'success');
  return results;
}

// Maps our OSM category tags to a plain-text TomTom Category Search term (TomTom takes free-text, not a numeric ID).
const TOMTOM_CATEGORY_TERM = {
  'amenity=fuel': 'petrol station',
  'amenity=charging_station': 'ev charging station',
  'amenity=pharmacy': 'pharmacy',
  'amenity=atm': 'atm',
  'amenity=hospital': 'hospital',
  'amenity=restaurant': 'restaurant',
  'amenity=parking': 'parking',
  'tourism=hotel': 'hotel',
};

/** Fallback for when Nominatim's OSM-tag search comes back empty at both
 * radii (real for categories with sparse OSM coverage in India). Only
 * called with tomtomFeaturesEnabled true; calls this app's own /api/places
 * route so the real API key never reaches the client. Degrades quietly on any failure. */
async function tomtomCategorySearchNear(tag, lat, lon) {
  const term = TOMTOM_CATEGORY_TERM[tag];
  if (!term || !tomtomFeaturesEnabled) return [];
  try {
    const base = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
    const url = `${base}/api/places?term=${encodeURIComponent(term)}&lat=${lat}&lon=${lon}&radius=${CONFIG.TOMTOM_PLACES_FALLBACK_RADIUS_M}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      resolverDebugLog(`TomTom places: /api/places returned HTTP ${res.status} for "${term}".`, 'error');
      return [];
    }
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    resolverDebugLog(`TomTom places: ${results.length} result(s) for "${term}".`, results.length ? 'success' : 'warn');
    return results
      .filter((r) => r.position && typeof r.position.lat === 'number' && typeof r.position.lon === 'number')
      .map((r) => {
        const name = r.poi && r.poi.name;
        const address = r.address && r.address.freeformAddress;
        return {
          label: name && address ? `${name}, ${address}` : (name || address || term),
          lat: r.position.lat,
          lon: r.position.lon,
        };
      });
  } catch (err) {
    resolverDebugLog(`TomTom places: request failed for "${term}" — ${err.message}`, 'error');
    return []; // network error, timeout, or malformed JSON — all treated the same
  }
}

/** Nominatim's bracket syntax (`q=[amenity=fuel]`) searches by OSM tag, not
 * name. Tries the default radius first, then a wider one (sparse OSM
 * coverage in India), then TomTom as a last resort (tomtomCategorySearchNear). */
async function categorySearchNear(tag, lat, lon) {
  const cacheKey = categorySearchCacheKey(tag, lat, lon);
  if (categorySearchCache.has(cacheKey)) return categorySearchCache.get(cacheKey);
  // Open Charge Map, when enabled, replaces the OSM path for EV charging.
  // Not enabled, or key not configured yet, falls through to plain OSM search.
  if (tag === EV_CHARGING_TAG) {
    if (CONFIG.OPENCHARGEMAP_ENABLED) {
      const results = await fetchNearbyChargingStations(lat, lon);
      if (results) {
        categorySearchCache.set(cacheKey, results);
        return results;
      }
      // results === null: fetchNearbyChargingStations already logged why — fall through to OSM below.
    } else {
      resolverDebugLog('EV charging: Open Charge Map is disabled (OPENCHARGEMAP_ENABLED is false in config.js) — using OSM search.', 'warn');
    }
  }
  for (const radiusDeg of [CONFIG.GEOCODE_NEAR_RADIUS_DEG_DEFAULT, CONFIG.GEOCODE_NEAR_RADIUS_DEG_WIDE]) {
    const rawResults = await nominatimSearch(`[${tag}]`, viewboxParam(lat, lon, radiusDeg) + '&extratags=1');
    if (rawResults.length) {
      const results = dedupeSameNamedNearbyResults(rawResults);
      categorySearchCache.set(cacheKey, results);
      return results;
    }
  }
  const tomtomResults = await tomtomCategorySearchNear(tag, lat, lon);
  categorySearchCache.set(cacheKey, tomtomResults);
  return tomtomResults;
}

// ============================================================================
// Voice mode toggle — cycles state.voiceMode through 'all' -> 'off' -> 'all'.
// speak() (in the live-tracking section) is what actually reads this; this
// block is just the button and its icon/label. Not persisted across reload.
// ============================================================================
const VOICE_MODE_ORDER = ['all', 'off'];
const VOICE_MODE_LABEL = { all: 'Voice guidance: on', off: 'Voice guidance: off' };
function voiceModeIcon(mode) {
  const speaker = '<path d="M4 9 v6 h4 l5 4 V5 l-5 4 Z"/>';
  if (mode === 'off') return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${speaker}<path d="M15 9 L20 15 M20 9 L15 15"/></svg>`;
  return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${speaker}<path d="M16.5 9 a5 5 0 0 1 0 8"/><path d="M19 7 a8.5 8.5 0 0 1 0 12"/></svg>`;
}
function renderVoiceModeBtn() {
  el.voiceModeBtn.innerHTML = voiceModeIcon(state.voiceMode);
  el.voiceModeBtn.setAttribute('aria-label', VOICE_MODE_LABEL[state.voiceMode]);
}

/** What to say the moment voice guidance is switched back on mid-trip, so
 * there's no silent wait for the next far/near cue's own schedule.
 * Deliberately not routed through state.spokenFar/spokenNear, so the normal
 * timed cues for this maneuver still fire later. Null when there's nothing to confirm. */
function describeCurrentManeuverForUnmuteConfirmation() {
  if (!state.navigating || !state.route || state.traveledM == null) return null;
  const maneuvers = state.route.maneuvers;
  const nextIdx = state.currentManeuverIdx + 1 < maneuvers.length ? state.currentManeuverIdx + 1 : null;
  if (nextIdx == null) return null;
  const distToNextM = Math.max(0, maneuvers[nextIdx].startDistM - state.traveledM);
  const instruction = maneuvers[nextIdx].instruction;
  // formatDistanceForSpeech floors to the nearest 10m, so anything closer would read as "In 0 meters".
  return distToNextM < 10 ? instruction : `In ${formatDistanceForSpeech(distToNextM)}, ${instruction}`;
}

// Guards the unmute confirmation against a quick mute/unmute flick sounding like two back-to-back prompts.
let lastVoiceModeToggleAt = 0;

el.voiceModeBtn.addEventListener('click', () => {
  const nextIdx = (VOICE_MODE_ORDER.indexOf(state.voiceMode) + 1) % VOICE_MODE_ORDER.length;
  const previousMode = state.voiceMode;
  state.voiceMode = VOICE_MODE_ORDER[nextIdx];
  renderVoiceModeBtn();
  // speechSynthesis.cancel() only silences the web path; native needs its own explicit stop().
  if (isNativePlatform()) {
    stopNative().catch((err) => resolverDebugLog(`Voice mode toggle: stopNative() threw "${err.message}"`, 'error'));
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  showStatus(VOICE_MODE_LABEL[state.voiceMode], 'info');

  const now = Date.now();
  const isQuickFlick = now - lastVoiceModeToggleAt < CONFIG.VOICE_MODE_TOGGLE_DEBOUNCE_MS;
  lastVoiceModeToggleAt = now;
  if (state.voiceMode === 'all' && previousMode === 'off' && !isQuickFlick) {
    const confirmation = describeCurrentManeuverForUnmuteConfirmation();
    if (confirmation) speak(confirmation);
  }
});
renderVoiceModeBtn();

/** Reveals the map-style popover above #map-layer-btn using a live bounding-rect offset, not a hardcoded position. */
function openMapStylePopover() {
  const btnRect = el.mapLayerBtn.getBoundingClientRect();
  el.mapStylePopover.style.bottom = `${window.innerHeight - btnRect.top + 10}px`;
  el.mapStylePopover.classList.remove('hidden');
  el.mapLayerBtn.classList.add('active');
  el.mapLayerBtn.setAttribute('aria-expanded', 'true');
  pushBackLayer(closeMapStylePopover);
  document.addEventListener('pointerdown', onOutsideMapStylePointerDown, { capture: true });
}

function closeMapStylePopover() {
  el.mapStylePopover.classList.add('hidden');
  el.mapLayerBtn.classList.remove('active');
  el.mapLayerBtn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onOutsideMapStylePointerDown, { capture: true });
}

function onOutsideMapStylePointerDown(e) {
  if (el.mapStylePopover.contains(e.target) || el.mapLayerBtn.contains(e.target)) return;
  goBackInApp();
}

el.mapLayerBtn.addEventListener('click', () => {
  if (el.mapStylePopover.classList.contains('hidden')) openMapStylePopover();
  else goBackInApp();
});

el.mapStylePopover.querySelectorAll('.map-style-opt').forEach((opt) => {
  opt.addEventListener('click', () => {
    setMapViewMode(opt.dataset.style);
    forgetBackLayerIfTop(closeMapStylePopover);
    closeMapStylePopover();
  });
});

// ============================================================================
// Weather badge — conditions at a selected place or the live GPS position
// while navigating. Backed by Open-Meteo: free, keyless, no config needed;
// CONFIG.WEATHER_ENABLED is a one-line opt-out for privacy-conscious users.
// ============================================================================
// Codes 0/1 (clear sky) are the only ones that read as visibly wrong at night (a sun icon while driving in the dark).
const WEATHER_EMOJI_BY_CODE = {
  0: '☀️', 1: '☀️',
  2: '☁️', 3: '☁️', 45: '☁️', 48: '☁️',
  51: '🌧️', 53: '🌧️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
  80: '🌧️', 81: '🌧️', 82: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️', 85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};
const CLEAR_SKY_CODES = new Set([0, 1]);
/** `isDay` is Open-Meteo's own `current.is_day` (1/0), computed server-side from real sunrise/sunset. */
function weatherEmojiForCode(code, isDay) {
  if (CLEAR_SKY_CODES.has(code) && !isDay) return '🌙';
  return WEATHER_EMOJI_BY_CODE[code] || '☁️'; // unrecognized code — safe default
}

// Cache key rounds lat/lon to ~5km and time to a 10-min bucket, so frequent GPS fixes mostly hit cache instead of the API.
const weatherCache = new Map();
function weatherCacheKey(lat, lon) {
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const rLat = (Math.round(lat / 0.05) * 0.05).toFixed(2);
  const rLon = (Math.round(lon / 0.05) * 0.05).toFixed(2);
  return `${rLat}|${rLon}|${bucket}`;
}

/** Returns null on any failure so the badge just stays hidden. `force` skips the cache read (used by tap-to-refresh). */
async function fetchWeather(lat, lon, force = false) {
  const cacheKey = weatherCacheKey(lat, lon);
  if (!force && weatherCache.has(cacheKey)) return weatherCache.get(cacheKey);
  try {
    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`);
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    const result = {
      tempC: Math.round(data.current.temperature_2m),
      emoji: weatherEmojiForCode(data.current.weather_code, data.current.is_day),
    };
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    resolverDebugLog(`Weather: request failed for ${lat.toFixed(2)},${lon.toFixed(2)} — ${err.message}`, 'error');
    return null;
  }
}

// Prevents an older, slow-to-resolve call from clobbering the badge after a newer one already applied.
let weatherRequestToken = 0;

/** Refreshes the weather badge: live GPS position while navigating, else the open place card, else hidden. Fire-and-forget. */
async function refreshWeatherBadge(force = false) {
  const myToken = ++weatherRequestToken;
  if (!CONFIG.WEATHER_ENABLED) {
    el.weatherBadge.classList.add('hidden');
    return;
  }
  let lat, lon;
  if (state.navigating && state.lastFix) {
    lat = state.lastFix.lat;
    lon = state.lastFix.lng;
  } else if (state.to && !el.placeCard.classList.contains('hidden')) {
    lat = state.to.lat;
    lon = state.to.lon;
  } else {
    el.weatherBadge.classList.add('hidden');
    return;
  }
  if (force) el.weatherBadge.classList.add('refreshing');
  const weather = await fetchWeather(lat, lon, force);
  if (myToken !== weatherRequestToken) return; // superseded by a newer call while this one was in flight
  el.weatherBadge.classList.remove('refreshing');
  if (!weather) {
    el.weatherBadge.classList.add('hidden');
    return;
  }
  el.weatherEmoji.textContent = weather.emoji;
  el.weatherTemp.textContent = `${weather.tempC}°`;
  el.weatherBadge.classList.remove('hidden');
}

// Force-bypasses the cache so a manual refresh always hits the network.
function handleWeatherBadgeRefresh() {
  if (el.weatherBadge.classList.contains('hidden')) return;
  refreshWeatherBadge(true);
}
el.weatherBadge.addEventListener('click', handleWeatherBadgeRefresh);
el.weatherBadge.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleWeatherBadgeRefresh(); }
});

// ============================================================================
// Live traffic — TomTom Flow Segment Data, drive-mode navigation only.
// Uses only Flow Segment Data (currentSpeed vs freeFlowSpeed), never TomTom's
// own routing or incidents API, to stay well under TomTom's free-tier caps.
// Disabled via CONFIG.TOMTOM_FEATURES_ENABLED / the Settings toggle. See config.js for tunables.
// ============================================================================

// Short-TTL cache keyed by a coarse lat/lon grid cell, so nearby repeat queries collapse into one call.
const trafficRatioCache = new Map(); // gridKey -> { ratio, expiresAt }
// Expired entries are pruned lazily on lookup; FIFO cap keeps this bounded.
const TRAFFIC_RATIO_CACHE_MAX_ENTRIES = 500;
function capTrafficRatioCache() {
  while (trafficRatioCache.size > TRAFFIC_RATIO_CACHE_MAX_ENTRIES) {
    trafficRatioCache.delete(trafficRatioCache.keys().next().value);
  }
}
function trafficCacheKey(lat, lon) {
  const factor = 10 ** CONFIG.TRAFFIC_CACHE_GRID_DECIMALS;
  return `${Math.round(lat * factor)},${Math.round(lon * factor)}`;
}

/** One Flow Segment Data request for a point; returns currentSpeed/freeFlowSpeed ratio or null on failure/low confidence.
 * Fetch failures aren't cached (worth retrying); well-formed responses (including filtered nulls) are.
 * Calls our own /api/traffic proxy (functions/api/traffic.js) so the TomTom key stays server-side.
 * Ignores the response's own road-segment geometry — it can snap to a different road than our route; see sampleTrafficAhead. */
async function fetchTomTomFlowRatio(lat, lon) {
  const cacheKey = trafficCacheKey(lat, lon);
  const cached = trafficRatioCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.ratio;

  const cacheAndReturn = (ratio) => {
    trafficRatioCache.set(cacheKey, { ratio, expiresAt: Date.now() + CONFIG.TRAFFIC_CACHE_TTL_MS });
    capTrafficRatioCache();
    return ratio;
  };

  try {
    const base = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
    const url = `${base}/api/traffic?lat=${lat}&lon=${lon}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null; // covers 429 and any other non-200 — not cached, worth retrying
    const data = await res.json();
    const seg = data && data.flowSegmentData;
    const current = seg && seg.currentSpeed;
    const freeFlow = seg && seg.freeFlowSpeed;
    if (typeof current !== 'number' || typeof freeFlow !== 'number' || freeFlow <= 0) return cacheAndReturn(null);
    // Missing confidence defaults to trusted (1) rather than dropped.
    const confidence = typeof seg.confidence === 'number' ? seg.confidence : 1;
    if (confidence < CONFIG.TRAFFIC_MIN_CONFIDENCE) return cacheAndReturn(null);
    return cacheAndReturn(current / freeFlow);
  } catch (err) {
    return null; // network error, AbortError from fetchWithTimeout's own timeout, malformed JSON — not cached, worth retrying
  }
}

/** Samples n evenly-spaced points over `aheadM` metres of `lineFeature` from `startM`, returning a
 * distance-weighted average ratio (nearer samples count more). Shared by runTrafficCheckin and maybeRerouteForTraffic. */
async function sampleTrafficAhead(lineFeature, startM, aheadM, n) {
  if (aheadM <= 0) return { ratio: null, samples: [] };
  const points = [];
  for (let i = 0; i < n; i++) {
    // Midpoints of n equal segments, spread evenly across the window.
    const d = Math.min(aheadM * (i + 0.5) / n, aheadM);
    const [lon, lat] = turf.along(lineFeature, startM + d, { units: 'meters' }).geometry.coordinates;
    points.push({ lon, lat, d }); // d is relative to this window's start, not the full route
  }
  const ratios = await Promise.all(points.map((p) => fetchTomTomFlowRatio(p.lat, p.lon)));
  const valid = points
    .map((p, i) => ({ ...p, ratio: ratios[i] }))
    .filter((p) => typeof p.ratio === 'number' && Number.isFinite(p.ratio));
  if (!valid.length) return { ratio: null, samples: [] };
  const weightOf = (s) => 1 / (1 + s.d / 1000);
  const totalWeight = valid.reduce((sum, s) => sum + weightOf(s), 0);
  const ratio = valid.reduce((sum, s) => sum + s.ratio * weightOf(s), 0) / totalWeight;
  return { ratio, samples: valid };
}

/** Shows the "Heavy traffic ahead" indicator only when the ratio is a valid number under the heavy threshold. */
function refreshTrafficBadge() {
  const heavy = state.trafficRatio != null && state.trafficRatio < CONFIG.TRAFFIC_HEAVY_THRESHOLD;
  el.trafficBadge.classList.toggle('hidden', !heavy);
}

/** Resets check-in bookkeeping so a stale ratio/cadence from a previous route never leaks into the next one. */
function resetTrafficTracking() {
  state.lastTrafficCheckAt = null;
  state.lastTrafficCheckDistM = null;
  state.trafficCheckInFlight = false;
  state.trafficRatio = null;
  refreshTrafficBadge();
  // Guarded: called before awaitMapLoad() resolves on a cold page load, when map sources may not exist yet.
  const trafficSource = map.getSource('route-traffic');
  if (trafficSource) trafficSource.setData(emptyFeatureCollection());
}

/** Samples traffic ahead on the live route (lookahead window scaled to current speed via dynamicVoiceLeadM),
 * updates the traffic badge and route-traffic dashes, and kicks off maybeRerouteForTraffic if traffic is heavy. */
async function runTrafficCheckin(traveledM, remainingM) {
  state.trafficCheckInFlight = true;
  try {
    const aheadM = Math.min(
      dynamicVoiceLeadM(CONFIG.TRAFFIC_SAMPLE_AHEAD_TIME_S, CONFIG.TRAFFIC_SAMPLE_AHEAD_MIN_M, CONFIG.TRAFFIC_SAMPLE_AHEAD_MAX_M),
      remainingM,
    );
    if (aheadM <= 0) return;
    const sliceEndM = Math.min(traveledM + aheadM, state.route.totalDistM);
    const ahead = turf.lineSliceAlong(state.route.lineFeature, traveledM, sliceEndM, { units: 'meters' });
    const requestedPoints = Math.max(1, CONFIG.TRAFFIC_SAMPLE_POINTS);
    const { ratio, samples } = await sampleTrafficAhead(ahead, 0, aheadM, requestedPoints);
    resolverDebugLog(`Traffic check-in: ${samples.length}/${requestedPoints} sample(s) succeeded${ratio != null ? `, ratio=${ratio.toFixed(2)}` : ''}.`, ratio == null ? 'warn' : 'success');
    state.trafficRatio = ratio;
    refreshTrafficBadge();

    // Each dash is a slice of our own route line (not TomTom's segment geometry), so it lands exactly on the drawn route.
    const half = CONFIG.TRAFFIC_DASH_HALF_WIDTH_M;
    const lineFeatures = samples.map((s) => {
      const absoluteM = traveledM + s.d; // s.d is relative to this window's start, not the full route
      const from = Math.max(0, absoluteM - half);
      const to = Math.min(state.route.totalDistM, absoluteM + half);
      const dash = turf.lineSliceAlong(state.route.lineFeature, from, to, { units: 'meters' });
      // startM/endM let updateTraveledRouteSegment hide dashes fully behind the current position.
      return { type: 'Feature', properties: { ratio: s.ratio, startM: from, endM: to }, geometry: dash.geometry };
    });
    map.getSource('route-traffic').setData({ type: 'FeatureCollection', features: lineFeatures });

    if (ratio != null && ratio < CONFIG.TRAFFIC_HEAVY_THRESHOLD) {
      maybeRerouteForTraffic(traveledM);
    }
  } finally {
    state.trafficCheckInFlight = false;
  }
}

/** Called after a check-in confirms heavy traffic: compares alternates' near-term ratios against the current
 * route and switches only if genuinely better (Valhalla itself has no traffic awareness, so it can't just reroute).
 * Shares state.isRerouting with checkDeviation/triggerReroute so an off-route reroute always takes priority. */
async function maybeRerouteForTraffic(traveledM) {
  if (state.isRerouting || !state.navigating || state.travelMode !== 'drive' || !state.route) return;
  const now = Date.now();
  if (state.lastTrafficRerouteAt != null && now - state.lastTrafficRerouteAt < CONFIG.TRAFFIC_REROUTE_MIN_INTERVAL_MS) return;
  // Not reset by resetTrafficTracking, so this cooldown survives the reroute it causes.
  state.lastTrafficRerouteAt = now;
  if (!state.lastFix) return;
  const currentLngLat = [state.lastFix.lng, state.lastFix.lat];

  state.isRerouting = true;
  try {
    const from = { lat: currentLngLat[1], lon: currentLngLat[0] };
    if (typeof state.lastHeading === 'number' && !Number.isNaN(state.lastHeading)) {
      from.heading = Math.round(state.lastHeading);
      from.heading_tolerance = 45;
    }
    const remainingStops = state.route.stops.slice(state.currentLegIndex);
    const { alternates } = await requestRoute(from, state.to, remainingStops, 2, COSTING_BY_MODE[state.travelMode], { avoidTolls: state.avoidTolls, avoidHighways: state.avoidHighways });
    if (!alternates.length) {
      resolverDebugLog('Traffic reroute: Valhalla returned no meaningfully different alternates — staying on the current route.');
      return;
    }

    const compareAheadM = CONFIG.TRAFFIC_REROUTE_COMPARE_AHEAD_M;
    const comparePoints = Math.max(1, CONFIG.TRAFFIC_REROUTE_COMPARE_POINTS);
    // Clamp to what's left on each line before sampling, else turf.along would repeat-sample the endpoint.
    const currentAheadM = Math.min(compareAheadM, state.route.totalDistM - traveledM);
    const currentAhead = turf.lineSliceAlong(state.route.lineFeature, traveledM, traveledM + currentAheadM, { units: 'meters' });
    const [currentResult, ...alternateResults] = await Promise.all([
      sampleTrafficAhead(currentAhead, 0, currentAheadM, comparePoints),
      ...alternates.map((alt) => {
        const altTotalM = alt.summary && alt.summary.length ? alt.summary.length * 1000 : compareAheadM;
        const altLine = turf.lineString(decodeTripCoords(alt));
        return sampleTrafficAhead(altLine, 0, Math.min(compareAheadM, altTotalM), comparePoints);
      }),
    ]);

    if (currentResult.ratio == null) {
      resolverDebugLog('Traffic reroute: no usable flow data for the current route’s near-term stretch — skipping comparison.');
      return;
    }

    let best = null;
    alternateResults.forEach((result, i) => {
      if (result.ratio == null) return;
      if (!best || result.ratio > best.result.ratio) best = { trip: alternates[i], result };
    });

    if (!best || best.result.ratio - currentResult.ratio < CONFIG.TRAFFIC_REROUTE_MIN_IMPROVEMENT) {
      resolverDebugLog(`Traffic reroute: best alternate ratio ${best ? best.result.ratio.toFixed(2) : 'n/a'} vs. current ${currentResult.ratio.toFixed(2)} — not enough improvement to switch.`);
      return;
    }

    resolverDebugLog(`Traffic reroute: switching route — alternate ratio ${best.result.ratio.toFixed(2)} vs. current ${currentResult.ratio.toFixed(2)}.`, 'success');
    state.routeOptions = [best.trip];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    await renderRoute(best.trip, { fitView: false, stops: remainingStops }); // camera keeps following the puck, same as triggerReroute
    speak('Rerouting to avoid traffic ahead.');
    showStatus('Rerouting to avoid traffic ahead.', 'info');
  } catch (err) {
    resolverDebugLog(`Traffic reroute attempt failed: ${err.message}`, 'error');
  } finally {
    state.isRerouting = false;
  }
}

/** Gates and paces TomTom check-ins from onPositionUpdate: only while driving with the feature enabled,
 * respecting the min interval/distance since the last check and the stop-checking distance near the destination.
 * Fire-and-forget, like refreshWeatherBadge — must never hold up maneuver-advance/deviation checks. */
function maybeCheckTraffic(traveledM) {
  if (!state.navigating || state.travelMode !== 'drive' || !tomtomFeaturesEnabled || !state.route) return;
  if (state.trafficCheckInFlight) return; // previous check-in still in flight — skip this tick rather than pile up requests
  const remainingM = state.route.totalDistM - traveledM;
  if (remainingM < CONFIG.TRAFFIC_STOP_CHECKING_REMAINING_M) return;
  const now = Date.now();
  if (state.lastTrafficCheckAt != null) {
    const elapsedOk = now - state.lastTrafficCheckAt >= CONFIG.TRAFFIC_CHECK_MIN_INTERVAL_MS;
    const distOk = traveledM - state.lastTrafficCheckDistM >= CONFIG.TRAFFIC_CHECK_MIN_DISTANCE_M;
    if (!elapsedOk || !distOk) return; // both must be true — whichever condition is satisfied later gates the check-in
  }
  state.lastTrafficCheckAt = now;
  state.lastTrafficCheckDistM = traveledM;
  runTrafficCheckin(traveledM, remainingM);
}

/** More sample points for longer routes, but capped to stay fast against rate-limited Nominatim. */
function sampleCountForRoute(totalDistM) {
  if (totalDistM < 10000) return 2;
  if (totalDistM < 50000) return 4;
  return 6;
}

/** Evenly-spaced [lon,lat] points along the route geometry, always including the first and last point. */
function sampleRouteAnchors(coords, maxSamples) {
  if (coords.length <= maxSamples) return coords;
  const step = (coords.length - 1) / (maxSamples - 1);
  const samples = [];
  for (let i = 0; i < maxSamples; i++) samples.push(coords[Math.round(i * step)]);
  return samples;
}

/** "Restaurants along my route": runs categorySearchNear() at several points sampled along the route and
 * merges/dedupes results, since Nominatim's viewbox is one rectangle, not a corridor. One failed sample doesn't
 * abort the rest — only every sample failing surfaces as an error. `waypoints` are always searched individually
 * too, so a short/round trip doesn't leave stops between them unsearched. */
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

// Keyword → OSM tag mapping, broader than the 8 category chips, so typed "near X" queries can resolve to a tag search.
const CATEGORY_KEYWORDS = [
  { tag: 'amenity=fuel', keys: ['fuel', 'petrol', 'gas station', 'diesel'] },
  { tag: 'amenity=charging_station', keys: ['ev charging', 'ev station', 'charging station', 'electric vehicle', 'charging'] },
  { tag: 'amenity=pharmacy', keys: ['pharmacy', 'chemist', 'medical store', 'medicine shop'] },
  { tag: 'amenity=atm', keys: ['atm', 'cash machine', 'cash point'] },
  { tag: 'amenity=hospital', keys: ['hospital', 'clinic', 'emergency room'] },
  { tag: 'amenity=restaurant', keys: ['restaurant', 'food', 'dining', 'eatery'] },
  { tag: 'amenity=parking', keys: ['parking', 'car park'] },
  { tag: 'tourism=hotel', keys: ['hotel', 'lodging', 'accommodation'] },
// Word-boundary matching, not a raw substring check — a substring check would match "atm" inside unrelated words.
].map((entry) => ({
  ...entry,
  re: new RegExp(`\\b(?:${entry.keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`),
}));

function matchCategoryTag(subject) {
  const s = subject.toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.re.test(s)) return entry.tag;
  }
  return null;
}

// Matches "<subject> near/close to/around/in <place>". Whitespace boundaries keep "in" from matching inside words like "parking".
const NEAR_QUERY_PATTERN = /^(.+?)\s+(?:near|close to|around|in)\s+(.+)$/i;

// Matches "<origin> to <destination>" as a directions shortcut. Checked after NEAR_QUERY_PATTERN, since
// "close to" contains " to " and would otherwise wrongly split e.g. "petrol pump close to Marine Drive".
const TO_QUERY_PATTERN = /^(.+?)\s+to\s+(.+)$/i;

// On-screen trace of the resolver, for debugging on a phone with no devtools. Off by default
// (includes GPS coords/place names) — enable via Settings "Debug mode" or ?debug=resolver.
const RESOLVER_DEBUG_HISTORY_MAX = 1000;
const resolverDebugHistory = []; // { text, kind } entries, oldest first — see resolverDebugLog/setResolverDebugEnabled
const RESOLVER_DEBUG_STORAGE_KEY = 'resolverDebugEnabled';
const debugParam = new URLSearchParams(location.search).get('debug');
if (debugParam === 'resolver') localStorage.setItem(RESOLVER_DEBUG_STORAGE_KEY, '1');
else if (debugParam === 'off') localStorage.removeItem(RESOLVER_DEBUG_STORAGE_KEY);
let resolverDebugEnabled = localStorage.getItem(RESOLVER_DEBUG_STORAGE_KEY) === '1';

/** Single place that turns Debug mode on/off, keeping the Settings toggle and panel visibility in sync. */
function setResolverDebugEnabled(enabled) {
  resolverDebugEnabled = enabled;
  if (enabled) localStorage.setItem(RESOLVER_DEBUG_STORAGE_KEY, '1');
  else localStorage.removeItem(RESOLVER_DEBUG_STORAGE_KEY);
  if (el.debugModeToggle) {
    el.debugModeToggle.classList.toggle('active', enabled);
    el.debugModeToggle.setAttribute('aria-checked', String(enabled));
  }
  if (enabled) {
    // Replay the full session history immediately so the panel isn't empty on open.
    if (el.resolverDebugLogEl) {
      el.resolverDebugLogEl.innerHTML = '';
      resolverDebugHistory.forEach(appendResolverDebugLine);
      el.resolverDebugLogEl.scrollTop = el.resolverDebugLogEl.scrollHeight;
    }
    if (el.resolverDebugPanel) el.resolverDebugPanel.classList.remove('hidden');
  } else if (el.resolverDebugPanel) {
    el.resolverDebugPanel.classList.add('hidden');
  }
}
setResolverDebugEnabled(resolverDebugEnabled); // paints the toggle's initial state

if (el.debugModeToggle) {
  el.debugModeToggle.addEventListener('click', () => setResolverDebugEnabled(!resolverDebugEnabled));
}

// "Self-hosted Valhalla" Settings toggle overrides CONFIG.USE_SELF_HOSTED_VALHALLA per device; localStorage wins once set.
const SELF_HOSTED_VALHALLA_STORAGE_KEY = 'useSelfHostedValhalla';
const storedSelfHostedValhalla = localStorage.getItem(SELF_HOSTED_VALHALLA_STORAGE_KEY);
let useSelfHostedValhalla = storedSelfHostedValhalla !== null ? storedSelfHostedValhalla === '1' : CONFIG.USE_SELF_HOSTED_VALHALLA;
if (el.selfHostedValhallaToggle) {
  el.selfHostedValhallaToggle.classList.toggle('active', useSelfHostedValhalla);
  el.selfHostedValhallaToggle.setAttribute('aria-checked', String(useSelfHostedValhalla));
  el.selfHostedValhallaToggle.addEventListener('click', () => {
    useSelfHostedValhalla = !useSelfHostedValhalla;
    localStorage.setItem(SELF_HOSTED_VALHALLA_STORAGE_KEY, useSelfHostedValhalla ? '1' : '0');
    el.selfHostedValhallaToggle.classList.toggle('active', useSelfHostedValhalla);
    el.selfHostedValhallaToggle.setAttribute('aria-checked', String(useSelfHostedValhalla));
    resolverDebugLog(`Valhalla: self-hosted routing turned ${useSelfHostedValhalla ? 'on' : 'off'} via the Settings toggle.`);
  });
}

// Same per-device-override pattern as useSelfHostedValhalla, for "TomTom live traffic". Does nothing if no TomTom
// API key is configured server-side — /api/traffic and /api/places just keep erroring, same as the flag being off.
const TOMTOM_FEATURES_STORAGE_KEY = 'tomtomFeaturesEnabled';
const storedTomtomFeatures = localStorage.getItem(TOMTOM_FEATURES_STORAGE_KEY);
let tomtomFeaturesEnabled = storedTomtomFeatures !== null ? storedTomtomFeatures === '1' : CONFIG.TOMTOM_FEATURES_ENABLED;
if (el.tomtomToggle) {
  el.tomtomToggle.classList.toggle('active', tomtomFeaturesEnabled);
  el.tomtomToggle.setAttribute('aria-checked', String(tomtomFeaturesEnabled));
  el.tomtomToggle.addEventListener('click', () => {
    tomtomFeaturesEnabled = !tomtomFeaturesEnabled;
    localStorage.setItem(TOMTOM_FEATURES_STORAGE_KEY, tomtomFeaturesEnabled ? '1' : '0');
    el.tomtomToggle.classList.toggle('active', tomtomFeaturesEnabled);
    el.tomtomToggle.setAttribute('aria-checked', String(tomtomFeaturesEnabled));
    resolverDebugLog(`TomTom: live traffic/places turned ${tomtomFeaturesEnabled ? 'on' : 'off'} via the Settings toggle.`);
  });
}

// Captured before the console.* patch below runs, so logging never recurses into itself.
const nativeConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
};

let resolverDebugStartTs = null;
function resolverDebugReset() {
  resolverDebugStartTs = Date.now();
  if (resolverDebugEnabled && el.resolverDebugLogEl) el.resolverDebugLogEl.innerHTML = '';
}
/** Appends one formatted history entry to the on-screen debug panel. */
function appendResolverDebugLine(entry) {
  const lineEl = document.createElement('div');
  lineEl.className = entry.kind ? `resolver-debug-line ${entry.kind}` : 'resolver-debug-line';
  lineEl.textContent = entry.text;
  el.resolverDebugLogEl.appendChild(lineEl);
}
function resolverDebugLog(message, kind = '') {
  if (resolverDebugStartTs == null) resolverDebugStartTs = Date.now();
  nativeConsole.log('[resolver]', message);
  // Recorded unconditionally, Debug mode on or off — see resolverDebugHistory above.
  const entry = { text: `[+${Date.now() - resolverDebugStartTs}ms] ${message}`, kind };
  resolverDebugHistory.push(entry);
  if (resolverDebugHistory.length > RESOLVER_DEBUG_HISTORY_MAX) resolverDebugHistory.shift();
  if (!resolverDebugEnabled || !el.resolverDebugLogEl) return;
  appendResolverDebugLine(entry);
  el.resolverDebugLogEl.scrollTop = el.resolverDebugLogEl.scrollHeight;
  // Deliberately NOT pushBackLayer()'d — the shared backStack is LIFO and gets overwritten by a place card or
  // navigation starting, which left this panel's close button closing the wrong layer. See resolverDebugCloseBtn/
  // resolverDebugEndBtn for its own close controls, and initNativeBackButton for the hardware-back special case.
  el.resolverDebugPanel.classList.remove('hidden');
}
// Also surfaces otherwise-invisible crashes (uncaught errors, unawaited rejected promises) on this same panel.
window.addEventListener('error', (e) => {
  resolverDebugLog(`Uncaught error: ${e.message} (${e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : 'unknown location'})`, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const detail = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
  resolverDebugLog(`Unhandled promise rejection: ${detail}`, 'error');
});

/** Formats a console.log/warn/error/info argument for display; patched consoles below also mirror to the on-screen panel. */
function formatConsoleArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === 'object' && arg !== null) {
    try { return JSON.stringify(arg); } catch (_) { return String(arg); }
  }
  return String(arg);
}
const CONSOLE_DEBUG_KIND = { warn: 'warn', error: 'error' };
['log', 'warn', 'error', 'info'].forEach((level) => {
  console[level] = (...args) => {
    nativeConsole[level](...args);
    resolverDebugLog(args.map(formatConsoleArg).join(' '), CONSOLE_DEBUG_KIND[level] || '');
  };
});

if (el.resolverDebugCollapseToggleBtn) {
  // Shrinks the panel to just its header row without turning Debug mode off; stays collapsed across new log lines.
  el.resolverDebugCollapseToggleBtn.addEventListener('click', () => {
    const collapsed = el.resolverDebugPanel.classList.toggle('collapsed');
    el.resolverDebugCollapseToggleBtn.textContent = collapsed ? '▸' : '▾';
    el.resolverDebugCollapseToggleBtn.setAttribute('aria-label', collapsed ? 'Expand debug log' : 'Collapse debug log');
  });
}
if (el.resolverDebugCloseBtn) {
  // Direct hide, not goBackInApp() — this panel isn't on the shared backStack. Only hides for now; "End" turns Debug mode off.
  el.resolverDebugCloseBtn.addEventListener('click', () => el.resolverDebugPanel.classList.add('hidden'));
}
if (el.resolverDebugEndBtn) {
  el.resolverDebugEndBtn.addEventListener('click', () => setResolverDebugEnabled(false));
}
if (el.resolverDebugCopyBtn) {
  el.resolverDebugCopyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.resolverDebugLogEl.innerText);
      el.resolverDebugCopyBtn.textContent = 'Copied!';
      setTimeout(() => { el.resolverDebugCopyBtn.textContent = 'Copy'; }, 1500);
    } catch {
      showStatus('Could not copy — select and copy the log text manually.', 'error');
    }
  });
}

/** Resolves a pasted Google Maps link (long URL or maps.app.goo.gl/goo.gl short link) to `{ label, lat, lon,
 * sourceUrl }`, or `{ error }` on failure — short links need a server-side hop (functions/api/resolve-maps-url.js)
 * since a browser can't read a cross-origin redirect's target. The error lives on the return value, not a shared
 * variable, so concurrent calls can't cross-contaminate. `resolved.lat != null` is the success check. */
async function resolveGoogleMapsLink(text) {
  resolverDebugReset();
  resolverDebugLog(`Input: "${text.length > 100 ? `${text.slice(0, 100)}…` : text}"`);
  let resolveError = null;
  let parsed = parseGoogleMapsUrl(text);
  if (!parsed) {
    resolverDebugLog('Not a Google Maps link — bailing out.', 'error');
    return { error: 'not a Google Maps link' };
  }
  resolverDebugLog(`Parsed: matchedUrl="${parsed.matchedUrl}"${parsed.name ? `, name="${parsed.name}"` : ''}${parsed.lat != null ? `, coords already in URL (${parsed.lat}, ${parsed.lon})` : ', no coords in URL yet'}`);

  if (parsed.lat == null) {
    resolverDebugLog(`Calling ${isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '(same origin)'}/api/resolve-maps-url to follow the short link…`);
    try {
      // Relative on the web (same-origin, no CORS); the Android shell needs the absolute override since it has no backend of its own.
      const resolveBase = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
      const res = await fetchWithTimeout(`${resolveBase}/api/resolve-maps-url?url=${encodeURIComponent(parsed.matchedUrl)}`);
      const contentType = res.headers.get('content-type') || '';
      resolverDebugLog(`Response: HTTP ${res.status}, content-type "${contentType || '(none)'}"`);
      // A non-JSON body (even on 200) means something in front of our worker swapped in its own response (e.g. a block page).
      if (res.ok && contentType.includes('application/json')) {
        const { resolvedUrl } = await res.json();
        resolverDebugLog(`resolvedUrl: ${resolvedUrl || '(empty)'}`, 'url');
        if (resolvedUrl) parsed = parseGoogleMapsUrl(resolvedUrl) || parsed;
        resolverDebugLog(parsed.lat != null ? `Coordinates recovered: ${parsed.lat}, ${parsed.lon}` : 'No coordinates found in the resolved URL.', parsed.lat != null ? 'success' : 'error');
      } else {
        const snippet = (await res.text().catch(() => '')).slice(0, 120).replace(/\s+/g, ' ').trim();
        resolveError = `the link resolver returned HTTP ${res.status}${snippet ? ` — "${snippet}"` : ''}`;
        resolverDebugLog(resolveError, 'error');
        console.error('resolveGoogleMapsLink:', resolveError);
      }
    } catch (err) {
      resolveError = err.name === 'AbortError'
        ? 'timed out reaching the link resolver'
        : `network error reaching the link resolver (${err.message})`;
      resolverDebugLog(resolveError, 'error');
      console.error('resolveGoogleMapsLink:', resolveError, err);
    }
  }

  // sourceUrl is always the isolated URL, never the raw pasted text, since it ends up as a favorite's note/link href.
  if (parsed.lat != null) {
    resolverDebugLog(`Done: resolved to ${parsed.lat}, ${parsed.lon}${parsed.name ? ` ("${parsed.name}")` : ''}`, 'success');
    return { label: parsed.name || 'Pinned location', lat: parsed.lat, lon: parsed.lon, sourceUrl: parsed.matchedUrl };
  }
  if (parsed.name) {
    // Places with no formal address get a name leading with a Plus Code (Google's offline location encoding),
    // e.g. "R72F+2J Chellanam Sea Wall, Chellanam, Kerala 682008" — decode it directly instead of a name search
    // OSM has no chance of matching. A short code needs a nearby reference point to anchor it (from the locality text).
    const plusCodeMatch = parsed.name.match(/^([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7})(?:[\s,]+(.*))?$/i);
    // Dynamically imported since this ~28KB module is only needed for the rare no-address Plus Code case.
    const olc = plusCodeMatch ? new (await import('./vendor/open-location-code.js')).OpenLocationCode() : null;
    // The regex only checks shape; olc.isValid/isShort enforce the real Open Location Code rules on top of it.
    if (plusCodeMatch && olc.isValid(plusCodeMatch[1].toUpperCase()) && olc.isShort(plusCodeMatch[1].toUpperCase())) {
      const plusCode = plusCodeMatch[1].toUpperCase();
      const remainder = (plusCodeMatch[2] || '').trim();
      // Prefer the text after the first comma (locality) over a leading landmark name Nominatim can't geocode either.
      const commaIdx = remainder.indexOf(',');
      const referenceQuery = commaIdx >= 0 ? remainder.slice(commaIdx + 1).trim() : remainder;
      if (referenceQuery) {
        resolverDebugLog(`Name starts with Plus Code "${plusCode}" — geocoding "${referenceQuery}" as a reference point…`);
        try {
          const refResults = await geocodeSearch(referenceQuery, {});
          if (refResults && refResults[0]) {
            const fullCode = olc.recoverNearest(plusCode, refResults[0].lat, refResults[0].lon);
            const area = olc.decode(fullCode);
            resolverDebugLog(`Done: Plus Code decoded (anchored at ${refResults[0].lat}, ${refResults[0].lon}) to ${area.latitudeCenter}, ${area.longitudeCenter}`, 'success');
            return { label: parsed.name, lat: area.latitudeCenter, lon: area.longitudeCenter, sourceUrl: parsed.matchedUrl };
          }
          resolverDebugLog(`No geocode result for "${referenceQuery}" — can't anchor the Plus Code, falling back to a plain search.`, 'error');
        } catch (err) {
          resolverDebugLog(`Plus Code decode failed (${err.message || err}) — falling back to a plain search.`, 'error');
        }
      }
    }

    resolverDebugLog(`Falling back to a Nominatim search for "${parsed.name}"…`);
    try {
      const results = await geocodeSearch(parsed.name, {});
      if (results && results[0]) {
        resolverDebugLog(`Done: Nominatim resolved "${parsed.name}" to ${results[0].lat}, ${results[0].lon}`, 'success');
        return { ...results[0], sourceUrl: parsed.matchedUrl };
      }
      resolverDebugLog('Nominatim found nothing either.', 'error');
    } catch (err) {
      resolverDebugLog(`Nominatim fallback threw: ${err.message}`, 'error');
    }
  }
  resolverDebugLog('Giving up.', 'error');
  // matchedUrl lets the caller offer "open this link yourself" as a fallback, since we can't automate it further.
  return { error: resolveError || "couldn't find coordinates for that link", matchedUrl: parsed.matchedUrl };
}

/** Auto-bookmarks every link-resolved place into "To add to OSM" (it's by definition not in OSM/Nominatim yet). Fire-and-forget. */
async function autoBookmarkGoogleMapsLink({ label, lat, lon, sourceUrl }) {
  try {
    const listId = await getOrCreateNamedListId('To add to OSM');
    // Dedupe by coordinates, not link text — a short link and its resolved long link differ but mean the same place.
    const existing = await getFavorites(listId);
    if (existing.some((f) => f.lat === lat && f.lon === lon)) {
      showStatus(`"${splitPlaceLabel(label).primary}" is already in your "To add to OSM" list.`, 'info');
      return;
    }
    await addFavorite({ label, lat, lon, listId, note: sourceUrl });
    showStatus(`Saved "${splitPlaceLabel(label).primary}" to your "To add to OSM" list.`, 'success');
  } catch (err) {
    showStatus('Resolved the link, but could not bookmark it: ' + err.message, 'error');
  }
}

// Sentinel label for a place resolved from live GPS; shared by geocodeNear, useCurrentLocationFor, and resolvePlaceForReuse.
const CURRENT_LOCATION_LABEL = 'Your location';
const NEAR_ME_KEYWORDS = new Set(['me', 'my location', 'here', 'current location']);

/** One-shot GPS fetch for a "X near me" query; rejects (not null) so callers can handle it like a geocoding failure. */
function resolveCurrentLocationAnchor() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('This browser does not support GPS location.')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ label: CURRENT_LOCATION_LABEL, lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error('Could not get your location. Check location permissions.')),
      CONFIG.GEOLOCATION_OPTIONS,
    );
  });
}

/** "EV charging near Gateway of India" → geocode the anchor, then search around it. "near me"/"near here"
 * special-cases to a live GPS fix instead, since Nominatim can't geocode the literal word "me". */
async function geocodeNear(subject, anchorQuery) {
  let anchor;
  if (NEAR_ME_KEYWORDS.has(anchorQuery.trim().toLowerCase())) {
    anchor = await resolveCurrentLocationAnchor(); // throws its own message on failure
  } else {
    const anchorResults = await nominatimSearch(anchorQuery);
    if (!anchorResults.length) throw new Error(`Could not find "${anchorQuery}" to search near.`);
    anchor = anchorResults[0];
  }

  const tag = matchCategoryTag(subject);
  if (tag) {
    const results = await categorySearchNear(tag, anchor.lat, anchor.lon);
    if (results.length) return results;
  }
  // Fall back to a bounded free-text search — less reliable than the tag search, but still better than unconstrained.
  return nominatimSearch(subject, viewboxParam(anchor.lat, anchor.lon, CONFIG.GEOCODE_NEAR_RADIUS_DEG_WIDE));
}

/** Generates single-edit typo variants to retry when a search draws a blank: adjacent-letter transpositions
 * first, then single-character deletions. Skips substitutions/insertions — too many candidates for a rate-limited
 * server. (Missing-letter typos are handled separately by wordDropCandidates below.) */
function typoVariants(query) {
  const variants = [];
  for (let i = 0; i < query.length - 1; i++) {
    if (query[i] === query[i + 1]) continue; // swapping identical letters is a no-op
    const chars = query.split('');
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    variants.push(chars.join(''));
  }
  for (let i = 0; i < query.length; i++) {
    variants.push(query.slice(0, i) + query.slice(i + 1));
  }
  return variants;
}

/** Handles a truncated query ("Milky Way Apart" for "Milky Way Apartments") by progressively dropping trailing
 * words down to a complete prefix Nominatim can match. Skips candidates left too short to search meaningfully. */
function wordDropCandidates(query) {
  const words = query.trim().split(/\s+/);
  const candidates = [];
  for (let dropCount = 1; dropCount < words.length; dropCount++) {
    const candidate = words.slice(0, words.length - dropCount).join(' ');
    if (candidate.length >= 3) candidates.push(candidate);
  }
  return candidates;
}

/** Classic edit-distance DP, used only to rank already-fetched results (see rankBySimilarity), never to generate candidates. */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** How well a candidate matches what was typed, 0 to 1. Compares against a same-length PREFIX of the result's
 * name, not the whole thing, so a truncated/typo'd query isn't unfairly penalized for text it never had a chance to match. */
function similarityScore(query, label) {
  const q = query.trim().toLowerCase();
  const primary = splitPlaceLabel(label).primary.toLowerCase();
  const prefix = primary.slice(0, q.length);
  const distance = levenshteinDistance(q, prefix);
  return 1 - distance / Math.max(q.length, prefix.length, 1);
}

/** Re-sorts fallback results by similarity to the ORIGINAL query, since Nominatim ranked them by the broadened/truncated fallback text instead. */
function rankBySimilarity(results, originalQuery) {
  return [...results].sort((a, b) => similarityScore(originalQuery, b.label) - similarityScore(originalQuery, a.label));
}

// Caps extra Nominatim calls per zero-result search. Sized to cover a typical name's full transposition run plus some deletions/word-drops.
const TYPO_FALLBACK_MAX_ATTEMPTS = 12;

// A candidate at/above this similarity stops the search early. Below it, every candidate in the budget is tried
// and the best-scoring one wins, so a coincidentally-matching broad candidate can't beat a better one that came later.
const GOOD_ENOUGH_SIMILARITY = 0.75;

/** Called when a real search drew a blank. Tries wordDropCandidates() and typoVariants() together, keeping the
 * single best-scoring match (see GOOD_ENOUGH_SIMILARITY), then re-ranks its results by similarity to the original
 * query and tags them `.correctedQuery`. Skips too-short queries. `shouldAbort`, if given, stops the loop early
 * once the search becomes stale (e.g. the user kept typing) — the caller then knows not to cache the empty result. */
async function geocodeFuzzyFallback(query, shouldAbort) {
  if (query.length < 4) return { results: [], aborted: false };
  const tried = new Set([query.toLowerCase()]);
  let attempts = 0;
  let best = null; // { results, candidate, score } — the best-scoring candidate seen so far
  const candidates = [...wordDropCandidates(query), ...typoVariants(query)];
  for (const candidate of candidates) {
    if (shouldAbort && shouldAbort()) return { results: [], aborted: true };
    const key = candidate.toLowerCase();
    if (tried.has(key)) continue;
    tried.add(key);
    if (++attempts > TYPO_FALLBACK_MAX_ATTEMPTS) break;
    const results = await nominatimSearch(candidate);
    if (!results.length) continue;
    const ranked = rankBySimilarity(results, query);
    const score = similarityScore(query, ranked[0].label);
    if (!best || score > best.score) best = { results: ranked, candidate, score };
    if (score >= GOOD_ENOUGH_SIMILARITY) break;
  }
  if (!best) return { results: [], aborted: false };
  best.results.correctedQuery = best.candidate;
  return { results: best.results, aborted: false };
}

/** `opts.shouldAbort`/`opts.onFallbackStart` are only used by the live-typed autocomplete path: `shouldAbort` lets
 * a stale fallback chain give up early, `onFallbackStart` fires once before the first fallback request so the UI
 * can explain the extra wait. */
async function geocodeSearch(query, opts = {}) {
  const trimmed = query.trim();
  const cacheKey = trimmed.toLowerCase();
  const nearMatch = trimmed.match(NEAR_QUERY_PATTERN);
  // "near me"/"near here" resolves against the device's current location, so it can't be cached by text alone
  // like a fixed-place "near X" query can.
  const isNearMe = !!nearMatch && NEAR_ME_KEYWORDS.has(nearMatch[2].trim().toLowerCase());

  let results;
  if (!isNearMe && nominatimCache.has(cacheKey)) {
    results = nominatimCache.get(cacheKey);
  } else {
    results = nearMatch
      ? await geocodeNear(nearMatch[1].trim(), nearMatch[2].trim())
      : await nominatimSearch(trimmed);

    // Fuzzy fallback only applies to a plain place-name search — "near X" already does its own two-step lookup.
    let aborted = false;
    if (!results.length && !nearMatch) {
      if (opts.onFallbackStart) opts.onFallbackStart();
      ({ results, aborted } = await geocodeFuzzyFallback(trimmed, opts.shouldAbort));
    }

    // Don't cache an aborted attempt as [] — it stopped early, it didn't genuinely come up empty.
    if (!aborted && !isNearMe) nominatimCache.set(cacheKey, results);
  }

  // Bias plain-text results toward the user's current position, closest first (Nominatim's own ranking has no
  // idea of real distance). Done after the cache read/write, not baked into it, since it depends on the CURRENT
  // position, not whatever it was when this query was last cached. "Near X" queries already have their own anchor/ordering.
  if (!nearMatch) {
    const liveLngLat = currentLiveLngLat();
    if (liveLngLat) {
      const sorted = decorateWithDistance(results, liveLngLat[1], liveLngLat[0]);
      if (results.correctedQuery) sorted.correctedQuery = results.correctedQuery;
      results = sorted;
    }
  }
  return results;
}

/** Single funnel point for every text-entry path (search box, from/to fields, "X to Y" shortcut) so "Home"/"Work"
 * resolve from saved quick places and GPS keywords resolve to a live fix, instead of being sent to Nominatim as
 * literal text. Falls through to geocodeSearch for anything else. */
async function resolveTextOrQuickPlace(text, opts) {
  const keyword = text.trim().toLowerCase();
  if (keyword === 'home' || keyword === 'work') {
    const saved = await getQuickPlace(keyword).catch(() => null);
    if (saved) return [{ label: saved.label, lat: saved.lat, lon: saved.lon }];
  }
  if (NEAR_ME_KEYWORDS.has(keyword)) {
    return [await resolveCurrentLocationAnchor()]; // throws its own message on failure
  }
  return geocodeSearch(text, opts);
}

/** Shared by every suggestions dropdown so a back press closes just the dropdown instead of skipping past it.
 * Tracks its own pushed closeFn on the element (`_backLayerCloseFn`) so hideSuggestionList can un-push it correctly. */
function showSuggestionList(listEl) {
  if (listEl.classList.contains('hidden')) {
    const closeFn = () => hideSuggestionList(listEl);
    listEl._backLayerCloseFn = closeFn;
    pushBackLayer(closeFn);
  }
  listEl.classList.remove('hidden');
  // #stops-container clips absolutely-positioned descendants via overflow-y:auto; relax it to visible while a dropdown is open.
  if (el.stopsContainer.contains(listEl)) el.stopsContainer.classList.add('stops-suggestions-open');
}
function hideSuggestionList(listEl) {
  if (!listEl.classList.contains('hidden') && listEl._backLayerCloseFn) {
    forgetBackLayerIfTop(listEl._backLayerCloseFn);
    listEl._backLayerCloseFn = null;
  }
  listEl.classList.add('hidden');
  listEl.innerHTML = '';
  if (el.stopsContainer.contains(listEl)) el.stopsContainer.classList.remove('stops-suggestions-open');
}

/** Loading indicator shown while a search is in flight; `text` lets a caller update the message mid-search (see onFallbackStart). */
function showSuggestionLoading(listEl, text = 'Searching…') {
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'loading';
  li.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(text)}</span>`;
  listEl.appendChild(li);
  showSuggestionList(listEl);
}

/** Builds the sticky "Open now" toggle row prepended to a category search's results list. `onToggle` re-renders
 * the current results immediately rather than only affecting the next search. */
function createOpenNowToggleRow(onToggle) {
  const li = document.createElement('li');
  li.className = 'suggestions-filter-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip open-now-toggle' + (state.filterOpenNow ? ' active' : '');
  btn.setAttribute('aria-pressed', String(state.filterOpenNow));
  btn.setAttribute('aria-label', 'Filter results to open now');
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7 v5 l4 2"/></svg><span>Open now</span>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // this row's own <li> sits inside a clickable results list — never let the toggle also trigger a result pick
    state.filterOpenNow = !state.filterOpenNow;
    onToggle();
  });
  li.appendChild(btn);
  return li;
}

/** Renders a results list, identical for live-typed autocomplete or category search. `inputEl` is optional
 * (category search has no field to fill). `openNowToggle`, when given, prepends the toggle row and keeps the
 * list open on zero matches (showing `emptyMessage` inline) instead of closing it. */
function renderSuggestionResults(listEl, inputEl, results, onSelect, emptyMessage, distanceSuffix = 'away', openNowToggle = null) {
  listEl.innerHTML = '';
  if (openNowToggle) listEl.appendChild(createOpenNowToggleRow(openNowToggle));
  if (!results.length) {
    if (openNowToggle) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = emptyMessage || 'No results found.';
      listEl.appendChild(li);
      showSuggestionList(listEl);
      return;
    }
    hideSuggestionList(listEl);
    if (emptyMessage) showStatus(emptyMessage, 'info');
    return;
  }
  results.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'result-item';

    const { primary, secondary } = splitPlaceLabel(r.label);
    // Distance renders as its own right-aligned column (.result-dist); opening-hours stays in the stacked .result-meta line.
    const metaParts = [];
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
    let distEl = null;
    if (r.distanceM != null) {
      distEl = document.createElement('span');
      distEl.className = 'result-dist';
      distEl.textContent = `${formatDistance(r.distanceM)} ${distanceSuffix}`;
      // Clicking the distance is still "pick this result" — same target as
      // tapping the name/address, not a separate control.
      distEl.addEventListener('click', () => {
        if (inputEl) inputEl.value = primary;
        hideSuggestionList(listEl);
        onSelect(r);
      });
    }

    // Save-to-favorites star — stopPropagation so tapping it doesn't also pick the result.
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'save-btn';
    saveBtn.setAttribute('aria-label', 'Save to favorites');
    saveBtn.innerHTML = starIcon();
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSaveToListPrompt(splitPlaceLabel(r.label).primary, null, async (listId) => {
        try {
          await addFavorite({ label: r.label, lat: r.lat, lon: r.lon, listId });
          saveBtn.classList.add('saved');
          showStatus('Saved to favorites.', 'success');
        } catch (err) {
          showStatus('Could not save this favorite: ' + err.message, 'error');
        }
      });
    });

    li.appendChild(text);
    if (distEl) li.appendChild(distEl);
    const svBtn = streetViewButton(r.lat, r.lon); // null when Mapillary isn't configured
    if (svBtn) li.appendChild(svBtn);
    li.appendChild(saveBtn);
    listEl.appendChild(li);
  });
  showSuggestionList(listEl);
}

/** `opts.onDirectionsShortcut(fromText, toText, isStale)`, if given, is checked first on every debounce firing —
 * only the plain search box passes this, since "X to Y" only makes sense there, not in a dedicated from/to field. */
function setupAutocomplete(inputEl, listEl, onSelect, opts = {}) {
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
      // Stale if a newer keystroke fired its own search, OR the field's live value has moved on from this query —
      // the seq check alone misses a mid-word pause where no new debounce fires but the input keeps changing.
      const isStale = () => mySeq !== seq || inputEl.value.trim() !== query;

      // A pasted Google Maps link should never fall through to the near/to shortcuts or a typo-fallback cascade.
      if (parseGoogleMapsUrl(query)) {
        showSuggestionLoading(listEl, 'Resolving Google Maps link…');
        const resolved = await resolveGoogleMapsLink(query);
        if (isStale()) return;
        hideSuggestionList(listEl);
        if (resolved.lat != null) {
          inputEl.value = resolved.label;
          onSelect(resolved);
          autoBookmarkGoogleMapsLink(resolved);
        } else {
          showStatus(`Couldn't resolve that Google Maps link — ${resolved.error}.`, 'error', resolved.matchedUrl
            ? { sticky: true, link: { href: resolved.matchedUrl, text: 'Open the original link' } }
            : {});
        }
        return;
      }

      if (opts.onDirectionsShortcut && !NEAR_QUERY_PATTERN.test(query)) {
        const toMatch = query.match(TO_QUERY_PATTERN);
        if (toMatch) {
          await opts.onDirectionsShortcut(toMatch[1].trim(), toMatch[2].trim(), isStale);
          return;
        }
      }

      showSuggestionLoading(listEl);
      try {
        const results = await resolveTextOrQuickPlace(query, {
          shouldAbort: isStale,
          // Makes the several-second fallback chain legible instead of looking like the search silently hung.
          onFallbackStart: () => {
            if (!isStale()) showSuggestionLoading(listEl, `No direct match for "${query}" — refining the search…`);
          },
        });
        if (isStale()) return;
        // Set by geocodeFuzzyFallback() when a corrected variant found something — tell the user what was actually searched.
        if (results.correctedQuery) {
          showStatus(`No exact match for "${query}" — showing results for "${results.correctedQuery}".`, 'info');
        }
        renderSuggestionResults(listEl, inputEl, results, onSelect, 'No matching places found for that search.');
      } catch (err) {
        if (isStale()) return;
        hideSuggestionList(listEl);
        showStatus(err.message, 'error');
      }
    }, CONFIG.NOMINATIM_DEBOUNCE_MS);
  });

  // addStopRow() can call this repeatedly across a session, so a permanent listener would leak one per removed
  // stop row; return a teardown function for the row's owner to call when it goes away.
  const outsideClickHandler = (e) => {
    if (e.target !== inputEl && !listEl.contains(e.target)) hideSuggestionList(listEl);
  };
  document.addEventListener('click', outsideClickHandler);
  return () => document.removeEventListener('click', outsideClickHandler);
}

/** Renders the EV charging details card; hides it for a plain OSM pick with no `evDetails`. Status is always
 * shown with its recency, since Open Charge Map's status field is community-maintained and often stale. */
function renderEvDetailsCard(evDetails) {
  if (!evDetails) {
    el.evDetailsCard.classList.add('hidden');
    return;
  }
  const { connections, operatorName, operatorWebsite, usageType, usageCost, numberOfPoints, statusLabel, statusKey, statusAge } = evDetails;

  const first = connections[0];
  const connectorParts = [];
  if (first) {
    connectorParts.push(first.type);
    if (first.powerKW) connectorParts.push(`${first.powerKW} kW`);
  }
  const pointCount = numberOfPoints || (first && first.quantity) || null;
  if (pointCount) connectorParts.push(pointCount === 1 ? '1 point' : `${pointCount} points`);
  el.evConnectorLine.textContent = connectorParts.length ? connectorParts.join(' · ') : 'Connector details not reported';

  const operatorParts = [];
  if (operatorName) operatorParts.push(operatorName);
  if (usageCost) operatorParts.push(usageCost);
  else if (usageType) operatorParts.push(usageType);
  el.evOperatorLine.textContent = operatorParts.join(' · ');
  el.evOperatorLine.classList.toggle('hidden', operatorParts.length === 0);

  el.evStatusDot.className = `ev-status-dot ${statusKey}`;
  el.evStatusText.textContent = statusLabel
    ? `Reported ${statusLabel.toLowerCase()} · ${statusAge ? `checked ${statusAge}` : 'check-in date unknown'}`
    : 'Status not recently reported';

  if (operatorWebsite && isSafeHttpUrl(operatorWebsite)) {
    el.evOperatorLink.href = operatorWebsite;
    el.evOperatorLink.classList.remove('hidden');
  } else {
    el.evOperatorLink.classList.add('hidden');
  }

  el.evDetailsCard.classList.remove('hidden');
}

/** Full-screen "View full details" page: every connector, operator phone, address, and comments (not just the inline card's summary). */
function renderEvDetailsPanel(label, evDetails) {
  const {
    connections, operatorName, operatorPhone, operatorWebsite, usageType, usageCost,
    numberOfPoints, statusLabel, statusKey, statusAge, address, accessComments, comments,
  } = evDetails;

  el.evDetailsPanelTitle.textContent = splitPlaceLabel(label).primary;

  el.evDetailsPanelStatusDot.className = `ev-status-dot ${statusKey}`;
  el.evDetailsPanelStatusText.textContent = statusLabel
    ? `Reported ${statusLabel.toLowerCase()} · ${statusAge ? `checked ${statusAge}` : 'check-in date unknown'}`
    : 'Status not recently reported';

  el.evDetailsPanelConnectors.innerHTML = connections.length
    ? connections.map((c) => {
      const meta = [c.powerKW ? `${c.powerKW} kW` : null, c.currentType, c.quantity > 1 ? `${c.quantity} points` : null].filter(Boolean).join(' · ');
      return `<div class="ev-panel-connector"><div class="ev-panel-connector-type">${escapeHtml(c.type)}</div>${meta ? `<div class="ev-panel-connector-meta">${escapeHtml(meta)}</div>` : ''}</div>`;
    }).join('')
    : '<div class="ev-panel-connector">Connector details not reported</div>';
  if (numberOfPoints) {
    el.evDetailsPanelConnectors.innerHTML += `<div class="ev-panel-connector-meta" style="padding: 0 2px;">${numberOfPoints} charging point${numberOfPoints === 1 ? '' : 's'} total at this station</div>`;
  }

  const operatorLines = [];
  if (operatorName) operatorLines.push(escapeHtml(operatorName));
  if (operatorPhone) operatorLines.push(escapeHtml(operatorPhone));
  if (operatorWebsite && isSafeHttpUrl(operatorWebsite)) operatorLines.push(`<a href="${escapeHtml(operatorWebsite)}" target="_blank" rel="noopener">${escapeHtml(operatorWebsite)}</a>`);
  else if (operatorWebsite) operatorLines.push(escapeHtml(operatorWebsite));
  el.evDetailsPanelOperator.innerHTML = operatorLines.length ? operatorLines.map((l) => `<div>${l}</div>`).join('') : '<div>Not reported</div>';

  const costLines = [];
  if (usageType) costLines.push(escapeHtml(usageType));
  costLines.push(escapeHtml(usageCost || 'Cost not reported'));
  if (accessComments) costLines.push(escapeHtml(accessComments));
  el.evDetailsPanelCost.innerHTML = costLines.map((l) => `<div>${l}</div>`).join('');

  el.evDetailsPanelAddressSection.classList.toggle('hidden', !address);
  if (address) el.evDetailsPanelAddress.textContent = address;

  el.evDetailsPanelCommentsSection.classList.toggle('hidden', !comments);
  if (comments) el.evDetailsPanelComments.textContent = comments;
}

function showPlaceCard({ label, lat, lon, evDetails }) {
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
  renderEvDetailsCard(evDetails);
  refreshWeatherBadge(); // fire-and-forget — weather for this place, doesn't block the card appearing
}
function hidePlaceCard() {
  el.placeCard.classList.add('hidden');
  el.evDetailsCard.classList.add('hidden');
  // Written before the full-screen "View full details" panel existed and
  // never updated — defense-in-depth in case some future caller reaches
  // this while that panel is open, rather than relying solely on the panel
  // being a full-screen overlay sitting on top of everything else today.
  el.evDetailsPanel.classList.add('hidden');
  refreshWeatherBadge(); // re-evaluate: hides the badge unless navigation is still active
}

/** The place card's close-layer callback (registered via pushBackLayer). Must NOT itself touch the back stack — popstate already owns popping here. */
function closePlaceCard() {
  state.to = null;
  updatePlanningMarkers();
  hidePlaceCard();
}

// ---- Default view: single search box, Google-Maps-style "search here" ----
/** Sets `picked` as the destination and shows its place card. Shared by the search box and category results.
 * forgetBackLayerIfTop keeps the back-stack honest whether the card closes via its own button or a new query. */
function selectPlace(picked) {
  // A quick-place (Home/Work) is being set — divert away from the normal "route to it" flow. See armQuickPlacePick.
  if (picked && state.pendingQuickPlaceKind) {
    const kind = state.pendingQuickPlaceKind;
    state.pendingQuickPlaceKind = null;
    forgetBackLayerIfTop(cancelQuickPlacePick);
    setQuickPlace(kind, picked)
      .then(() => {
        showStatus(`${kind === 'home' ? 'Home' : 'Work'} set to ${shortLabel(picked)}.`, 'success');
        renderQuickPlaces();
      })
      .catch((err) => showStatus(`Could not save that: ${err.message}`, 'error'));
    return;
  }
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

/** "Milky Way Apartments to Trinity World" typed into the search box (see TO_QUERY_PATTERN) — geocodes both
 * sides (via the normal geocodeSearch, so near-search/typo-tolerance apply) and jumps into a planned route.
 * Only the top result per side is used. A side that fails is left blank rather than aborting the whole thing;
 * the route only auto-plans once both sides resolve. `isStale` aborts stale in-flight lookups if the query changes mid-search. */
async function handlePlaceToPlaceDirections(fromText, toText, isStale) {
  const searchOpts = (text) => ({
    shouldAbort: isStale,
    onFallbackStart: () => {
      if (!isStale()) showSuggestionLoading(el.placeSuggestions, `No direct match for "${text}" — refining the search…`);
    },
  });

  showSuggestionLoading(el.placeSuggestions, `Finding "${fromText}"…`);
  let fromResults = [];
  try {
    fromResults = await resolveTextOrQuickPlace(fromText, searchOpts(fromText));
  } catch (err) {
    if (isStale()) return;
    // Not found and "couldn't check" are treated the same — this side is left blank rather than aborting the whole shortcut.
  }
  if (isStale()) return;

  showSuggestionLoading(el.placeSuggestions, `Finding "${toText}"…`);
  let toResults = [];
  try {
    toResults = await resolveTextOrQuickPlace(toText, searchOpts(toText));
  } catch (err) {
    if (isStale()) return;
  }
  if (isStale()) return;

  hideSuggestionList(el.placeSuggestions);
  // A side resolved to live GPS gets a clearer label than the raw "me"/"my location" text.
  const fromDisplay = fromResults[0]?.label === CURRENT_LOCATION_LABEL ? 'My current GPS location' : fromText;
  const toDisplay = toResults[0]?.label === CURRENT_LOCATION_LABEL ? 'My current GPS location' : toText;
  el.placeInput.value = (fromResults.length || toResults.length) ? `${fromDisplay} to ${toDisplay}` : '';
  // Clean slate — goToDirections only touches state.from/to when given a truthy value, which would otherwise leave stale data.
  state.from = null;
  state.to = null;
  goToDirections({ from: fromResults[0], to: toResults[0] });

  if (!fromResults.length && !toResults.length) {
    showStatus(`Could not find "${fromText}" or "${toText}" — fill in both to continue.`, 'error');
  } else if (!fromResults.length) {
    showStatus(`Could not find "${fromText}" — fill in the starting point.`, 'error');
  } else if (!toResults.length) {
    showStatus(`Could not find "${toText}" — fill in the destination.`, 'error');
  } else {
    el.planBtn.click();
  }
}

setupAutocomplete(el.placeInput, el.placeSuggestions, selectPlace, { onDirectionsShortcut: handlePlaceToPlaceDirections });

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

// [data-category], not the broader .chip — "Open now" is a filter toggle (see createOpenNowToggleRow), not a chip here.
el.categoryChips.querySelectorAll('.chip[data-category]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const tag = CHIP_CATEGORY_TAGS[btn.dataset.category];
    const label = btn.dataset.label;
    el.placeInput.value = label;
    showSuggestionLoading(el.placeSuggestions);
    try {
      // Search around the current map view, not GPS — "what's near what I'm looking at".
      const center = map.getCenter();
      const rawResults = await categorySearchNear(tag, center.lat, center.lng);
      // Re-filters rawResults already in memory (not a re-fetch) so the "Open now" toggle re-renders instantly.
      const renderFiltered = () => {
        const results = applyOpenNowFilter(decorateWithDistance(rawResults, center.lat, center.lng));
        const onPick = (r) => { clearPoiMarkers(); selectPlace(r); }; // picking one clears the rest of the candidate markers
        showPoiMarkers(results, onPick);
        const emptyMessage = state.filterOpenNow
          ? `No ${label.toLowerCase()} found nearby that are open now.`
          : `No ${label.toLowerCase()} found nearby. Try panning the map or zooming out.`;
        renderSuggestionResults(el.placeSuggestions, el.placeInput, results, onPick, emptyMessage, 'away', renderFiltered);
      };
      renderFiltered();
    } catch (err) {
      hideSuggestionList(el.placeSuggestions);
      showStatus(err.message, 'error');
    }
  });
});

// ---- "Search along the route" (shown once a drive route is planned) ------

/** Leaves the "search along route" results view and goes back to the plain turn-by-turn list. */
function resetToRouteView() {
  el.poiResultsHeader.classList.add('hidden');
  el.poiResultsList.classList.add('hidden');
  el.maneuverList.classList.remove('hidden');
  clearPoiMarkers();
}

el.poiBackBtn.addEventListener('click', goBackInApp);

/** Appends `picked` as a new stop just before the destination and re-plans immediately — modifies the current
 * trip instead of replacing the destination. */
async function addStopFromPoi(picked) {
  forgetBackLayerIfTop(resetToRouteView); // closing by side effect (a pick was made), not via goBackInApp
  resetToRouteView();
  // Fill an already-empty "Add stop" row instead of always appending a new one, which would leave it behind permanently.
  const emptyStopInput = [...el.stopsContainer.querySelectorAll('.stop-row input')]
    .reverse()
    .find((input) => !input._stopPlace && !input.value.trim());
  if (emptyStopInput) {
    hideSuggestionList(emptyStopInput.nextElementSibling);
    emptyStopInput.value = shortLabel(picked);
    emptyStopInput._stopPlace = picked;
    updatePlanningMarkers();
  } else {
    addStopRow(picked);
  }
  showStatus(`Adding ${splitPlaceLabel(picked.label).primary} as a stop…`, 'info', { sticky: true });
  try {
    // Mid-drive, route from where you actually are through only unvisited stops (like triggerReroute); else from the origin through all stops.
    const isMidDrive = state.navigating && state.lastFix;
    const fromPoint = isMidDrive ? { lat: state.lastFix.lat, lon: state.lastFix.lng } : state.from;
    // Mid-drive: slice state.route.stops (what currentLegIndex is relative to), not getStops(); `picked` re-added after slicing.
    const stops = isMidDrive ? [...state.route.stops.slice(state.currentLegIndex), picked] : getStops();
    if (!isMidDrive) state.currentLegIndex = 0; // mid-drive: left alone, the next GPS fix recomputes it against the new route
    const { trip } = await requestRoute(fromPoint, state.to, stops, 0, COSTING_BY_MODE[state.travelMode], { avoidTolls: state.avoidTolls, avoidHighways: state.avoidHighways }); // no alternates — adding a stop already commits you to a specific trip
    state.routeOptions = [trip];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    await renderRoute(trip, { stops, fitView: !isMidDrive }); // mid-drive: camera stays following the puck
    const addedName = splitPlaceLabel(picked.label).primary;
    speak(`Added ${addedName} as a stop.`);
    // picked is stored by reference in state.route.stops, so removeStopMidDrive can match it by identity.
    showStatus(`Added ${addedName} as a stop.`, 'success', { action: { text: 'Remove', onClick: () => removeStopMidDrive(picked) } });
    renderStopsOnTripSection(); // keep the popover's own list in sync if it's still open
  } catch (err) {
    showStatus('Could not add that stop: ' + err.message, 'error');
  }
}

/** Counterpart to addStopFromPoi: same mid-drive-aware stop-list construction, but filters the target out instead of appending. */
async function removeStopMidDrive(stopToRemove) {
  const name = splitPlaceLabel(stopToRemove.label).primary;
  showStatus(`Removing ${name}…`, 'info', { sticky: true });
  try {
    const isMidDrive = state.navigating && state.lastFix;
    const fromPoint = isMidDrive ? { lat: state.lastFix.lat, lon: state.lastFix.lng } : state.from;
    const baseStops = isMidDrive ? state.route.stops.slice(state.currentLegIndex) : getStops();
    const stops = baseStops.filter((s) => s !== stopToRemove);
    if (!isMidDrive) state.currentLegIndex = 0;
    const { trip } = await requestRoute(fromPoint, state.to, stops, 0, COSTING_BY_MODE[state.travelMode], { avoidTolls: state.avoidTolls, avoidHighways: state.avoidHighways });
    state.routeOptions = [trip];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    await renderRoute(trip, { stops, fitView: !isMidDrive });
    speak(`Removed ${name} from your route.`);
    showStatus(`Removed ${name} from your route.`, 'success');
    renderStopsOnTripSection();
  } catch (err) {
    showStatus('Could not remove that stop: ' + err.message, 'error');
  }
}

/** Renders the "Stops on this trip" list in the along-route-search popover, with a remove button per stop.
 * Lists state.route.stops since the stop-row UI is hidden for the whole drive. Hidden entirely when empty. */
function renderStopsOnTripSection() {
  const stops = (state.route && state.route.stops) || [];
  el.routeChipsStops.innerHTML = '';
  el.routeChipsStops.classList.toggle('hidden', stops.length === 0);
  if (!stops.length) return;
  const heading = document.createElement('div');
  heading.className = 'route-chips-stops-heading';
  heading.textContent = 'Stops on this trip';
  el.routeChipsStops.appendChild(heading);
  stops.forEach((stop) => {
    const row = document.createElement('div');
    row.className = 'route-chips-stops-row';
    const label = document.createElement('span');
    label.className = 'route-chips-stops-label';
    label.textContent = splitPlaceLabel(stop.label).primary;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-stop-btn';
    removeBtn.setAttribute('aria-label', `Remove ${splitPlaceLabel(stop.label).primary} from this trip`);
    removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" '
      + 'stroke-width="2.4" stroke-linecap="round"><path d="M5 5 L19 19 M19 5 L5 19"/></svg>';
    removeBtn.addEventListener('click', () => {
      closeRouteChipsPopover();
      removeStopMidDrive(stop);
    });
    row.appendChild(label);
    row.appendChild(removeBtn);
    el.routeChipsStops.appendChild(row);
  });
}

/** Reveals the "search along route" popover positioned above #route-search-btn, computed from its live bounding
 * rect (not a hardcoded offset) since the FAB stack above it varies in height. Tracked on the back-stack. */
function openRouteChipsPopover() {
  renderStopsOnTripSection(); // fresh every open — a stop may have been added/removed since the popover last closed
  const btnRect = el.routeSearchBtn.getBoundingClientRect();
  const bottomOffset = window.innerHeight - btnRect.top + 10;
  el.routeChips.style.bottom = `${bottomOffset}px`;
  // Cap height to the space actually left above it, with a floor so it doesn't collapse on short screens; scrolls internally if needed.
  const availableHeight = window.innerHeight - bottomOffset - 10;
  el.routeChips.style.maxHeight = `${Math.max(availableHeight, 160)}px`;
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

/** Shows/hides the along-route search FAB + popover (only once navigation has started; see #route-chips-inline
 * for the pre-navigation equivalent). Closes the popover too if it's open when the feature is hidden. */
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

/** Shows/hides the live-effort FAB. Walk mode only. */
function showEffortFeature() {
  if (state.travelMode !== 'walk') return;
  el.effortBtn.classList.remove('hidden');
  updateEffortBtnLabel();
}
function hideEffortFeature() {
  el.effortBtn.classList.add('hidden');
}

/** Low/Moderate/High effort read: pace vs. a brisk-walk baseline combined with ascent-per-km, so a hilly walk
 * scores harder than a flat one of the same distance. Ascent bands match elevationDifficultyLabel's thresholds. */
function effortLevel() {
  const NOMINAL_WALK_PACE_MPS = 1.4; // ~5 km/h brisk walk — also the fallback before a real speed is known
  const distM = state.traveledM || 0;
  const paceMps = state.currentSpeedMps ?? NOMINAL_WALK_PACE_MPS;
  const ascentPerKm = distM > 0 ? (state.liveAscentM / (distM / 1000)) : 0;
  let score = paceMps / NOMINAL_WALK_PACE_MPS;
  if (ascentPerKm >= 20) score += 0.6;
  else if (ascentPerKm >= 8) score += 0.3;
  if (score < 0.85) return 'Low';
  if (score < 1.3) return 'Moderate';
  return 'High';
}

function updateEffortBtnLabel() {
  el.effortBtn.setAttribute('aria-label', `Effort level so far: ${effortLevel()}`);
}

el.effortBtn.addEventListener('click', () => {
  showStatus(
    `${effortLevel()} effort · ${formatDistance(state.traveledM || 0)} covered`
    + (state.liveAscentM > 0 ? ` · ↑${formatDistance(state.liveAscentM)} climbed` : ''),
    'info',
  );
});

/** Shows/hides the inline "search along the route" chip row — the pre-navigation equivalent of the FAB+popover above. */
function showRouteChipsInline() {
  el.routeChipsInline.classList.remove('hidden');
}
function hideRouteChipsInline() {
  el.routeChipsInline.classList.add('hidden');
}

/** Before navigation, "along the route" means the whole route. Once navigating, it's sliced from the live GPS
 * position to the destination (visited stops dropped), so results don't surface places already passed and
 * distances read as "ahead of you" rather than "from the start". */
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
    // Essentially at the destination — nothing meaningful to slice.
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
    // Slice state.route.stops (what currentLegIndex is relative to), not getStops().
    waypoints: [currentPoint, ...state.route.stops.slice(state.currentLegIndex), state.to],
  };
}

/** Shared by both chip rows (popover and inline). `isPopover` is the only difference: the popover needs closing before results take over. */
function wireRouteChipButtons(container, { isPopover }) {
  container.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!state.route) return;
      if (isPopover) {
        forgetBackLayerIfTop(closeRouteChipsPopover); // closing by side effect of picking a category, not via goBackInApp
        closeRouteChipsPopover();
      }
      const tag = CHIP_CATEGORY_TAGS[btn.dataset.category];
      const label = btn.dataset.label;
      const scope = routeSearchScope();

      el.poiResultsLabel.textContent = state.navigating ? `${label} ahead` : `${label} along your route`;
      el.poiResultsHeader.classList.remove('hidden');
      el.maneuverList.classList.add('hidden');
      el.bottomSheet.classList.remove('half');
      el.bottomSheet.classList.add('expanded');
      pushBackLayer(resetToRouteView);
      showSuggestionLoading(el.poiResultsList);

      try {
        const rawResults = await categorySearchAlongRoute(tag, scope.coords, scope.totalDistM, scope.waypoints);
        // Same instant-re-filter-in-place pattern as the idle-mode category chips above.
        const renderFiltered = () => {
          const results = applyOpenNowFilter(decorateWithRouteDistance(rawResults, scope.lineFeature));
          const onPick = (r) => { clearPoiMarkers(); addStopFromPoi(r); };
          showPoiMarkers(results, onPick);
          const noneFoundText = state.filterOpenNow
            ? `No ${label.toLowerCase()} found ${state.navigating ? 'ahead' : 'along this route'} that are open now.`
            : `No ${label.toLowerCase()} found ${state.navigating ? 'ahead' : 'along this route'}.`;
          renderSuggestionResults(
            el.poiResultsList, null, results, onPick,
            noneFoundText,
            state.navigating ? 'ahead' : 'along your route',
            renderFiltered,
          );
        };
        renderFiltered();
      } catch (err) {
        hideSuggestionList(el.poiResultsList);
        showStatus(err.message, 'error');
      }
    });
  });
}
wireRouteChipButtons(el.routeChips, { isPopover: true });
wireRouteChipButtons(el.routeChipsInline, { isPopover: false });

/** Switches the search card between single-search and directions-editor view. Doesn't touch the back-stack itself — callers decide that. */
function setPlanningUiMode(mode) {
  const isSimple = mode === 'simple';
  el.searchSimple.classList.toggle('hidden', !isSimple);
  el.searchDirections.classList.toggle('hidden', isSimple);
  if (!isSimple) {
    el.placeCard.classList.add('hidden');
    refreshWeatherBadge(); // place card just went away outside the normal hidePlaceCard() path — re-evaluate so a stale badge doesn't linger
  }
}

/** Just the primary part of a place's label, or '' if there's no place. */
function shortLabel(place) {
  return place ? splitPlaceLabel(place.label).primary : '';
}

/** One-line summary shown instead of the full from/to/stops editor once a route is planned and expanded —
 * "Walking from X to Y" / "Driving from X to Y via Z, W". */
function buildRouteSummarySentence() {
  if (!state.from || !state.to) return '';
  const verb = { drive: 'Driving', walk: 'Walking', transit: 'Taking transit' }[state.travelMode] || 'Route';
  let sentence = `${verb} from ${shortLabel(state.from)} to ${shortLabel(state.to)}`;
  const stops = getStops();
  if (stops.length) sentence += ` via ${stops.map((s) => shortLabel(s)).join(', ')}`;
  return sentence;
}

/** Collapses the search card to a one-line summary while the bottom sheet is expanded, so they don't fight over
 * screen space. Driven by a MutationObserver on #bottom-sheet's class list rather than threading a call through
 * every place that toggles .expanded. */
function syncDirectionsCollapse() {
  const hasRoute = !!(state.route || state.transitItinerary);
  const shouldCollapse = hasRoute
    && (el.bottomSheet.classList.contains('expanded') || el.bottomSheet.classList.contains('half'))
    && !el.searchDirections.classList.contains('hidden');
  if (shouldCollapse) el.directionsSummaryRow.textContent = buildRouteSummarySentence();
  el.searchDirections.classList.toggle('directions-collapsed', shouldCollapse);
}

new MutationObserver(syncDirectionsCollapse).observe(el.bottomSheet, { attributes: true, attributeFilter: ['class'] });

el.directionsSummaryRow.addEventListener('click', () => {
  el.bottomSheet.classList.remove('expanded', 'half');
});

/** Leaving directions mode always means "return to simple search", restoring the destination place card if there was one. */
function leaveDirectionsMode() {
  setPlanningUiMode('simple');
  if (state.to) {
    el.placeInput.value = shortLabel(state.to);
    showPlaceCard(state.to);
    pushBackLayer(closePlaceCard); // this popstate consumed the directions layer; the place card it reveals is a new closeable layer of its own
  }
}

function goToDirections({ from, to } = {}) {
  // Entering directions mode cancels any in-progress Home/Work pick, so it can't hijack the next place selected.
  state.pendingQuickPlaceKind = null;
  forgetBackLayerIfTop(cancelQuickPlacePick);
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
// Favorites & recent trips — shown in a field's suggestions dropdown on focus-when-empty, vanish once you type. See showQuickPicksFor() below.
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

/** One row in a suggestions dropdown for a recent trip or favorite: icon + label, plus a delete button. Reuses the `.result-item`/`.save-btn` layout. */
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
      onSelect: async () => {
        listEl.classList.add('hidden');
        // A saved "Your location" side is a frozen GPS snapshot — re-resolve it to where you actually are now.
        const usesCurrentLocation = trip.originLabel === CURRENT_LOCATION_LABEL || trip.destLabel === CURRENT_LOCATION_LABEL;
        if (usesCurrentLocation) showStatus('Finding your location…', 'info', { sticky: true });
        const [from, to] = await Promise.all([
          resolvePlaceForReuse(trip.originLabel, trip.originLat, trip.originLon),
          resolvePlaceForReuse(trip.destLabel, trip.destLat, trip.destLon),
        ]);
        if (usesCurrentLocation) clearStatus();
        goToDirections({ from, to });
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

/** Focus handler shared by the search box and from/to fields; only shown when the field is genuinely empty.
 * `locationOptionSide` controls whether/which "Use my current location" row is prepended — see useCurrentLocationFor. */
async function showQuickPicksFor(inputEl, listEl, { locationOptionSide = null } = {}) {
  if (inputEl.value.trim()) return;
  const render = () => showQuickPicksFor(inputEl, listEl, { locationOptionSide });

  listEl.innerHTML = '';
  if (locationOptionSide) {
    const li = document.createElement('li');
    li.className = 'quick-option';
    li.innerHTML = `${locationPinIcon()}<span>Use my current location</span>`;
    li.addEventListener('click', () => useCurrentLocationFor(locationOptionSide));
    listEl.appendChild(li);
  }
  await appendQuickPicks(listEl, render);

  if (listEl.children.length) showSuggestionList(listEl);
}

/** Fetches a fresh GPS fix into `inputEl`, then hands the resulting place to `apply`. Shared by the from/to and search-box quick picks. */
function useCurrentLocationInto(inputEl, suggestionsEl, apply) {
  hideSuggestionList(suggestionsEl); // not a direct classList toggle — needs to forgetBackLayerIfTop() too, see showSuggestionList
  if (!('geolocation' in navigator)) {
    showStatus('This browser does not support GPS location.', 'error');
    return;
  }
  showStatus('Finding your location…', 'info', { sticky: true });
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const place = { label: CURRENT_LOCATION_LABEL, lat: pos.coords.latitude, lon: pos.coords.longitude };
      inputEl.value = CURRENT_LOCATION_LABEL;
      apply(place);
      clearStatus();
    },
    () => showStatus('Could not get your location. Check location permissions.', 'error'),
    CONFIG.GEOLOCATION_OPTIONS,
  );
}

/** `side` is 'from'/'to' or 'search'; pins the current GPS location as the picked place. */
function useCurrentLocationFor(side) {
  if (side === 'search') {
    useCurrentLocationInto(el.placeInput, el.placeSuggestions, (place) => selectPlace(place));
    return;
  }
  const inputEl = side === 'from' ? el.fromInput : el.toInput;
  const suggestionsEl = side === 'from' ? el.fromSuggestions : el.toSuggestions;
  useCurrentLocationInto(inputEl, suggestionsEl, (place) => {
    if (side === 'from') state.from = place; else state.to = place;
    updatePlanningMarkers();
  });
}

/** Re-resolves a "Your location" recent-trip side to a fresh GPS fix instead of replaying the frozen saved snapshot.
 * Never rejects — falls back to the stored snapshot on GPS failure. */
function resolvePlaceForReuse(label, lat, lon) {
  if (label !== CURRENT_LOCATION_LABEL || !('geolocation' in navigator)) {
    return Promise.resolve({ label, lat, lon });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ label, lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ label, lat, lon }),
      CONFIG.GEOLOCATION_OPTIONS,
    );
  });
}

el.placeInput.addEventListener('focus', () => showQuickPicksFor(el.placeInput, el.placeSuggestions, { locationOptionSide: 'search' }));
el.toInput.addEventListener('focus', () => showQuickPicksFor(el.toInput, el.toSuggestions, { locationOptionSide: 'to' }));
el.fromInput.addEventListener('focus', () => showQuickPicksFor(el.fromInput, el.fromSuggestions, { locationOptionSide: 'from' }));

// ---- Long-press on the map: show what's at that point ---------------------
let longPressTimer = null;
let longPressStartPoint = null;
let longPressMarker = null;
let longPressMarkerTimer = null;

// Suppresses the synthetic mousedown/mouseup the browser fires after a real touch, which would otherwise
// restart a second long-press timer right after touchend correctly cancelled the first.
let suppressMouseUntil = 0;

function cancelLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressStartPoint = null;
}

map.on('mousedown', (e) => startLongPress(e, false));
map.on('touchstart', (e) => startLongPress(e, true));
map.on('mousemove', (e) => moveLongPress(e, false));
map.on('touchmove', (e) => moveLongPress(e, true));
map.on('mouseup', cancelLongPress);
map.on('touchend', cancelLongPress);
map.on('dragstart', cancelLongPress);

function startLongPress(e, isTouch) {
  if (state.navigating) return; // don't let a bump while driving pop up a location lookup
  if (isTouch) {
    if (e.originalEvent.touches.length > 1) return; // a second finger already down — this is a pinch/rotate gesture, not a held tap
    suppressMouseUntil = Date.now() + 1000;
  } else if (Date.now() < suppressMouseUntil) {
    return; // this "mousedown" is just the browser's synthetic echo of the touch above
  }
  longPressStartPoint = e.point;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    handleLongPress(e.lngLat);
  }, 4000); // long enough that an ordinary tap-and-hold to inspect the map never accidentally drops a pin
}
function moveLongPress(e, isTouch) {
  if (!longPressTimer || !longPressStartPoint) return;
  // Catches a second finger landing mid-hold (e.g. a pinch-zoom starting after this touch began).
  if (isTouch && e.originalEvent.touches.length > 1) { cancelLongPress(); return; }
  const dx = e.point.x - longPressStartPoint.x;
  const dy = e.point.y - longPressStartPoint.y;
  if (Math.hypot(dx, dy) > 10) cancelLongPress(); // a real drag/pan, not a held tap
}

/** Reverse-geocodes a long-press point and hands it to usePinnedPlace. Drops a marker as a visual cue that clears itself after a while. */
async function handleLongPress(lngLat) {
  showStatus('Looking up this location…', 'info', { sticky: true });
  let label = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  try {
    const res = await fetchWithTimeout(`${CONFIG.NOMINATIM_URL}/reverse?format=jsonv2&lat=${lngLat.lat}&lon=${lngLat.lng}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) label = data.display_name;
      else resolverDebugLog('Reverse geocode: no display_name in response — using raw coordinates.', 'warn');
    } else {
      resolverDebugLog(`Reverse geocode: returned HTTP ${res.status} — using raw coordinates.`, 'warn');
    }
  } catch (err) {
    // Offline or unreachable: fall back to the raw coordinates label already set above.
    resolverDebugLog(`Reverse geocode: request failed — ${err.message} — using raw coordinates.`, 'warn');
  }

  if (longPressMarker) longPressMarker.remove();
  longPressMarker = new maplibregl.Marker({ element: createPinElement('#9aabc2', 'Location'), anchor: 'bottom' })
    .setLngLat(lngLat).addTo(map);
  const timeoutMs = 4000;
  clearTimeout(longPressMarkerTimer);
  longPressMarkerTimer = setTimeout(() => {
    if (longPressMarker) { longPressMarker.remove(); longPressMarker = null; }
  }, timeoutMs);

  clearStatus();
  usePinnedPlace({ label, lat: lngLat.lat, lon: lngLat.lng });
}

/** If neither from/to is set, treats the pin like a plain search result. If either is already set, sets it as
 * the destination (overwriting an existing one on purpose). */
function usePinnedPlace(picked) {
  if (!state.from && !state.to) {
    el.placeInput.value = splitPlaceLabel(picked.label).primary;
    selectPlace(picked);
    return;
  }

  state.to = picked;
  el.toInput.value = shortLabel(picked);
  updatePlanningMarkers();
  el.planBtn.classList.remove('hidden');
  showStatus(`Destination set to ${shortLabel(picked)}.`, 'success');
}

// ============================================================================
// Saved places — browsable "Saved" screen with renameable lists, Google-Maps-style.
// All save entry points funnel through openSaveToListPrompt.
// ============================================================================

function folderIcon() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6 a1 1 0 0 1 1-1 h5 l2 2 h9 a1 1 0 0 1 1 1 v10 '
    + 'a1 1 0 0 1-1 1 H4 a1 1 0 0 1-1-1 Z"/></svg>';
}
function pencilIcon() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M4 20 l0.8-4 L16 4.8 a1.5 1.5 0 0 1 2 0 l1.2 1.2 a1.5 1.5 0 0 1 0 2 L8 19.2 Z M14 6.8 L17.2 10"/></svg>';
}
function homeIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M4 11 L12 4 L20 11 V20 a1 1 0 0 1-1 1 H5 a1 1 0 0 1-1-1 Z M9 21 V13 h6 v8"/></svg>';
}
function workIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7 V5 a2 2 0 0 1 2-2 h4 a2 2 0 0 1 2 2 v2 M3 12 h18"/></svg>';
}

// ---- "Which list?" prompt: shared by save actions and by moving a favorite. ----

let saveToListConfirm = null;
let saveToListSelectedId = null;

/** Opens the list-picker for saving/moving `placeLabel`; onConfirm(listId) runs only on Save. */
async function openSaveToListPrompt(placeLabel, preselectedListId, onConfirm) {
  // Close any open suggestions dropdown so it's not left under the prompt.
  [el.placeSuggestions, el.fromSuggestions, el.toSuggestions].forEach(hideSuggestionList);
  el.saveToListPlaceName.textContent = placeLabel;
  let lists = [];
  try {
    lists = await getLists();
    if (!lists.length) { await addList({ name: 'Favorites' }); lists = await getLists(); }
  } catch (err) {
    showStatus('Could not load your lists: ' + err.message, 'error');
  }
  saveToListSelectedId = (preselectedListId != null && lists.some((l) => l.id === preselectedListId))
    ? preselectedListId
    : (lists[0] ? lists[0].id : null);
  renderSaveToListOptions(lists);
  el.saveToListNewName.value = '';
  saveToListConfirm = onConfirm;
  if (el.saveToListPrompt.classList.contains('hidden')) pushBackLayer(closeSaveToListPrompt);
  el.saveToListPrompt.classList.remove('hidden');
}
function closeSaveToListPrompt() {
  el.saveToListPrompt.classList.add('hidden');
}
function renderSaveToListOptions(lists) {
  el.saveToListOptions.innerHTML = '';
  lists.forEach((list) => {
    const li = document.createElement('li');
    li.className = list.id === saveToListSelectedId ? 'selected' : '';
    li.innerHTML = `<span class="radio-dot" aria-hidden="true"></span><span>${escapeHtml(list.name)}</span>`;
    li.addEventListener('click', () => {
      saveToListSelectedId = list.id;
      renderSaveToListOptions(lists);
    });
    el.saveToListOptions.appendChild(li);
  });
}
el.saveToListNewBtn.addEventListener('click', async () => {
  const name = el.saveToListNewName.value.trim();
  if (!name) return;
  try {
    const id = await addList({ name });
    saveToListSelectedId = id;
    el.saveToListNewName.value = '';
    renderSaveToListOptions(await getLists());
  } catch (err) {
    showStatus('Could not create that list: ' + err.message, 'error');
  }
});
el.saveToListCancel.addEventListener('click', goBackInApp);
el.saveToListSave.addEventListener('click', () => {
  const confirmFn = saveToListConfirm;
  const listId = saveToListSelectedId;
  goBackInApp(); // closes the prompt
  if (confirmFn && listId != null) confirmFn(listId);
});

// ---- Create/rename-list prompt: reused for both cases. --------------------

let listNamePromptConfirm = null;
function openListNamePrompt(title, initialValue, onConfirm) {
  el.listNamePromptTitle.textContent = title;
  el.listNamePromptInput.value = initialValue;
  listNamePromptConfirm = onConfirm;
  if (el.listNamePrompt.classList.contains('hidden')) pushBackLayer(closeListNamePrompt);
  el.listNamePrompt.classList.remove('hidden');
  el.listNamePromptInput.focus();
}
function closeListNamePrompt() {
  el.listNamePrompt.classList.add('hidden');
}
el.listNamePromptCancel.addEventListener('click', goBackInApp);
el.listNamePromptSave.addEventListener('click', () => {
  const name = el.listNamePromptInput.value.trim();
  if (!name) { showStatus('Enter a list name.', 'error'); return; }
  const confirmFn = listNamePromptConfirm;
  goBackInApp();
  if (confirmFn) confirmFn(name);
});

// ---- The Saved screen: overview of every list, plus per-list detail view. --

let openSavedListId = null; // which list the detail view is currently showing, if any

/** Arms the app to save the next place picked from search as Home/Work instead of routing to it. */
function armQuickPlacePick(kind) {
  state.pendingQuickPlaceKind = kind;
  closeSavedPanelEntirely();
  showStatus(`Search for ${kind === 'home' ? 'home' : 'your workplace'}, then pick a result to set it.`, 'info', { timeoutMs: 6000 });
  el.placeInput.focus();
  // Needs a back-stack entry so a back press can cancel this armed state.
  pushBackLayer(cancelQuickPlacePick);
}
function cancelQuickPlacePick() {
  state.pendingQuickPlaceKind = null;
}

async function renderQuickPlaces() {
  const [home, work] = await Promise.all([
    getQuickPlace('home').catch(() => null),
    getQuickPlace('work').catch(() => null),
  ]);
  el.quickPlacesList.innerHTML = '';
  [
    { kind: 'home', label: 'Home', icon: homeIcon(), place: home },
    { kind: 'work', label: 'Work', icon: workIcon(), place: work },
  ].forEach(({ kind, label, icon, place }) => {
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.className = 'saved-item-body quick-place-body';
    if (place) {
      body.innerHTML = `<span class="quick-place-icon">${icon}</span>`
        + `<span><div class="saved-item-title">${label}</div>`
        + `<div class="saved-item-meta">${escapeHtml(splitPlaceLabel(place.label).primary)}</div></span>`;
      body.addEventListener('click', () => {
        closeSavedPanelEntirely();
        goToDirections({ to: { label: place.label, lat: place.lat, lon: place.lon } });
      });
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-btn small';
      editBtn.setAttribute('aria-label', `Change ${label}`);
      editBtn.innerHTML = pencilIcon();
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); armQuickPlacePick(kind); });
      li.appendChild(body);
      li.appendChild(editBtn);
    } else {
      body.innerHTML = `<span class="quick-place-icon">${icon}</span>`
        + `<span class="saved-item-title quick-place-unset">Add ${label}</span>`;
      body.addEventListener('click', () => armQuickPlacePick(kind));
      li.appendChild(body);
    }
    el.quickPlacesList.appendChild(li);
  });
}

async function renderSavedLists() {
  let lists = [];
  let favorites = [];
  try {
    lists = await getLists();
    if (!lists.length) { await addList({ name: 'Favorites' }); lists = await getLists(); }
    favorites = await getFavorites();
  } catch (err) {
    showStatus('Could not load your saved lists: ' + err.message, 'error');
  }
  el.savedListsList.innerHTML = '';
  lists.forEach((list) => {
    const count = favorites.filter((f) => f.listId === list.id).length;
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.className = 'saved-item-body';
    body.innerHTML = `<div class="saved-item-title">${escapeHtml(list.name)}</div>`
      + `<div class="saved-item-meta">${count} place${count === 1 ? '' : 's'}</div>`;
    body.addEventListener('click', () => openSavedListDetail(list.id));
    li.appendChild(body);
    el.savedListsList.appendChild(li);
  });
}

async function renderSavedListDetail(listId) {
  const lists = await getLists().catch(() => []);
  const list = lists.find((l) => l.id === listId);
  const name = list ? list.name : 'List';
  el.savedListDetailName.textContent = name;
  el.savedPanelTitle.textContent = name;

  let favorites = [];
  try {
    favorites = await getFavorites(listId);
  } catch (err) {
    showStatus('Could not load this list: ' + err.message, 'error');
  }
  el.savedListDetailItems.innerHTML = '';
  if (!favorites.length) {
    el.savedListDetailItems.innerHTML = '<li class="empty">Nothing saved here yet.</li>';
    return;
  }
  favorites.forEach((fav) => {
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.className = 'saved-item-body';
    // A note holds the original Google Maps link, if the place came from one.
    body.innerHTML = `<div class="saved-item-title">${escapeHtml(splitPlaceLabel(fav.name).primary)}</div>`
      + (fav.note ? `<a class="saved-item-link" href="${escapeHtml(fav.note)}" target="_blank" rel="noopener">View on Google Maps ↗</a>` : '');
    body.addEventListener('click', (e) => {
      if (e.target.closest('.saved-item-link')) return; // let the link navigate on its own, not the row
      closeSavedPanelEntirely();
      goToDirections({ to: { label: fav.name, lat: fav.lat, lon: fav.lon } });
    });

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'icon-btn small';
    moveBtn.setAttribute('aria-label', 'Move to another list');
    moveBtn.innerHTML = folderIcon();
    moveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSaveToListPrompt(splitPlaceLabel(fav.name).primary, fav.listId, async (newListId) => {
        try {
          await moveFavoriteToList(fav.id, newListId);
          await renderSavedListDetail(listId);
        } catch (err) {
          showStatus('Could not move this favorite: ' + err.message, 'error');
        }
      });
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn small delete-btn';
    del.setAttribute('aria-label', 'Delete');
    del.innerHTML = trashIcon();
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await deleteFavorite(fav.id);
        await renderSavedListDetail(listId);
      } catch (err) {
        showStatus('Could not delete this favorite: ' + err.message, 'error');
      }
    });

    li.appendChild(body);
    li.appendChild(moveBtn);
    li.appendChild(del);
    el.savedListDetailItems.appendChild(li);
  });
}

function showSavedListsView() {
  openSavedListId = null;
  el.savedListDetailView.classList.add('hidden');
  el.savedListsView.classList.remove('hidden');
  el.savedBackBtn.classList.add('hidden');
  el.savedPanelTitle.textContent = 'Saved places';
}
/** Back-layer close: steps back to the list overview and refreshes its counts. */
function closeSavedListDetail() {
  showSavedListsView();
  renderSavedLists().catch(() => { /* non-critical UI refresh */ });
}
async function openSavedListDetail(listId) {
  openSavedListId = listId;
  pushBackLayer(closeSavedListDetail);
  el.savedListsView.classList.add('hidden');
  el.savedListDetailView.classList.remove('hidden');
  el.savedBackBtn.classList.remove('hidden');
  await renderSavedListDetail(listId);
}

function closeSavedPanel() {
  el.savedPanel.classList.add('hidden');
}
/** Closes the whole Saved screen, including the detail view if it's open on top. */
function closeSavedPanelEntirely() {
  if (!el.savedListDetailView.classList.contains('hidden')) forgetBackLayerIfTop(closeSavedListDetail);
  forgetBackLayerIfTop(closeSavedPanel);
  showSavedListsView();
  closeSavedPanel();
}

el.savedBtn.addEventListener('click', async () => {
  pushBackLayer(closeSavedPanel);
  showSavedListsView();
  el.savedPanel.classList.remove('hidden');
  await Promise.all([renderQuickPlaces(), renderSavedLists()]);
});
el.savedBackBtn.addEventListener('click', goBackInApp);
el.savedCloseBtn.addEventListener('click', () => {
  // Exits the whole screen in one tap, even from inside a list's detail view.
  if (!el.savedListDetailView.classList.contains('hidden')) {
    forgetBackLayerIfTop(closeSavedListDetail);
    showSavedListsView();
  }
  goBackInApp();
});
el.newListBtn.addEventListener('click', () => {
  openListNamePrompt('New list', '', async (name) => {
    try {
      await addList({ name });
      await renderSavedLists();
    } catch (err) {
      showStatus('Could not create that list: ' + err.message, 'error');
    }
  });
});
el.renameListBtn.addEventListener('click', async () => {
  if (openSavedListId == null) return;
  const lists = await getLists().catch(() => []);
  const list = lists.find((l) => l.id === openSavedListId);
  openListNamePrompt('Rename list', list ? list.name : '', async (name) => {
    try {
      await renameList(openSavedListId, name);
      await renderSavedListDetail(openSavedListId);
    } catch (err) {
      showStatus('Could not rename this list: ' + err.message, 'error');
    }
  });
});
el.deleteListDetailBtn.addEventListener('click', async () => {
  if (openSavedListId == null) return;
  try {
    await deleteList(openSavedListId);
    showStatus('List deleted — its saved places moved to your other list.', 'success');
    goBackInApp(); // back to the overview; closeSavedListDetail refreshes counts
  } catch (err) {
    showStatus(err.message, 'error');
  }
});

// ============================================================================
// Help & documentation — static content lives in index.html as <details> rows.
// ============================================================================
el.docsBtn.addEventListener('click', () => {
  pushBackLayer(() => el.docsPanel.classList.add('hidden'));
  el.docsPanel.classList.remove('hidden');
});
el.docsCloseBtn.addEventListener('click', goBackInApp);

el.evViewDetailsBtn.addEventListener('click', () => {
  if (!state.to || !state.to.evDetails) return;
  renderEvDetailsPanel(state.to.label, state.to.evDetails);
  pushBackLayer(() => el.evDetailsPanel.classList.add('hidden'));
  el.evDetailsPanel.classList.remove('hidden');
});
el.evDetailsPanelCloseBtn.addEventListener('click', goBackInApp);
el.tripSummaryCloseBtn.addEventListener('click', goBackInApp);

el.placeCardSaveBtn.addEventListener('click', async () => {
  if (!state.to) return;
  const { label, lat, lon, sourceUrl } = state.to;
  // Places resolved from a pasted Google Maps link default into a dedicated list.
  const preselectedListId = sourceUrl ? await getOrCreateNamedListId('To add to OSM').catch(() => null) : null;
  openSaveToListPrompt(splitPlaceLabel(label).primary, preselectedListId, async (listId) => {
    try {
      // Dedup, since re-tapping Save (there's no "already saved" indicator) used to create a duplicate.
      const existing = await getFavorites(listId);
      if (existing.some((f) => f.lat === lat && f.lon === lon)) {
        showStatus(`"${splitPlaceLabel(label).primary}" is already saved to this list.`, 'info');
        return;
      }
      await addFavorite({ label, lat, lon, listId, note: sourceUrl });
      showStatus('Saved to favorites.', 'success');
    } catch (err) {
      showStatus('Could not save this favorite: ' + err.message, 'error');
    }
  });
});

// ---- Directions view: from/to fields ----
setupAutocomplete(el.fromInput, el.fromSuggestions, (picked) => {
  state.from = picked;
  updatePlanningMarkers();
  el.planBtn.classList.remove('hidden'); // source changed — any route already shown is now stale
});
setupAutocomplete(el.toInput, el.toSuggestions, (picked) => {
  state.to = picked;
  updatePlanningMarkers();
  el.planBtn.classList.remove('hidden'); // destination changed — any route already shown is now stale
});

/** Reverses the visit order of stop rows. */
function reverseStopRows() {
  [...el.stopsContainer.children].reverse().forEach((unit) => el.stopsContainer.appendChild(unit));
}

el.swapBtn.addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  el.fromInput.value = shortLabel(state.from);
  el.toInput.value = shortLabel(state.to);
  reverseStopRows(); // a reversed trip should visit its stops in reverse order too
  updatePlanningMarkers();
  el.planBtn.classList.remove('hidden'); // source/destination just swapped — any route already shown is now stale
});

/** Removes every stop row and marker, so stops from a previous trip don't linger onto a new one. */
function clearStops() {
  // Each row's own teardown must run here too, or a raw innerHTML='' leaks setupAutocomplete's listener.
  el.stopsContainer.querySelectorAll('.stop-unit').forEach((unit) => {
    if (unit._teardownAutocomplete) unit._teardownAutocomplete();
  });
  el.stopsContainer.innerHTML = '';
  updatePlanningMarkers();
}

/** Adds one stop row to the directions card. `prefill` fills it in immediately (restoring a saved
 * trip) instead of leaving it empty and focused. Row + divider live in one `.stop-unit` wrapper
 * so the two always move together. */
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

  const teardownAutocomplete = setupAutocomplete(input, suggestions, (picked) => {
    input._stopPlace = picked || null;
    updatePlanningMarkers();
  });
  // Stored on the row so clearStops() can also release it, not just the remove button.
  unit._teardownAutocomplete = teardownAutocomplete;

  removeBtn.addEventListener('click', () => {
    teardownAutocomplete();
    unit.remove();
    updatePlanningMarkers();
  });
  dragHandle.addEventListener('pointerdown', (e) => startStopDrag(unit, e));

  el.stopsContainer.appendChild(unit);

  if (prefill) {
    input.value = shortLabel(prefill);
    input._stopPlace = prefill;
    updatePlanningMarkers(); // a prefilled stop needs this called explicitly
  } else {
    input.focus();
  }
}

el.addStopBtn.addEventListener('click', () => addStopRow());

/** Pointer-based drag reorder for stop units (HTML5 drag/drop is unreliable on touch).
 * Dragging past the start/destination row promotes this stop to that role via a value swap. */
function startStopDrag(unit, downEvent) {
  downEvent.preventDefault();
  const rect = unit.getBoundingClientRect();
  const startY = downEvent.clientY;
  const startTop = rect.top;
  const input = unit.querySelector('.stop-row input');

  unit.classList.add('stop-unit-dragging');
  unit.style.position = 'fixed';
  unit.style.top = `${startTop}px`;
  unit.style.left = `${rect.left}px`;
  unit.style.width = `${rect.width}px`;

  function clearDropTargetHighlight() {
    el.fromInput.closest('.search-row').classList.remove('stop-drop-target');
    el.toInput.closest('.search-row').classList.remove('stop-drop-target');
  }

  function onMove(e) {
    const dy = e.clientY - startY;
    const newTop = startTop + dy;
    unit.style.top = `${newTop}px`;
    const draggedCenter = newTop + rect.height / 2;

    const promoteTarget = stopDragPromoteTarget(
      draggedCenter,
      el.fromInput.closest('.search-row').getBoundingClientRect(),
      el.toInput.closest('.search-row').getBoundingClientRect(),
    );
    clearDropTargetHighlight();
    if (promoteTarget) {
      el[promoteTarget === 'from' ? 'fromInput' : 'toInput'].closest('.search-row').classList.add('stop-drop-target');
      return; // in a promote zone — don't reorder until dropped
    }

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
    // Must read the position before clearing position:fixed below, or it reflects the in-flow layout instead.
    const draggedRect = unit.getBoundingClientRect();
    const promoteTarget = stopDragPromoteTarget(
      draggedRect.top + draggedRect.height / 2,
      el.fromInput.closest('.search-row').getBoundingClientRect(),
      el.toInput.closest('.search-row').getBoundingClientRect(),
    );
    clearDropTargetHighlight();
    unit.classList.remove('stop-unit-dragging');
    unit.style.position = '';
    unit.style.top = '';
    unit.style.left = '';
    unit.style.width = '';

    if (promoteTarget && !input._stopPlace) {
      showStatus('Pick a place for this stop before dragging it to the start or destination.', 'error');
    } else if (promoteTarget === 'from') {
      const oldFrom = state.from;
      state.from = input._stopPlace;
      el.fromInput.value = shortLabel(state.from);
      input.value = oldFrom ? shortLabel(oldFrom) : '';
      input._stopPlace = oldFrom || null;
      el.planBtn.classList.remove('hidden'); // starting point just changed — any route already shown is now stale
    } else if (promoteTarget === 'to') {
      const oldTo = state.to;
      state.to = input._stopPlace;
      el.toInput.value = shortLabel(state.to);
      input.value = oldTo ? shortLabel(oldTo) : '';
      input._stopPlace = oldTo || null;
      el.planBtn.classList.remove('hidden'); // destination just changed — any route already shown is now stale
    }
    updatePlanningMarkers(); // stop order/from/to may have changed — redraw pins/labels in the new sequence
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ============================================================================
// Routing (Valhalla)
// ============================================================================
const valhallaLimiter = createLimiter(CONFIG.VALHALLA_MIN_INTERVAL_MS);
// Separate limiter: a self-hosted instance has no shared fair-use policy, so it's tuned independently.
const selfHostedValhallaLimiter = createLimiter(CONFIG.SELF_HOSTED_VALHALLA_MIN_INTERVAL_MS);

/** Picks which Valhalla instance to use and enforces its rate limiter. All `points` must fall
 * inside SELF_HOSTED_VALHALLA_COVERAGE_BBOX for the self-hosted server to be tried, since Valhalla
 * can't route across two separate graphs. Returns the proxy path, not the real self-hosted
 * hostname, which is a server-side secret (see lib/valhalla-proxy.js). */
async function valhallaTarget(points) {
  if (!useSelfHostedValhalla) {
    await valhallaLimiter();
    return { base: CONFIG.VALHALLA_URL, selfHosted: false };
  }
  const box = CONFIG.SELF_HOSTED_VALHALLA_COVERAGE_BBOX;
  const allInside = !box || points.every((p) => p.lon >= box.minLon && p.lon <= box.maxLon && p.lat >= box.minLat && p.lat <= box.maxLat);
  if (allInside) {
    await selfHostedValhallaLimiter();
    const base = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
    return { base, selfHosted: true };
  }
  resolverDebugLog(`Valhalla: using the public server (${new URL(CONFIG.VALHALLA_URL).hostname}) — at least one waypoint falls outside SELF_HOSTED_VALHALLA_COVERAGE_BBOX.`, 'warn');
  await valhallaLimiter();
  return { base: CONFIG.VALHALLA_URL, selfHosted: false };
}

/** POSTs `body` to Valhalla's `action` endpoint. If the self-hosted proxy returns 501 (not
 * configured), falls back to the public server; any other self-hosted failure is surfaced as-is.
 * Returns `{ res, selfHosted }`, where `selfHosted` reflects where `res` actually came from. */
async function fetchValhalla(action, points, body) {
  const target = await valhallaTarget(points);
  const doFetch = (url) => fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (target.selfHosted) resolverDebugLog(`Valhalla: attempting self-hosted routing (${action}) for ${points.length} waypoint(s) inside SELF_HOSTED_VALHALLA_COVERAGE_BBOX.`);
  let res;
  let selfHosted = target.selfHosted;
  try {
    res = await doFetch(selfHosted ? `${target.base}/api/valhalla-${action}` : `${target.base}/${action}`);
  } catch (err) {
    resolverDebugLog(`Valhalla: could not reach the ${selfHosted ? 'self-hosted routing proxy' : 'public routing server'} (${err.message || err}).`, 'error');
    throw err;
  }
  if (selfHosted && res.status === 501) {
    resolverDebugLog('Valhalla: self-hosted routing is on but SELF_HOSTED_VALHALLA_URL is not set on this deployment — falling back to the public server.', 'warn');
    await valhallaLimiter();
    try {
      res = await doFetch(`${CONFIG.VALHALLA_URL}/${action}`);
    } catch (err) {
      resolverDebugLog(`Valhalla: could not reach the public routing server either (${err.message || err}).`, 'error');
      throw err;
    }
    selfHosted = false;
    resolverDebugLog(res.ok ? `Valhalla: routed via the public server (fallback) for ${points.length} waypoint(s).` : `Valhalla: public server (fallback) returned HTTP ${res.status}.`, res.ok ? 'success' : 'error');
  } else {
    resolverDebugLog(
      res.ok
        ? `Valhalla: routed via the ${selfHosted ? 'self-hosted' : 'public'} server for ${points.length} waypoint(s).`
        : `Valhalla: ${selfHosted ? 'self-hosted' : 'public'} server returned HTTP ${res.status}.`,
      res.ok ? 'success' : 'error',
    );
  }
  return { res, selfHosted };
}

/** `stops` (optional) are waypoints visited in order between `from` and `to`; Valhalla returns
 * one leg per consecutive pair, and buildRouteState() concatenates them. */
/** Flags routes where Valhalla detours via ferry to reach a point with no drivable road access
 * (common for pedestrianized landmarks, e.g. Gateway of India). Advisory only — route still shows,
 * since a ferry is sometimes genuinely correct. */
function checkRoutePlausibility(trip, from, to, hasStops = false) {
  const straightLineM = turf.distance([from.lon, from.lat], [to.lon, to.lat], { units: 'meters' });
  const routeM = (trip.summary && trip.summary.length ? trip.summary.length * 1000 : 0);
  const hasFerry = !!(trip.summary && trip.summary.has_ferry);
  // Ferry and long-detour get separate messages since a ferry can be legitimate on a long trip.
  // The detour check only applies without stops, since routes with stops are meant to detour.
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

// Session-only cache keyed by the rounded waypoint list, so re-submitting the same trip is instant.
const valhallaCache = new Map();
// FIFO cap so a long session of reroutes doesn't grow this unbounded.
const VALHALLA_CACHE_MAX_ENTRIES = 50;
function capValhallaCache() {
  while (valhallaCache.size > VALHALLA_CACHE_MAX_ENTRIES) {
    valhallaCache.delete(valhallaCache.keys().next().value);
  }
}
function routeCacheKey(from, to, stops, wantAlternates, costing, avoidTolls, avoidHighways) {
  return JSON.stringify([costing, wantAlternates, !!avoidTolls, !!avoidHighways, ...[from, ...stops, to].map((p) => [p.lat.toFixed(5), p.lon.toFixed(5)])]);
}

// Maps state.travelMode to Valhalla's costing model name.
const COSTING_BY_MODE = { drive: 'auto', walk: 'pedestrian' };

/** Builds costing_options for 'auto' only (pedestrian doesn't accept them). All penalties here
 * are soft, not hard exclusions: use_ferry/service/alley are always-on car-routing defaults,
 * while avoidTolls/avoidHighways are user-toggleable. */
function costingOptionsFor(costing, { avoidTolls, avoidHighways } = {}) {
  if (costing !== 'auto') return undefined;
  return {
    auto: {
      use_ferry: 0,
      service_penalty: 90,
      service_factor: 1.4,
      alley_factor: 1.4,
      ...(avoidHighways ? { use_highways: 0 } : {}),
      ...(avoidTolls ? { toll_booth_penalty: 43200 } : {}),
    },
  };
}

/** Filters out Valhalla alternates that are near-duplicates or dramatically worse with no
 * distinguishing benefit (tolls/highway/ferry). */
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

/** `wantAlternates` (0 by default) asks for extra route choices; only used for the initial plan,
 * not reroutes. Always returns `{ trip, alternates }` with a consistent shape. */
async function requestRoute(from, to, stops = [], wantAlternates = 0, costing = 'auto', avoidOpts = {}) {
  // excludePolygon is a one-off tied to current congestion, not part of the cache key, so bypass the cache for it.
  const cacheKey = routeCacheKey(from, to, stops, wantAlternates, costing, avoidOpts.avoidTolls, avoidOpts.avoidHighways);
  const useCache = !avoidOpts.excludePolygon;
  if (useCache && valhallaCache.has(cacheKey)) return valhallaCache.get(cacheKey);

  const waypoints = [from, ...stops, to];
  const body = {
    // heading/heading_tolerance (see triggerReroute) snap to the edge facing travel direction,
    // avoiding a spurious U-turn maneuver on reroute.
    locations: waypoints.map((p) => (
      p.heading != null ? { lat: p.lat, lon: p.lon, heading: p.heading, heading_tolerance: p.heading_tolerance } : { lat: p.lat, lon: p.lon }
    )),
    costing,
    units: 'kilometers',
  };
  // use_ferry: 0 is a soft penalty; a destination with no drivable access can still resolve to
  // a ferry route (see checkRoutePlausibility for catching that).
  const costingOptions = costingOptionsFor(costing, avoidOpts);
  if (costingOptions) body.costing_options = costingOptions;
  if (wantAlternates > 0) body.alternates = wantAlternates;
  // buildExcludePolygon's ring of [lon, lat] pairs forces a path around roads Valhalla would
  // otherwise consider (its own alternates are traffic-blind).
  if (avoidOpts.excludePolygon) body.exclude_polygons = [avoidOpts.excludePolygon];
  let res;
  try {
    // text/plain avoids a CORS preflight; a self-hosted server with no reverse proxy in front
    // doesn't implement OPTIONS and would fail outright on a preflighted request.
    ({ res } = await fetchValhalla('route', waypoints, body));
  } catch (err) {
    resolverDebugLog(`Routing: request failed — ${err.message}`, 'error');
    throw new Error(err.name === 'AbortError'
      ? 'The routing service is taking too long to respond. Try again in a moment.'
      : 'Could not reach the routing service. Check your connection or the Valhalla server address.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch (_) { /* ignore parse failure */ }
    resolverDebugLog(`Routing: service returned HTTP ${res.status}${detail ? ' — ' + detail : ''}.`, 'error');
    throw new Error(detail || `The routing service returned an error (HTTP ${res.status}).`);
  }
  const data = await res.json();
  if (!data.trip || !data.trip.legs || !data.trip.legs.length) {
    resolverDebugLog('Routing: response had no usable trip/legs.', 'error');
    throw new Error('No route could be found between those two points.');
  }
  const rawAlternates = (data.alternates || []).map((a) => a.trip);
  const alternates = wantAlternates > 0 ? filterMeaningfulAlternates(data.trip, rawAlternates) : [];
  resolverDebugLog(`Routing: found ${data.trip.summary.length.toFixed(1)}km route (${alternates.length} alternate(s)).`, 'success');
  const result = { trip: data.trip, alternates };
  if (useCache) {
    valhallaCache.set(cacheKey, result);
    capValhallaCache();
  }
  return result;
}

// ============================================================================
// Elevation profile (walk mode only) — a separate call to Valhalla's /height,
// since /route doesn't return elevation. Never blocks route planning.
// ============================================================================

/** Evenly downsamples a route's [lng,lat] coords to at most maxPoints, so the request body
 * isn't oversized. Used for both /height and /trace_attributes. */
function sampleCoords(coords, maxPoints) {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const sampled = [];
  for (let i = 0; i < maxPoints; i++) sampled.push(coords[Math.round(i * step)]);
  return sampled;
}

/** True when every height in `rangeHeight` is identical — the shape returned when a Valhalla
 * server has no elevation data loaded. Only meaningful on a self-hosted answer. */
function isDegenerateElevation(rangeHeight) {
  const first = rangeHeight[0][1];
  return rangeHeight.every((p) => p[1] === first);
}

/** Returns Valhalla's range_height pairs: [[cumulativeDistM, heightM], ...]. Throws on any
 * failure — callers must treat that as "no chart", never a user-facing error. If a self-hosted
 * server's elevation data looks flat/missing, retries against the public server instead of
 * showing a misleadingly flat chart. */
async function fetchElevationProfile(coords) {
  const shape = sampleCoords(coords, CONFIG.ELEVATION_MAX_POINTS).map(([lon, lat]) => ({ lat, lon }));
  const { res, selfHosted } = await fetchValhalla('height', shape, { range: true, shape });
  if (!res.ok) throw new Error(`Elevation service returned HTTP ${res.status}.`);
  const data = await res.json();
  if (!data.range_height || !data.range_height.length) {
    resolverDebugLog('Valhalla: elevation response had no range_height data.', 'error');
    throw new Error('No elevation data returned.');
  }
  if (selfHosted && isDegenerateElevation(data.range_height)) {
    try {
      resolverDebugLog('Valhalla: self-hosted elevation came back completely flat (likely built without elevation data) — retrying this chart only against the public server.', 'warn');
      await valhallaLimiter();
      const publicRes = await fetchWithTimeout(`${CONFIG.VALHALLA_URL}/height`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ range: true, shape }),
      });
      if (publicRes.ok) {
        const publicData = await publicRes.json();
        if (publicData.range_height && publicData.range_height.length) return publicData.range_height;
      }
    } catch (_) { /* keep the flat self-hosted result rather than losing the chart entirely */ }
  }
  return data.range_height;
}

/** Returns a [{startM, speedLimitKmh, isGuessed}, ...] profile via Valhalla's /trace_attributes,
 * the only action carrying OSM `maxspeed` data. `shape_match: 'edge_walk'` snaps onto the exact
 * edges this route already used rather than re-guessing a path. Every field read is defensive
 * (fails safe, sign just doesn't show) since this hasn't been verified against a live response.
 * Returns null, not a thrown error, when nothing usable comes back. */
async function fetchSpeedLimitProfile(coords) {
  const sampled = sampleCoords(coords, CONFIG.SPEED_LIMIT_MAX_POINTS);
  const shape = sampled.map(([lon, lat]) => ({ lat, lon }));
  const { res } = await fetchValhalla('trace_attributes', shape, { shape, shape_match: 'edge_walk', costing: 'auto' });
  if (!res.ok) throw new Error(`Speed limit service returned HTTP ${res.status}.`);
  const data = await res.json();
  const edges = data.edges;
  if (!Array.isArray(edges) || !edges.length) throw new Error('No edge attributes returned.');

  // Cumulative distance per sampled point, indexed the same way as edge_walk's shape indices,
  // so it can be compared directly against live traveledM (see onPositionUpdate).
  const cumDistM = [0];
  for (let i = 1; i < sampled.length; i++) {
    cumDistM.push(cumDistM[i - 1] + turf.distance(sampled[i - 1], sampled[i], { units: 'meters' }));
  }

  const profile = [];
  edges.forEach((edge) => {
    const speedLimitKmh = typeof edge.speed_limit === 'number' ? edge.speed_limit : null;
    if (speedLimitKmh == null) return; // no posted/known limit for this edge — nothing to show
    const beginIdx = edge.begin_shape_index;
    if (typeof beginIdx !== 'number' || beginIdx < 0 || beginIdx >= cumDistM.length) return;
    profile.push({
      startM: cumDistM[beginIdx],
      speedLimitKmh,
      // 'tagged' is a real posted OSM maxspeed; anything else is Valhalla's guess (de-emphasized in the UI).
      isGuessed: edge.speed_type !== 'tagged',
    });
  });
  profile.sort((a, b) => a.startM - b.startM);
  return profile.length ? profile : null;
}

/** Fire-and-forget: fetches speed limits for the current route and stores them if it's still current. */
function updateSpeedLimitProfileForRoute() {
  const myRoute = state.route;
  fetchSpeedLimitProfile(myRoute.coords)
    .then((profile) => {
      if (state.route !== myRoute || state.travelMode !== 'drive') return; // stale
      myRoute.speedLimitProfile = profile;
    })
    .catch((err) => {
      resolverDebugLog(`Speed limits: failed to fetch — ${err.message}`, 'warn');
    });
}

/** Step-function lookup: the last speed-limit segment whose startM is at or before distM —
 * unlike interpolateHeightM, a speed limit is constant per segment, not smoothly interpolated. */
function speedLimitAt(profile, distM) {
  let current = null;
  for (const seg of profile) {
    if (seg.startM > distM) break;
    current = seg;
  }
  return current;
}

/** Ramer-Douglas-Peucker polyline simplification, used to reduce raw elevation samples down to
 * the handful of points where the profile's shape actually changes, for tappable markers. */
function perpendicularDistance(pt, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
  const t = ((pt.x - lineStart.x) * dx + (pt.y - lineStart.y) * dy) / (dx * dx + dy * dy);
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  return Math.hypot(pt.x - projX, pt.y - projY);
}
function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let splitIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; splitIndex = i; }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, splitIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(splitIndex), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/** Picks interior points (excludes start/end) where the chart's shape actually changes, capped
 * to a small count, widening tolerance if needed. Works in pixel space so "significant" matches
 * what a viewer would see as a bend in the line, not raw distance/height which differ in scale. */
const ELEVATION_MAX_SIGNIFICANT_POINTS = 6;
function findSignificantPointIndices(pixelPoints, maxCount) {
  let tolerance = 2;
  let simplified = pixelPoints;
  for (let attempt = 0; attempt < 6; attempt++) {
    simplified = douglasPeucker(pixelPoints, tolerance);
    if (simplified.length - 2 <= maxCount) break;
    tolerance *= 1.8;
  }
  return simplified.slice(1, -1).map((p) => p.i);
}

/** Quadratic-bezier "midpoint smoothing" — a continuously-smooth curve that still tracks the
 * original polyline closely, without pulling in a spline library for one chart. */
function smoothPathD(points) {
  if (points.length < 3) return `M${points.map((p) => p.join(',')).join(' L')}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${cx},${cy} ${(cx + nx) / 2},${(cy + ny) / 2}`;
  }
  const last = points[points.length - 1];
  d += ` L${last[0]},${last[1]}`;
  return d;
}

/** Builds the chart's SVG (smoothed line + fill) plus the list of tappable
 * "significant point" positions, all in one pass so both share the exact
 * same coordinate mapping. Coordinates are returned as percentages (of the
 * chart's own box) rather than raw viewBox units — the dot buttons/guideline are plain positioned
 * HTML, and the SVG's non-uniform preserveAspectRatio scaling would distort anything inside it. */
function buildElevationChart(rangeHeight, minH, maxH) {
  const totalDist = rangeHeight[rangeHeight.length - 1][0] || 1;
  const span = Math.max(maxH - minH, 10); // floor avoids a divide-by-zero on flat terrain
  const toXY = ([d, h]) => [(d / totalDist) * 300, 60 - ((h - minH) / span) * 54];
  const pixelPoints = rangeHeight.map(([d, h], i) => {
    const [x, y] = toXY([d, h]);
    return { x, y, i };
  });
  const pathPoints = pixelPoints.map((p) => [p.x, p.y]);
  const linePath = smoothPathD(pathPoints);
  const lastX = pathPoints[pathPoints.length - 1][0];
  const areaPath = `${linePath} L${lastX},60 L0,60 Z`;
  const svgHtml = `<svg viewBox="0 0 300 64" preserveAspectRatio="none">
    <path d="${areaPath}" fill="var(--accent)" fill-opacity="0.18" stroke="none"/>
    <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2"/>
  </svg>`;

  const points = findSignificantPointIndices(pixelPoints, ELEVATION_MAX_SIGNIFICANT_POINTS).map((i) => ({
    xPct: (pixelPoints[i].x / 300) * 100,
    yPct: (pixelPoints[i].y / 64) * 100,
    distM: rangeHeight[i][0],
    heightM: rangeHeight[i][1],
  }));
  // Pre-select the highest point by default — usually the most interesting one.
  const defaultActive = points.length ? points.reduce((best, p) => (p.heightM > best.heightM ? p : best), points[0]) : null;

  return { svgHtml, points, defaultActive, totalDist };
}

/** A plain-language read on how hilly the route is. Thresholds are rough per-km ascent bands,
 * not a rigorous grade calculation. */
function elevationDifficultyLabel(ascentM, totalDistM) {
  if (!totalDistM) return 'Flat';
  const ascentPerKm = ascentM / (totalDistM / 1000);
  if (ascentPerKm < 8) return 'Mostly flat';
  if (ascentPerKm < 20) return 'Some hills';
  return 'Steep in parts';
}

/** Marker dropped on the route showing where a tapped elevation-chart point
 * actually is — a small ring+dot, distinct from stop pins/POI dots. */
function createElevationHighlightElement() {
  const div = document.createElement('div');
  div.className = 'elevation-highlight-marker';
  div.setAttribute('aria-hidden', 'true');
  div.innerHTML = '<span class="elevation-highlight-ring"></span><span class="elevation-highlight-dot"></span>';
  return div;
}

/** Walks the route's full-resolution line geometry to find where a tapped chart point really is,
 * regardless of how heavily the elevation samples were downsampled for /height. */
function highlightElevationPointOnMap(distM) {
  if (!state.route || !state.route.lineFeature) return;
  const clamped = Math.min(Math.max(distM, 0), state.route.totalDistM);
  const point = turf.along(state.route.lineFeature, clamped / 1000, { units: 'kilometers' });
  const [lng, lat] = point.geometry.coordinates;
  if (state.elevationHighlightMarker) {
    state.elevationHighlightMarker.setLngLat([lng, lat]);
  } else {
    // setLngLat before addTo — addTo-then-setLngLat leaves the marker stuck at (0,0).
    state.elevationHighlightMarker = new maplibregl.Marker({ element: createElevationHighlightElement(), anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);
  }
}

function clearElevationHighlightMarker() {
  if (state.elevationHighlightMarker) { state.elevationHighlightMarker.remove(); state.elevationHighlightMarker = null; }
}

function renderElevationProfile(rangeHeight) {
  const heights = rangeHeight.map((p) => p[1]);
  const { ascentM: ascent, descentM: descent } = computeAscentDescent(rangeHeight);
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const totalDistM = rangeHeight[rangeHeight.length - 1][0];
  const tag = elevationDifficultyLabel(ascent, totalDistM);
  const chart = buildElevationChart(rangeHeight, minH, maxH);

  const dotsHtml = chart.points
    .map((p, idx) => `<button type="button" class="elevation-point" data-idx="${idx}"
      style="left:${p.xPct.toFixed(1)}%; top:${p.yPct.toFixed(1)}%" aria-label="Show this point on the map"></button>`)
    .join('');

  // Evenly spaced distance ticks, skipping 0 itself (that's just "Start", not informative).
  const TICK_COUNT = 5;
  const axisHtml = Array.from({ length: TICK_COUNT }, (_, i) => {
    const dist = (chart.totalDist * (i + 1)) / (TICK_COUNT + 1);
    return `<span>${formatDistance(dist)}</span>`;
  }).join('');

  el.elevationProfile.innerHTML = `<div class="elevation-title">Elevation</div>
    <div class="elevation-summary">
      <span class="elevation-tag">${tag}</span>
      <span>↑ ${formatDistance(ascent)} &nbsp; ↓ ${formatDistance(descent)}</span>
    </div>
    <div class="elevation-chart-frame">
      <div class="elevation-chart">${chart.svgHtml}${dotsHtml}</div>
      <div class="elevation-axis">${axisHtml}</div>
      <div class="elevation-guideline hidden"></div>
      <div class="elevation-point-label hidden"></div>
    </div>`;
  el.elevationProfile.classList.remove('hidden');
  // This chart renders after the route's peek height was already measured, so re-measure now or it gets clipped.
  updateSheetPeekHeight();

  const frame = el.elevationProfile.querySelector('.elevation-chart-frame');
  const guideline = frame.querySelector('.elevation-guideline');
  const label = frame.querySelector('.elevation-point-label');

  function selectPoint(idx) {
    const p = chart.points[idx];
    frame.querySelectorAll('.elevation-point.active').forEach((b) => b.classList.remove('active'));
    frame.querySelector(`.elevation-point[data-idx="${idx}"]`).classList.add('active');
    guideline.style.left = `${p.xPct}%`;
    guideline.classList.remove('hidden');
    label.style.left = `${p.xPct}%`;
    label.style.top = `${p.yPct}%`;
    label.textContent = `${Math.round(p.heightM)} m`;
    label.classList.remove('hidden');
    highlightElevationPointOnMap(p.distM);
  }

  frame.querySelectorAll('.elevation-point').forEach((btn) => {
    btn.addEventListener('click', () => selectPoint(Number(btn.dataset.idx)));
  });

  if (chart.defaultActive) selectPoint(chart.points.indexOf(chart.defaultActive));
}

function hideElevationProfile() {
  el.elevationProfile.classList.add('hidden');
  el.elevationProfile.innerHTML = '';
  clearElevationHighlightMarker();
  updateSheetPeekHeight(); // shrink the peek state back down now that this content is gone
}

/** {ascentM, descentM} from a rangeHeight array, extracted so the chart, steep-route advisory,
 * route-option badges, and trip-summary panel all report the exact same numbers. */
function computeAscentDescent(rangeHeight) {
  let ascentM = 0;
  let descentM = 0;
  for (let i = 1; i < rangeHeight.length; i++) {
    const diff = rangeHeight[i][1] - rangeHeight[i - 1][1];
    if (diff > 0) ascentM += diff; else descentM += -diff;
  }
  return { ascentM, descentM };
}

/** Merges consecutive rangeHeight samples into runs of sustained climb/descent
 * ({startDistM, endDistM, netHeightM, avgGradePct}) for the voice incline announcements. Works
 * in real distance/height units, unlike the chart's pixel-space simplification. Segments shorter
 * than CONFIG.INCLINE_MIN_SEGMENT_M or with negligible net height are dropped as noise. */
function deriveGradeSegments(rangeHeight) {
  const segments = [];
  if (rangeHeight.length < 2) return segments;
  let segStart = 0;
  let segDir = null; // -1 down, 1 up, 0 flat, null until the first gap establishes one
  const flush = (endIdx) => {
    const startDistM = rangeHeight[segStart][0];
    const endDistM = rangeHeight[endIdx][0];
    const lengthM = endDistM - startDistM;
    const netHeightM = rangeHeight[endIdx][1] - rangeHeight[segStart][1];
    if (lengthM >= CONFIG.INCLINE_MIN_SEGMENT_M && Math.abs(netHeightM) >= 1) {
      segments.push({ startDistM, endDistM, netHeightM, avgGradePct: (netHeightM / lengthM) * 100 });
    }
  };
  for (let i = 1; i < rangeHeight.length; i++) {
    const diff = rangeHeight[i][1] - rangeHeight[i - 1][1];
    const dir = diff > 0.3 ? 1 : diff < -0.3 ? -1 : 0;
    if (segDir === null) {
      segDir = dir;
    } else if (dir !== segDir) {
      // A run ends on any direction change, including into/out of flat — not just up<->down,
      // or a climb followed by a long flat stretch would dilute the averaged grade too low to announce.
      flush(i - 1);
      segStart = i - 1;
      segDir = dir;
    }
  }
  flush(rangeHeight.length - 1);
  return segments;
}

/** Fire-and-forget: fetches elevation for the current route and populates the chart if it's still
 * current, discarding a stale response if the route was replaced/canceled meanwhile. */
function updateElevationProfileForRoute() {
  if (state.travelMode !== 'walk' || !state.route) { hideElevationProfile(); return; }
  const myRoute = state.route;
  fetchElevationProfile(myRoute.coords)
    .then((rangeHeight) => {
      if (state.route !== myRoute || state.travelMode !== 'walk') return; // stale — route changed/canceled meanwhile
      // Persisted on the route itself so live navigation (voice inclines, effort score, trip
      // summary) can look this up long after the chart's own closures would go out of scope.
      myRoute.rangeHeight = rangeHeight;
      myRoute.gradeSegments = deriveGradeSegments(rangeHeight);
      Object.assign(myRoute, computeAscentDescent(rangeHeight));
      renderElevationProfile(rangeHeight);
      // Only while still planning — once navigating, "consider a different route" is just noise.
      if (!state.navigating) checkSteepRouteAdvisory(myRoute.ascentM, myRoute.totalDistM);
    })
    .catch(() => {
      if (state.route === myRoute) hideElevationProfile(); // degrade gracefully — the walking route itself is already fully usable
    });
}

/** Elevation counterpart to checkRoutePlausibility; runs once /height resolves since ascent
 * isn't known synchronously. Purely informational. */
function checkSteepRouteAdvisory(ascentM, totalDistM) {
  if (!totalDistM) return;
  const ascentPerKm = ascentM / (totalDistM / 1000);
  // Same threshold as elevationDifficultyLabel's "Steep in parts" tag, so the language agrees.
  if (ascentPerKm < 20) return;
  showStatus(
    `This route climbs about ${formatDistance(ascentM)} over ${formatDistance(totalDistM)} — steeper than a casual walk. `
    + 'Check the elevation chart below, or see if another route option climbs less.',
    'info',
  );
}

// Route-option comparison samples the WHOLE route (weighted by coverage), unlike live
// in-navigation traffic which only cares about what's immediately ahead.
const routeTrafficTimeCache = new WeakMap(); // trip -> { trafficTimeS, samples }; avoids re-fetching on reselect

// Coarser than live-navigation sampling, to avoid burning through TomTom's free tier on replans.
function routeTrafficSampleCount(totalDistM) {
  if (totalDistM < 10000) return 3;
  if (totalDistM < 30000) return 5;
  return 8;
}

/** Segment-weighted total trip time under current traffic: each sample owns a distance slice
 * (half a sample-gap either side) and adjusts just that slice's share of time, rather than
 * applying one flat ratio to the whole trip. Uncovered distance keeps its base time unadjusted. */
function weightedTrafficTimeS(trip, samples, n) {
  const totalDistM = trip.summary.length * 1000;
  const totalTimeS = trip.summary.time;
  const gap = totalDistM / n;
  let time = 0;
  let coveredDistM = 0;
  samples.forEach((s) => {
    const sliceDistM = Math.max(0, Math.min(totalDistM, s.d + gap / 2) - Math.max(0, s.d - gap / 2));
    coveredDistM += sliceDistM;
    time += totalTimeS * (sliceDistM / totalDistM) / s.ratio;
  });
  const uncoveredDistM = Math.max(0, totalDistM - coveredDistM);
  time += totalTimeS * (uncoveredDistM / totalDistM); // no sample here — no adjustment, not a guess
  return time;
}

/** Traffic-adjusted total time for a route option, used to compare alternates and to find
 * congested spans. Returns `{ trafficTimeS: null, samples: [] }` if TomTom is off or no sample
 * succeeded; callers then fall back to Valhalla's traffic-blind estimate. */
async function estimateRouteTrafficTime(trip) {
  if (routeTrafficTimeCache.has(trip)) return routeTrafficTimeCache.get(trip);
  const totalDistM = trip.summary && trip.summary.length ? trip.summary.length * 1000 : 0;
  const empty = { trafficTimeS: null, samples: [] };
  if (totalDistM <= 0) return empty;
  const lineFeature = turf.lineString(decodeTripCoords(trip));
  const n = routeTrafficSampleCount(totalDistM);
  const points = Array.from({ length: n }, (_, i) => {
    const d = totalDistM * (i + 0.5) / n; // evenly-spaced midpoints
    const [lon, lat] = turf.along(lineFeature, d, { units: 'meters' }).geometry.coordinates;
    return { lon, lat, d };
  });
  const ratios = await Promise.all(points.map((p) => fetchTomTomFlowRatio(p.lat, p.lon)));
  const samples = points
    .map((p, i) => ({ ...p, ratio: ratios[i] }))
    .filter((p) => typeof p.ratio === 'number' && Number.isFinite(p.ratio));
  const result = samples.length
    ? { trafficTimeS: weightedTrafficTimeS(trip, samples, n), samples }
    : empty;
  routeTrafficTimeCache.set(trip, result);
  return result;
}

/** Groups congested samples (ratio below TRAFFIC_HEAVY_THRESHOLD) into contiguous spans, merging
 * overlaps, and returns only the single worst span since validating a detour is expensive. Returns
 * null if nothing is congested. */
function findWorstCongestedSpan(samples, totalDistM, n) {
  const gap = totalDistM / n;
  const bad = samples
    .filter((s) => s.ratio < CONFIG.TRAFFIC_HEAVY_THRESHOLD)
    .sort((a, b) => a.d - b.d);
  if (!bad.length) return null;
  const spans = [];
  bad.forEach((s) => {
    const startM = Math.max(0, s.d - gap / 2);
    const endM = Math.min(totalDistM, s.d + gap / 2);
    const last = spans[spans.length - 1];
    if (last && startM <= last.endM) {
      last.endM = Math.max(last.endM, endM);
      last.ratio = Math.min(last.ratio, s.ratio);
    } else {
      spans.push({ startM, endM, ratio: s.ratio });
    }
  });
  return spans.reduce((worst, s) => (s.ratio < worst.ratio ? s : worst));
}

/** Buffers a slice of `lineFeature` into the single-ring polygon shape Valhalla's
 * `exclude_polygons` expects. Falls back to the first ring for the rare MultiPolygon case
 * (a self-intersecting buffer on a tight curve). */
function buildExcludePolygon(lineFeature, startM, endM) {
  const slice = turf.lineSliceAlong(lineFeature, Math.max(0, startM), Math.max(startM + 1, endM), { units: 'meters' });
  const buffered = turf.buffer(slice, CONFIG.TRAFFIC_DETOUR_BUFFER_M, { units: 'meters' });
  const { geometry } = buffered;
  return geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
}

/** Forces Valhalla around `span` via exclude_polygons and, if that gives a meaningfully different
 * route, samples its traffic and returns `{ trip, trafficTimeS }`. Returns null if the request
 * fails, the detour isn't meaningfully different, or its traffic can't be resolved. */
async function estimateDetourRoute(trip, from, to, stops, costing, avoidOpts, span) {
  const lineFeature = turf.lineString(decodeTripCoords(trip));
  const polygon = buildExcludePolygon(lineFeature, span.startM, span.endM);
  let detourTrip;
  try {
    ({ trip: detourTrip } = await requestRoute(from, to, stops, 0, costing, { ...avoidOpts, excludePolygon: polygon }));
  } catch (err) {
    return null;
  }
  const dDist = Math.abs(detourTrip.summary.length - trip.summary.length) / trip.summary.length;
  const dTime = Math.abs(detourTrip.summary.time - trip.summary.time) / trip.summary.time;
  if (dDist < 0.05 && dTime < 0.05) return null;
  const { trafficTimeS } = await estimateRouteTrafficTime(detourTrip);
  if (trafficTimeS == null) return null;
  return { trip: detourTrip, trafficTimeS };
}

const routeDetourCache = new WeakMap(); // trip -> detour candidate or null; avoids re-requesting Valhalla+TomTom on repaint

/** Checks whether the fastest option has a congested stretch worth routing around, and if a
 * detour clears TRAFFIC_REROUTE_MIN_IMPROVEMENT, adds it as a new "Avoids traffic" card. */
async function maybeAddTrafficDetourOption(options, results, trafficTimes) {
  let fastestIdx = -1, fastestTime = Infinity;
  trafficTimes.forEach((t, i) => {
    const effective = t != null ? t : options[i].summary.time;
    if (effective < fastestTime) { fastestTime = effective; fastestIdx = i; }
  });
  const trip = options[fastestIdx];
  const result = results[fastestIdx];
  if (!trip || !result.samples.length) return;

  let detour = routeDetourCache.get(trip);
  if (detour === undefined) {
    const totalDistM = trip.summary.length * 1000;
    const n = routeTrafficSampleCount(totalDistM);
    const span = findWorstCongestedSpan(result.samples, totalDistM, n);
    detour = span
      ? await estimateDetourRoute(trip, state.from, state.to, getStops(), COSTING_BY_MODE[state.travelMode], { avoidTolls: state.avoidTolls, avoidHighways: state.avoidHighways }, span)
      : null;
    routeDetourCache.set(trip, detour);
  }
  if (state.routeOptions !== options || !detour) return; // stale, or no worthwhile detour found
  // Same "worth switching for" bar as live traffic rerouting, so a marginal gain doesn't surface as a new option.
  if ((fastestTime - detour.trafficTimeS) / fastestTime < CONFIG.TRAFFIC_REROUTE_MIN_IMPROVEMENT) return;
  insertDetourOption(options, trafficTimes, detour.trip, detour.trafficTimeS);
}

/** Colors only the selected route option by traffic, never the gray alternates — otherwise every
 * option looks the same busy color regardless of which is in focus. Reuses whatever traffic
 * samples were already fetched for the ETA numbers; costs no extra TomTom calls. */
function paintRouteOptionsTrafficOverlay(options, results) {
  const i = state.selectedRouteIndex;
  const trip = options[i];
  const samples = results[i] && results[i].samples;
  if (!trip || !samples || !samples.length) {
    map.getSource('route-traffic').setData(emptyFeatureCollection());
    return;
  }
  const totalDistM = trip.summary.length * 1000;
  const gap = totalDistM / routeTrafficSampleCount(totalDistM);
  const lineFeature = turf.lineString(decodeTripCoords(trip));
  const features = samples.map((s) => {
    const from = Math.max(0, s.d - gap / 2);
    const to = Math.min(totalDistM, s.d + gap / 2);
    const dash = turf.lineSliceAlong(lineFeature, from, to, { units: 'meters' });
    // startM/endM let updateTraveledRouteSegment filter out dashes once driven past.
    return { type: 'Feature', properties: { ratio: s.ratio, startM: from, endM: to }, geometry: dash.geometry };
  });
  map.getSource('route-traffic').setData({ type: 'FeatureCollection', features });
}

/** Splices a validated detour into state.routeOptions as a new card and repaints, on its own
 * delay separate from the normal paintRouteOptionCards call. */
function insertDetourOption(options, trafficTimes, detourTrip, detourTrafficTimeS) {
  if (state.routeOptions !== options) return; // stale — a newer plan/reselect already replaced this array
  state.routeOptions = [...options, detourTrip];
  state.routeOptionDetourTrips.add(detourTrip);
  paintRouteOptionCards([...trafficTimes, detourTrafficTimeS]);
  updateAlternateRouteLines();
  updateSheetPeekHeight();
  // Every trip here already went through estimateRouteTrafficTime, so this is a pure cache read.
  paintRouteOptionsTrafficOverlay(state.routeOptions, state.routeOptions.map((t) => routeTrafficTimeCache.get(t)));
}

/** Fire-and-forget traffic estimation for every current route option, repainting cards once it
 * resolves so replans aren't delayed. No-ops outside drive mode or with TomTom off. */
async function refreshRouteOptionsTraffic() {
  if (!tomtomFeaturesEnabled || state.travelMode !== 'drive') return;
  const options = state.routeOptions;
  if (options.length < 1) return;
  const results = await Promise.all(options.map((t) => estimateRouteTrafficTime(t)));
  if (state.routeOptions !== options) return; // stale — a newer plan/reselect already replaced this array
  const trafficTimes = results.map((r) => r.trafficTimeS);
  if (trafficTimes.every((t) => t == null)) return; // no usable data anywhere — leave the distance-only cards as they are
  paintRouteOptionCards(trafficTimes);
  // The extra "~X min in traffic" line changes card height, so re-measure the sheet's peek height.
  updateSheetPeekHeight();
  paintRouteOptionsTrafficOverlay(options, results);
  maybeAddTrafficDetourOption(options, results, trafficTimes); // fire-and-forget: may add one more card, well after this — see its own doc comment
}

/** One label per option: "Avoids traffic" takes priority, else "Fastest"/"Shortest", or a toll
 * callout when options differ on that. With a single trip every tag is blank — nothing to compare.
 * `trafficTimes`, when given, decides "Fastest" instead of Valhalla's traffic-blind estimate. */
function buildRouteOptionTags(trips, trafficTimes) {
  if (trips.length < 2) return trips.map(() => '');
  const effectiveTimes = trips.map((t, i) => (trafficTimes && trafficTimes[i] != null ? trafficTimes[i] : t.summary.time));
  const minTime = Math.min(...effectiveTimes);
  const minDist = Math.min(...trips.map((t) => t.summary.length));
  const anyToll = trips.some((t) => t.summary.has_toll);
  const notAllSameToll = anyToll && trips.some((t) => !t.summary.has_toll);

  return trips.map((t, i) => {
    if (state.routeOptionDetourTrips.has(t)) return 'Avoids traffic';
    if (effectiveTimes[i] === minTime) return 'Fastest';
    if (t.summary.length === minDist) return 'Shortest';
    if (state.travelMode !== 'walk' && notAllSameToll) return t.summary.has_toll ? 'Has tolls' : 'No tolls'; // toll callouts don't apply to a pedestrian trip
    return '';
  });
}

/** Redraws the gray alternate-route lines — everything in routeOptions except the selected one,
 * which is drawn by the primary 'route' source/layer instead, on top of these. */
async function updateAlternateRouteLines() {
  const features = state.routeOptions
    .map((trip, i) => ({ trip, i }))
    .filter(({ i }) => i !== state.selectedRouteIndex)
    .map(({ trip, i }) => ({
      type: 'Feature',
      properties: { optionIndex: i },
      geometry: { type: 'LineString', coordinates: decodeTripCoords(trip) },
    }));
  await awaitMapLoad();
  map.getSource('route-alternates').setData({ type: 'FeatureCollection', features });
}

/** Builds/replaces the route-option cards — split out from renderRouteOptions so
 * refreshRouteOptionsTraffic can re-paint just the cards once traffic times resolve. */
function paintRouteOptionCards(trafficTimes) {
  el.routeOptionsRow.innerHTML = '';
  const tags = buildRouteOptionTags(state.routeOptions, trafficTimes);
  // Each card gets a color swatch matching its actual map line color, so it can be matched to its
  // line at a glance. Alternates are numbered in on-map order, skipping the selected index.
  let altSeen = 0;
  state.routeOptions.forEach((trip, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    const isActive = i === state.selectedRouteIndex;
    card.className = 'route-option-card' + (isActive ? ' active' : '');
    card.setAttribute('aria-pressed', String(isActive));
    // Distance, not Valhalla's time estimate, is the headline number here —
    // that estimate is derived from road speed limits/class alone, with no
    // live-traffic signal behind it by default (this app has none
    // configured, by design — see README). A live-traffic-backed estimate
    // (trafficTimes, from TomTom — see refreshRouteOptionsTraffic) is
    // trustworthy enough to show once it's actually resolved for this
    // option; Valhalla's own traffic-blind number never is.
    const trafficTimeS = trafficTimes && trafficTimes[i];
    const swatchLabel = isActive ? 'Selected' : `Alt. ${(altSeen += 1)}`;
    const swatchColor = isActive ? '#3d8bfd' : '#6b7a90';
    card.innerHTML = `${state.routeOptions.length > 1 ? `<div class="route-option-swatch"><i style="background:${swatchColor}"></i>${escapeHtml(swatchLabel)}</div>` : ''}
      <div class="route-option-dist">${formatDistance(trip.summary.length * 1000)}</div>
      ${trafficTimeS != null ? `<div class="route-option-time">~${formatDuration(trafficTimeS)} in traffic</div>` : ''}
      ${tags[i] ? `<div class="route-option-tag">${escapeHtml(tags[i])}</div>` : ''}
      ${state.travelMode === 'walk' ? `<div class="route-option-elevation${trip.ascentM != null ? '' : ' hidden'}">${trip.ascentM != null ? `↑${formatDistance(trip.ascentM)}` : ''}</div>` : ''}`;
    card.setAttribute('aria-label', `${state.routeOptions.length > 1 ? `${swatchLabel}. ` : ''}${formatDistance(trip.summary.length * 1000)}${tags[i] ? `, ${tags[i]}` : ''}${isActive ? ', currently selected' : ''}`);
    card.addEventListener('click', () => selectRouteOption(i));
    el.routeOptionsRow.appendChild(card);
  });
  // Keeps the sheet's summary line in sync with the traffic-adjusted time, once resolved, instead
  // of leaving Valhalla's traffic-blind estimate showing. Guarded on !state.navigating since
  // updateActiveManeuver owns this line during an active drive.
  const activeTrafficTimeS = trafficTimes && trafficTimes[state.selectedRouteIndex];
  const activeTrip = state.routeOptions[state.selectedRouteIndex];
  if (activeTrafficTimeS != null && activeTrip && !state.navigating) {
    el.sheetSummary.textContent = `${formatDistance(activeTrip.summary.length * 1000)} · ~${formatDuration(activeTrafficTimeS)} in traffic`;
  }
}

/** Populates the route-option card(s) and the map's gray alternate lines. Hides both only when
 * there's no planned route — a single option still gets a card, since it's also how a live-traffic
 * ETA gets shown. */
async function renderRouteOptions() {
  el.routeOptionsRow.innerHTML = '';
  state.routeOptionDetourTrips = new Set(); // fresh options array — any previous detour card no longer applies (see maybeAddTrafficDetourOption)
  if (state.routeOptions.length < 1) {
    el.routeOptionsRow.classList.add('hidden');
    updateSheetPeekHeight();
    await awaitMapLoad();
    map.getSource('route-alternates').setData(emptyFeatureCollection());
    map.getSource('route-traffic').setData(emptyFeatureCollection());
    return;
  }
  paintRouteOptionCards(null); // immediate: distance + Valhalla-only tags, never delayed waiting on a network round-trip
  el.routeOptionsRow.classList.remove('hidden');
  updateSheetPeekHeight();
  updateAlternateRouteLines();
  refreshRouteOptionsTraffic(); // fire-and-forget: re-paints with live-traffic times/tag once resolved (no-ops entirely if TomTom is off or this isn't a drive)
  updateRouteOptionElevationBadges();
}

/** Fetches elevation for every walk-mode route option missing it, patching an "↑34m" badge onto
 * each card once resolved, so you can compare climbs before committing to one. */
function updateRouteOptionElevationBadges() {
  if (state.travelMode !== 'walk') return;
  const options = state.routeOptions;
  options.forEach((trip, i) => {
    if (trip.ascentM != null) return; // already fetched — e.g. re-rendered after selecting an option
    fetchElevationProfile(decodeTripCoords(trip))
      .then((rangeHeight) => {
        if (state.routeOptions !== options) return; // stale — options replaced meanwhile
        Object.assign(trip, computeAscentDescent(rangeHeight));
        const card = el.routeOptionsRow.children[i];
        const badge = card && card.querySelector('.route-option-elevation');
        if (badge) {
          badge.textContent = `↑${formatDistance(trip.ascentM)}`;
          badge.classList.remove('hidden');
        }
      })
      .catch(() => {}); // best-effort — a missing badge is never worth surfacing an error over
  });
}

/** Switches the active route to routeOptions[index]; no network call, already in memory. */
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
  // Remembers which stops list this trip's maneuvers' legIndex values are relative to, since a
  // reroute needs to slice this exact array, not the possibly-larger current getStops() list.
  built.stops = stops;
  state.route = built;
  // Android Auto's SurfaceCallback map — pushed once per route computed/rerouted,
  // not per tick (see updatePosition in onPositionUpdate for the live puck).
  if (isNativePlatform()) updateCarNavRoute({ coordinates: built.coords }).catch(() => {});
  state.spokenFar = new Set();
  state.spokenNear = new Set();
  state.spokenContinue = new Set();
  state.spokenInclines = new Set();
  state.currentManeuverIdx = 0; // new maneuver array, entirely new startDistM boundaries — see updateActiveManeuver
  state.arrivedAnnounced = false;
  resetTrafficTracking(); // a (re)planned route invalidates any prior traffic sampling/cadence

  await awaitMapLoad();
  map.getSource('route').setData(built.lineFeature);
  // Clears a stale transit line, since nothing else on the drive/walk path touches this source.
  map.getSource('transit-route').setData(emptyFeatureCollection());
  clearTraveledRouteSegment(); // a fresh/rerouted trip starts with nothing "already driven" yet

  if (fitView) {
    const bounds = built.coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(built.coords[0], built.coords[0]),
    );
    map.fitBounds(bounds, { padding: 60, duration: 500 });
  }

  renderManeuverList(built.maneuvers);
  el.maneuverList.classList.toggle('hidden', !state.navigating); // only shown once actually navigating
  if (!state.navigating) renderRouteSummary(built.totalDistM, built.totalTimeS);
  el.bottomSheet.classList.remove('hidden');
  // Re-measure now the sheet is visible — renderRouteOptions() runs this earlier while it's still
  // display:none with zero height, which would otherwise stick the peek height at the 136px floor.
  updateSheetPeekHeight();

  if (state.travelMode === 'walk') updateElevationProfileForRoute();
  else hideElevationProfile();
  if (state.travelMode === 'drive') updateSpeedLimitProfileForRoute();

  // Persists the route so a killed/reloaded tab can restore it. Non-fatal if it fails.
  try {
    await saveCurrentTrip({ route: built, from: state.from, to: state.to, stops: getStops(), travelMode: state.travelMode, navigating: state.navigating });
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

/** Static "before navigation" summary line; updateActiveManeuver() overwrites it with live ETA
 * once navigating. */
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
// Transit mode: bundled Kochi Metro + Water Metro, or OpenTripPlanner 2
// ============================================================================
// requestTransitItineraries tries the Kochi planner first (no self-hosted service needed),
// then falls back to OTP2 if self-hosted. Planning/rendering only, not live GPS transit tracking.
const TRANSIT_ENABLED = CONFIG.KOCHI_TRANSIT_ENABLED || !!CONFIG.OTP2_URL;

// Loaded once, lazily, the first time transit mode is actually used.
let kochiTransitData = null;
let kochiTransitDataPromise = null;
function loadKochiTransitData() {
  if (!kochiTransitDataPromise) {
    kochiTransitDataPromise = Promise.all([
      fetch('vendor/kochi-metro.json').then((r) => r.json()),
      fetch('vendor/kochi-water-metro.json').then((r) => r.json()),
      fetch('vendor/kochi-feeder-bus.json').then((r) => r.json()),
    ]).then(([metro, waterMetro, feederBus]) => {
      kochiTransitData = { metro, waterMetro, feederBus };
      return kochiTransitData;
    }).catch((err) => {
      resolverDebugLog(`Kochi transit: failed to load reference data — ${err.message}`, 'error');
      kochiTransitDataPromise = null; // let the next attempt retry instead of being stuck failed
      throw err;
    });
  }
  return kochiTransitDataPromise;
}

// Beyond a short walk, park-and-ride reads as more realistic; beyond KOCHI_DRIVE_MAX_M the
// network isn't a realistic option at all, falling through to OTP2 or "no route".
const KOCHI_WALK_MAX_M = 1200;
const KOCHI_DRIVE_MAX_M = 15000;
// Riding a few extra stations past the nearest one can still be a worthwhile alternative.
const KOCHI_METRO_ALIGHT_WINDOW = 2;
// Caps how many combined candidates get built per plan, keeping Valhalla calls bounded.
const KOCHI_MAX_COMBINED_SPECS = 2;
const KOCHI_MAX_FEEDER_SPECS = 2;
// Mirrors drive mode's primary + 2 alternates ceiling.
const KOCHI_MAX_ITINERARY_OPTIONS = 3;

/** The first/last-mile leg of a Kochi transit itinerary — walk or drive depending on distance,
 * via this app's own Valhalla-backed requestRoute. Returns null (not a thrown error) when the
 * distance is unreasonable for either. */
async function driveOrWalkLeg(from, to, toName) {
  const distM = turf.distance([from.lon, from.lat], [to.lon, to.lat], { units: 'meters' });
  if (distM > KOCHI_DRIVE_MAX_M) return null;
  const mode = distM <= KOCHI_WALK_MAX_M ? 'WALK' : 'CAR';
  const { trip } = await requestRoute(from, to, [], 0, mode === 'WALK' ? 'pedestrian' : 'auto', {});
  // Reuses the same maneuver-list builder as normal drive/walk navigation, so this leg's
  // maneuvers are structurally identical and startTransitNavigation can drive a real banner off it.
  const built = buildRouteState(trip);
  return {
    mode,
    distance: built.totalDistM,
    duration: built.totalTimeS,
    geometry: built.coords,
    maneuvers: built.maneuvers,
    to: { name: toName },
  };
}

/** Same-leg dedup for buildKochiItineraries' Step 2: keys on coordinates and caches the promise
 * itself (checked before any await), so concurrent candidates share one in-flight Valhalla call. */
function cachedDriveOrWalkLeg(cache, from, to, toName) {
  const key = `${from.lon},${from.lat}|${to.lon},${to.lat}`;
  if (!cache.has(key)) cache.set(key, driveOrWalkLeg(from, to, toName));
  return cache.get(key);
}

/** Kochi Metro is a single line, so routing between two of its stations is just an array slice,
 * not a graph search. `offsetS` per station gives real ride duration and, with bundled trip-start
 * times, a real "board at roughly HH:MM" estimate, not a guessed average headway. */
function planKochiMetroRideLeg(fromIdx, toIdx, now) {
  const { stations, schedule, fares } = kochiTransitData.metro;
  const directionId = toIdx > fromIdx ? 0 : 1;
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const segment = stations.slice(lo, hi + 1);
  const orderedSegment = directionId === 0 ? segment : segment.slice().reverse();
  let distanceM = 0;
  for (let i = 0; i < segment.length - 1; i++) {
    distanceM += turf.distance([segment[i].lon, segment[i].lat], [segment[i + 1].lon, segment[i + 1].lat], { units: 'meters' });
  }

  // KMRL service runs Monday-Saturday vs. Sunday-only, not the usual Mon-Fri/Sat-Sun split.
  const serviceKey = now.getDay() === 0 ? 'weekend' : 'weekday';
  const startTimes = schedule[serviceKey][directionId === 0 ? 'direction0' : 'direction1'];
  const totalOffsetS = stations[stations.length - 1].offsetS - stations[0].offsetS;
  const boardOffsetS = directionId === 0 ? stations[fromIdx].offsetS : (totalOffsetS - stations[fromIdx].offsetS);
  const nowS = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  // Collects up to TRANSIT_UPCOMING_DEPARTURES departures; waitS/departureAtMs below use only the first.
  const waitsS = [];
  for (const t of startTimes) {
    const [h, m, s] = t.split(':').map(Number);
    const boardS = h * 3600 + m * 60 + s + boardOffsetS;
    if (boardS >= nowS) {
      waitsS.push(boardS - nowS);
      if (waitsS.length >= TRANSIT_UPCOMING_DEPARTURES) break;
    }
  }
  const waitS = waitsS.length ? waitsS[0] : null;
  if (waitS != null) resolverDebugLog(`Kochi Metro: next train from ${stations[fromIdx].name} in about ${Math.round(waitS / 60)} min.`);

  return {
    mode: 'SUBWAY', // GTFS route_type 1, matches OTP's own convention
    route: 'Kochi Metro',
    headsign: stations[directionId === 0 ? stations.length - 1 : 0].name,
    from: { name: stations[fromIdx].name }, // used by the boarding-detection banner
    to: { name: stations[toIdx].name },
    distance: distanceM,
    duration: Math.abs(stations[toIdx].offsetS - stations[fromIdx].offsetS),
    // Real flat fare for this station pair from KMRL's fare tables; undefined if not covered.
    fareINR: (fares || {})[`${stations[fromIdx].id}-${stations[toIdx].id}`],
    intermediateStops: new Array(Math.max(0, orderedSegment.length - 2)), // only .length is ever read
    geometry: orderedSegment.map((s) => [s.lon, s.lat]), // station coords, not the physical rail curve
    // Ordered station list, used by live tracking to compute "next station"/"N stops remaining".
    stations: orderedSegment,
    waitS, // seconds until the next real train, or null if none left today
    waitsS, // next few real departures for "in 2, 17, 32 min" display
    // Absolute departure time (ms since epoch); boarding detection needs a real clock time.
    departureAtMs: waitS != null ? now.getTime() + waitS * 1000 : null,
  };
}

function kochiWaterMetroRouteEntry(from, to) {
  return kochiTransitData.waterMetro.routes.find((r) => r.from === from && r.to === to) || null;
}

/** Fewest-transfers path over the small (~10-jetty) water metro network: direct if one exists,
 * else one transfer. Not general shortest-path search — the network is small enough that trying
 * direct then every one-hop transfer covers every real trip. Returns null if unreachable. */
function findKochiWaterMetroPath(from, to) {
  const direct = kochiWaterMetroRouteEntry(from, to);
  if (direct) return [direct];
  for (const hub of kochiTransitData.waterMetro.stations) {
    if (hub.name === from || hub.name === to) continue;
    const leg1 = kochiWaterMetroRouteEntry(from, hub.name);
    const leg2 = kochiWaterMetroRouteEntry(hub.name, to);
    if (leg1 && leg2) return [leg1, leg2];
  }
  return null;
}

function nextSailingAfter(routeEntry, afterS) {
  for (const sailing of routeEntry.sailings) {
    const [h, m, s] = sailing.departure.split(':').map(Number);
    if (h * 3600 + m * 60 + s >= afterS) return sailing;
  }
  return null;
}

/** Same lookup as nextSailingAfter, but collects up to `count` sailings for the "Next departures
 * in X, Y, Z min" display. Unlike the single-sailing lookup, does not fall back to tomorrow. */
function nextSailingsAfter(routeEntry, afterS, count) {
  const out = [];
  for (const sailing of routeEntry.sailings) {
    const [h, m, s] = sailing.departure.split(':').map(Number);
    if (h * 3600 + m * 60 + s >= afterS) {
      out.push(sailing);
      if (out.length >= count) break;
    }
  }
  return out;
}

/** One leg per hop in findKochiWaterMetroPath's result, each using a real bundled sailing time.
 * Falls back to the day's first sailing if nothing's left today, rather than failing the query. */
function planKochiWaterMetroRideLegs(from, to, now) {
  const path = findKochiWaterMetroPath(from, to);
  if (!path) return null;
  const stationByName = new Map(kochiTransitData.waterMetro.stations.map((s) => [s.name, s]));
  // Fixed reference for departureAtMs; cursorS below mutates to each hop's own arrival time.
  const nowS = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let cursorS = nowS;
  return path.map((routeEntry) => {
    const beforeS = cursorS; // "now" for the first hop, the previous hop's real arrival for a transfer
    const upcomingSailings = nextSailingsAfter(routeEntry, cursorS, TRANSIT_UPCOMING_DEPARTURES);
    const sailing = upcomingSailings[0] || routeEntry.sailings[0];
    const [dh, dm, ds] = sailing.departure.split(':').map(Number);
    const [ah, am, as] = sailing.arrival.split(':').map(Number);
    const departureS = dh * 3600 + dm * 60 + ds;
    let durationS = (ah * 3600 + am * 60 + as) - departureS;
    if (durationS < 0) durationS += 24 * 3600; // arrival past midnight
    cursorS = ah * 3600 + am * 60 + as;
    const fromS = stationByName.get(routeEntry.from);
    const toS = stationByName.get(routeEntry.to);
    return {
      mode: 'FERRY',
      route: 'Kochi Water Metro',
      from: { name: routeEntry.from }, // used by the boarding-detection banner
      to: { name: routeEntry.to },
      distance: fromS && toS ? turf.distance([fromS.lon, fromS.lat], [toS.lon, toS.lat], { units: 'meters' }) : 0,
      duration: durationS,
      // From the official Water Metro fare chart; undefined for a pair the chart doesn't cover.
      fareINR: (kochiTransitData.waterMetro.fares || {})[`${routeEntry.from}-${routeEntry.to}`],
      intermediateStops: [],
      geometry: fromS && toS ? [[fromS.lon, fromS.lat], [toS.lon, toS.lat]] : [],
      waitS: Math.max(0, departureS - beforeS), // "next boat", or transfer wait for a second hop
      waitsS: upcomingSailings.map((sl) => {
        const [sh, sm, ss] = sl.departure.split(':').map(Number);
        return Math.max(0, (sh * 3600 + sm * 60 + ss) - beforeS);
      }),
      // Computed against fixed nowS, not beforeS/cursorS, since waitS above measures a transfer
      // hop's wait from the previous hop's arrival instead — a different quantity.
      departureAtMs: now.getTime() + Math.max(0, departureS - nowS) * 1000,
    };
  });
}

/** One leg for a direct Metro Connect feeder-bus route. `route.arrivals` gives an exact ride
 * duration when available; otherwise falls back to `route.durationEstimateS`. */
function planKochiFeederBusRideLeg(route, now) {
  const { stations } = kochiTransitData.feederBus;
  const fromS = stations.find((s) => s.name === route.from);
  const toS = stations.find((s) => s.name === route.to);
  const nowS = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const waitsS = [];
  let matchedIndex = -1;
  route.departures.forEach((t, i) => {
    const [h, m, s] = t.split(':').map(Number);
    const depS = h * 3600 + m * 60 + (s || 0);
    if (depS >= nowS && waitsS.length < TRANSIT_UPCOMING_DEPARTURES) {
      if (matchedIndex === -1) matchedIndex = i;
      waitsS.push(depS - nowS);
    }
  });
  const waitS = waitsS.length ? waitsS[0] : null;
  let durationS = route.durationEstimateS || 0;
  if (route.arrivals && matchedIndex !== -1) {
    const [dh, dm, ds] = route.departures[matchedIndex].split(':').map(Number);
    const [ah, am, as] = route.arrivals[matchedIndex].split(':').map(Number);
    durationS = (ah * 3600 + am * 60 + (as || 0)) - (dh * 3600 + dm * 60 + (ds || 0));
    if (durationS < 0) durationS += 24 * 3600; // arrival past midnight
  }
  return {
    mode: 'BUS',
    route: 'Metro Connect',
    from: { name: route.from },
    to: { name: route.to },
    distance: fromS && toS ? turf.distance([fromS.lon, fromS.lat], [toS.lon, toS.lat], { units: 'meters' }) : 0,
    duration: durationS,
    fareINR: route.fareINR,
    intermediateStops: route.intermediateStops || [],
    geometry: fromS && toS ? [[fromS.lon, fromS.lat], [toS.lon, toS.lat]] : [],
    waitS,
    waitsS,
    departureAtMs: waitS != null ? now.getTime() + waitS * 1000 : null,
  };
}

let kochiTransferPointsCache = null; // computed once; the data doesn't reload mid-session

/** Every (metroStation, waterMetroJetty) pair within CONFIG.KOCHI_TRANSFER_MAX_M of each other —
 * a real-world walkable transfer point. Purely coordinate-based, no hardcoded station names. */
function findKochiTransferPoints() {
  if (kochiTransferPointsCache) return kochiTransferPointsCache;
  const { metro, waterMetro } = kochiTransitData;
  kochiTransferPointsCache = findKochiTransferPointsPure(metro.stations, waterMetro.stations, CONFIG.KOCHI_TRANSFER_MAX_M);
  return kochiTransferPointsCache;
}

/** Builds every plausible Kochi-transit itinerary between `from` and `to`: builds candidate specs
 * (metro-only, ferry-only, combined), resolves each one's access legs via Valhalla, then ranks by
 * duration and caps to KOCHI_MAX_ITINERARY_OPTIONS. Returns null when nothing plausible exists,
 * so the caller can fall through to OTP2 or the final "no route" error. */
async function buildKochiItineraries(from, to, toName = 'your destination') {
  if (!CONFIG.KOCHI_TRANSIT_ENABLED) return null;
  await loadKochiTransitData();
  const { metro, waterMetro } = kochiTransitData;
  const now = new Date();

  const metroFrom = nearestKochiStation(from.lat, from.lon, metro.stations);
  const metroTo = nearestKochiStation(to.lat, to.lon, metro.stations);
  // Requires distinct boarding/alighting stations — is there an actual metro RIDE in this trip.
  const metroFeasible = !!(metroFrom && metroTo && metroFrom.index !== metroTo.index
    && metroFrom.distanceM <= KOCHI_DRIVE_MAX_M && metroTo.distanceM <= KOCHI_DRIVE_MAX_M);
  // Same check without requiring distinct stations — a feeder bus can still be the right answer
  // even when both endpoints share the same nearest station (e.g. Aluva to CIAL Airport).
  const metroStationsReachable = !!(metroFrom && metroTo
    && metroFrom.distanceM <= KOCHI_DRIVE_MAX_M && metroTo.distanceM <= KOCHI_DRIVE_MAX_M);

  const ferryFrom = nearestKochiStation(from.lat, from.lon, waterMetro.stations);
  const ferryTo = nearestKochiStation(to.lat, to.lon, waterMetro.stations);
  const ferryFeasible = !!(ferryFrom && ferryTo && ferryFrom.name !== ferryTo.name
    && ferryFrom.distanceM <= KOCHI_DRIVE_MAX_M && ferryTo.distanceM <= KOCHI_DRIVE_MAX_M);
  const ferryPath = ferryFeasible ? findKochiWaterMetroPath(ferryFrom.name, ferryTo.name) : null;

  if (!metroStationsReachable && !ferryPath) return null;

  // ---- Step 1: free candidate specs ----
  // A spec is an ordered list of segments: 'access' (needs a Valhalla call, resolved in Step 2)
  // or 'ride' (already-built leg object(s), free).
  const specs = [];

  if (metroFeasible) {
    const candidates = [];
    for (let offset = -KOCHI_METRO_ALIGHT_WINDOW; offset <= KOCHI_METRO_ALIGHT_WINDOW; offset++) {
      const idx = metroTo.index + offset;
      if (idx < 0 || idx >= metro.stations.length || idx === metroFrom.index) continue;
      const station = metro.stations[idx];
      candidates.push({ offset, idx, distToDestM: turf.distance([station.lon, station.lat], [to.lon, to.lat], { units: 'meters' }) });
    }
    const zero = candidates.find((c) => c.offset === 0);
    const others = candidates.filter((c) => c.offset !== 0).sort((a, b) => a.distToDestM - b.distToDestM);
    const chosen = (zero ? [zero] : []).concat(others.slice(0, zero ? 2 : 3));
    chosen.forEach(({ idx }) => {
      specs.push({
        segments: [
          { type: 'access', from, to: metroFrom, toName: metroFrom.name },
          { type: 'ride', legs: [planKochiMetroRideLeg(metroFrom.index, idx, now)] },
          { type: 'access', from: metro.stations[idx], to, toName },
        ],
      });
    });
  }

  if (ferryPath) {
    specs.push({
      segments: [
        { type: 'access', from, to: ferryFrom, toName: ferryFrom.name },
        { type: 'ride', legs: planKochiWaterMetroRideLegs(ferryFrom.name, ferryTo.name, now) },
        { type: 'access', from: ferryTo, to, toName },
      ],
    });
  }

  if (metroFeasible && ferryFeasible) {
    const combined = [];
    for (const tp of findKochiTransferPoints()) {
      if (combined.length >= KOCHI_MAX_COMBINED_SPECS) break;
      // metro-first: origin --metro--> transfer point --walk/drive--> transfer jetty --ferry--> destination
      if (tp.metroIndex !== metroFrom.index && tp.waterStation.name !== ferryTo.name) {
        const ferryHopPath = findKochiWaterMetroPath(tp.waterStation.name, ferryTo.name);
        if (ferryHopPath) {
          combined.push({
            segments: [
              { type: 'access', from, to: metroFrom, toName: metroFrom.name },
              { type: 'ride', legs: [planKochiMetroRideLeg(metroFrom.index, tp.metroIndex, now)] },
              { type: 'access', from: tp.metroStation, to: tp.waterStation, toName: tp.waterStation.name },
              { type: 'ride', legs: planKochiWaterMetroRideLegs(tp.waterStation.name, ferryTo.name, now) },
              { type: 'access', from: ferryTo, to, toName },
            ],
          });
        }
      }
      if (combined.length >= KOCHI_MAX_COMBINED_SPECS) break;
      // ferry-first: origin --ferry--> transfer jetty --walk/drive--> transfer point --metro--> destination
      if (tp.waterStation.name !== ferryFrom.name && tp.metroIndex !== metroTo.index) {
        const ferryHopPath = findKochiWaterMetroPath(ferryFrom.name, tp.waterStation.name);
        if (ferryHopPath) {
          combined.push({
            segments: [
              { type: 'access', from, to: ferryFrom, toName: ferryFrom.name },
              { type: 'ride', legs: planKochiWaterMetroRideLegs(ferryFrom.name, tp.waterStation.name, now) },
              { type: 'access', from: tp.waterStation, to: tp.metroStation, toName: tp.metroStation.name },
              { type: 'ride', legs: [planKochiMetroRideLeg(tp.metroIndex, metroTo.index, now)] },
              { type: 'access', from: metroTo, to, toName },
            ],
          });
        }
      }
    }
    specs.push(...combined.slice(0, KOCHI_MAX_COMBINED_SPECS));
  }

  // Pre-filters by distance before ranking, to avoid wasting access-leg requests on irrelevant routes.
  if (metroStationsReachable && kochiTransitData.feederBus) {
    const { feederBus } = kochiTransitData;
    const feederCandidates = [];
    feederBus.routes.forEach((route) => {
      const metroStart = feederRouteMetroEnd(route.from, metro.stations, feederBus.stations, CONFIG.KOCHI_TRANSFER_MAX_M);
      if (metroStart) {
        const farStation = feederBus.stations.find((s) => s.name === route.to);
        const farDistM = farStation ? turf.distance([farStation.lon, farStation.lat], [to.lon, to.lat], { units: 'meters' }) : Infinity;
        if (farStation && farDistM <= KOCHI_DRIVE_MAX_M) {
          feederCandidates.push({ direction: 'metro-first', route, metroStation: metroStart, farStation, farDistM });
        }
      }
      const metroEnd = feederRouteMetroEnd(route.to, metro.stations, feederBus.stations, CONFIG.KOCHI_TRANSFER_MAX_M);
      if (metroEnd) {
        const farStation = feederBus.stations.find((s) => s.name === route.from);
        const farDistM = farStation ? turf.distance([farStation.lon, farStation.lat], [from.lon, from.lat], { units: 'meters' }) : Infinity;
        if (farStation && farDistM <= KOCHI_DRIVE_MAX_M) {
          feederCandidates.push({ direction: 'feeder-first', route, metroStation: metroEnd, farStation, farDistM });
        }
      }
    });
    feederCandidates.sort((a, b) => a.farDistM - b.farDistM);
    feederCandidates.slice(0, KOCHI_MAX_FEEDER_SPECS).forEach(({ direction, route, metroStation, farStation }) => {
      if (direction === 'metro-first') {
        const segments = [{ type: 'access', from, to: metroFrom, toName: metroFrom.name }];
        // No metro ride needed if the nearest station is already this route's metro-side stop.
        if (metroStation.index !== metroFrom.index) segments.push({ type: 'ride', legs: [planKochiMetroRideLeg(metroFrom.index, metroStation.index, now)] });
        segments.push({ type: 'ride', legs: [planKochiFeederBusRideLeg(route, now)] });
        segments.push({ type: 'access', from: farStation, to, toName });
        specs.push({ segments });
      } else {
        const segments = [{ type: 'access', from, to: farStation, toName: farStation.name }];
        segments.push({ type: 'ride', legs: [planKochiFeederBusRideLeg(route, now)] });
        if (metroStation.index !== metroTo.index) segments.push({ type: 'ride', legs: [planKochiMetroRideLeg(metroStation.index, metroTo.index, now)] });
        segments.push({ type: 'access', from: metroTo, to, toName });
        specs.push({ segments });
      }
    });
  }

  if (!specs.length) return null;

  // ---- Step 2: resolve access legs, deduped/shared via one per-call cache ----
  const legCache = new Map();
  const built = await Promise.all(specs.map(async (spec) => {
    const legs = [];
    for (const seg of spec.segments) {
      if (seg.type === 'ride') { legs.push(...seg.legs); continue; }
      const accessLeg = await cachedDriveOrWalkLeg(legCache, seg.from, seg.to, seg.toName);
      if (!accessLeg) return null;
      legs.push(accessLeg);
    }
    // Sums whatever ride legs have a real fare; fareIsPartial flags a total that's a floor,
    // not the real full fare, so rendering can show "from ₹X" instead of a precise number.
    const rideLegs = legs.filter((l) => l.mode === 'SUBWAY' || l.mode === 'FERRY' || l.mode === 'BUS');
    const pricedLegs = rideLegs.filter((l) => l.fareINR != null);
    return {
      legs,
      duration: legs.reduce((sum, l) => sum + (l.duration || 0), 0),
      distanceM: legs.reduce((sum, l) => sum + (l.distance || 0), 0),
      source: 'kochi',
      totalFareINR: pricedLegs.length ? pricedLegs.reduce((sum, l) => sum + l.fareINR, 0) : undefined,
      fareIsPartial: pricedLegs.length > 0 && pricedLegs.length < rideLegs.length,
    };
  }));

  // ---- Step 3: rank, dedupe, cap ----
  const survivors = built.filter(Boolean);
  if (!survivors.length) return null;
  const bySignature = new Map(); // ride-leg signature (mode+from+to per hop) -> fastest survivor seen for it
  survivors.forEach((it) => {
    const sig = it.legs.filter((l) => l.mode === 'SUBWAY' || l.mode === 'FERRY' || l.mode === 'BUS')
      .map((l) => `${l.mode}:${l.from.name}>${l.to.name}`).join('|');
    const existing = bySignature.get(sig);
    if (!existing || it.duration < existing.duration) bySignature.set(sig, it);
  });
  const ranked = [...bySignature.values()].sort((a, b) => a.duration - b.duration);
  // Pareto dominance: drop a candidate once an already-kept, faster-or-equal one is also
  // cheaper-or-equal (only when both fares are known) — keeps alternatives genuinely different.
  const kept = [];
  ranked.forEach((candidate) => {
    const dominated = kept.some((better) => better.totalFareINR != null && candidate.totalFareINR != null
      && better.totalFareINR <= candidate.totalFareINR);
    if (!dominated) kept.push(candidate);
  });
  return kept.slice(0, KOCHI_MAX_ITINERARY_OPTIONS);
}

const modeButtons = [...el.travelModeToggle.querySelectorAll('.mode-btn')];
const transitModeBtn = modeButtons.find((b) => b.dataset.mode === 'transit');
if (transitModeBtn) transitModeBtn.classList.toggle('hidden', !TRANSIT_ENABLED);
// Drive+Walk need no external service, so the toggle is always at least a
// two-way choice; Transit joins in only once OTP2_URL is configured.
if (modeButtons.filter((b) => !b.classList.contains('hidden')).length > 1) {
  el.travelModeToggle.classList.remove('hidden');
}
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.travelMode = btn.dataset.mode;
    modeButtons.forEach((b) => b.classList.toggle('active', b === btn));
    el.routeAvoidToggle.classList.toggle('hidden', state.travelMode !== 'drive');
    el.planBtn.classList.remove('hidden'); // travel mode changed — any route already shown was planned for the old mode
  });
});

// Avoid tolls/highways: independent toggles, drive-only — hidden for other modes. Only affects auto costing.
el.routeAvoidToggle.classList.toggle('hidden', state.travelMode !== 'drive');
const avoidButtons = [...el.routeAvoidToggle.querySelectorAll('.mode-btn')];
avoidButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.avoid;
    state[key] = !state[key];
    btn.classList.toggle('active', state[key]);
    el.planBtn.classList.remove('hidden'); // avoid-tolls/highways changed — any route already shown was planned without this
  });
});

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

/** Plans each leg of a multi-stop trip independently via buildKochiItineraries, then stitches
 * together each segment's fastest option — picking each segment's own best is provably the
 * fastest whole-trip total, since segments don't interact with each other. Returns null if any
 * segment can't be planned via Kochi's bundled network, same contract as buildKochiItineraries. */
async function buildKochiMultiStopItinerary(waypoints) {
  const segments = await Promise.all(
    waypoints.slice(0, -1).map((from, i) => {
      // Every segment but the last ends at a stop, not the real destination (see buildKochiItineraries' toName).
      const isLastSegment = i === waypoints.length - 2;
      const toName = isLastSegment ? 'your destination' : shortLabel(waypoints[i + 1]);
      return buildKochiItineraries(from, waypoints[i + 1], toName);
    }),
  );
  if (segments.some((s) => !s || !s.length)) return null;
  const chosen = segments.map((s) => s[0]); // each segment's own array is already ranked fastest-first
  // Priced only if at least one segment is; flagged partial unless every segment has a full fare.
  const anyFareKnown = chosen.some((it) => it.totalFareINR != null);
  return [{
    legs: chosen.flatMap((it) => it.legs),
    duration: chosen.reduce((sum, it) => sum + it.duration, 0),
    distanceM: chosen.reduce((sum, it) => sum + (it.distanceM || 0), 0),
    source: 'kochi',
    totalFareINR: anyFareKnown ? chosen.reduce((sum, it) => sum + (it.totalFareINR || 0), 0) : undefined,
    fareIsPartial: anyFareKnown && chosen.some((it) => it.totalFareINR == null || it.fareIsPartial),
  }];
}

/** Tries the bundled Kochi planner first, falling back to OTP2 (if configured) only when Kochi
 * produces no candidate. Always returns an array, even for OTP2's single itinerary. `stops` has
 * no OTP2 equivalent (its REST planner takes only fromPlace/toPlace), so a multi-stop trip that
 * Kochi can't plan fails outright rather than silently dropping the stops via an OTP2 fallback. */
async function requestTransitItineraries(from, to, stops = []) {
  try {
    const itineraries = stops.length
      ? await buildKochiMultiStopItinerary([from, ...stops, to])
      : await buildKochiItineraries(from, to);
    if (itineraries && itineraries.length) {
      resolverDebugLog(`Kochi transit: found ${itineraries.length} itinerary option(s)${stops.length ? ` (${stops.length} stop${stops.length === 1 ? '' : 's'})` : ''}.`, 'success');
      return itineraries;
    }
  } catch (err) {
    resolverDebugLog(`Kochi transit: planning failed — ${err.message}`, 'error');
  }
  if (stops.length) throw new Error("Transit with stops could only be planned through Kochi's bundled network, and this trip doesn't fit it end to end — try removing a stop.");
  if (!CONFIG.OTP2_URL) throw new Error('No transit route could be found between those two points.');
  return [await requestOtp2TransitRoute(from, to)];
}

/** OTP2's classic REST trip planner endpoint — stable across OTP1/OTP2,
 * simpler to call than constructing a GraphQL query for this app's needs. */
async function requestOtp2TransitRoute(from, to) {
  const url = `${CONFIG.OTP2_URL}/otp/routers/default/plan?fromPlace=${from.lat},${from.lon}`
    + `&toPlace=${to.lat},${to.lon}&mode=TRANSIT,WALK&numItineraries=1`;
  let res;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    resolverDebugLog(`Transit (OTP2): request failed — ${err.message}`, 'error');
    throw new Error(err.name === 'AbortError'
      ? 'The transit routing service is taking too long to respond. Try again in a moment.'
      : 'Could not reach the transit routing service. Check your connection or the OTP2 server address.');
  }
  if (!res.ok) {
    resolverDebugLog(`Transit (OTP2): service returned HTTP ${res.status}.`, 'error');
    throw new Error(`The transit routing service returned an error (HTTP ${res.status}).`);
  }
  const data = await res.json();
  if (data.error) {
    resolverDebugLog(`Transit (OTP2): ${data.error.msg || 'planning error, no message'}`, 'error');
    throw new Error(data.error.msg || 'No transit route could be found between those two points.');
  }
  const itineraries = data.plan && data.plan.itineraries;
  if (!itineraries || !itineraries.length) {
    resolverDebugLog('Transit (OTP2): no itineraries in response.', 'warn');
    throw new Error('No transit route could be found between those two points.');
  }
  resolverDebugLog(`Transit (OTP2): found an itinerary with ${itineraries[0].legs ? itineraries[0].legs.length : 0} leg(s).`, 'success');
  return itineraries[0];
}

function renderTransitManeuverList(legs) {
  el.maneuverList.innerHTML = '';
  legs.forEach((leg, i) => {
    const li = document.createElement('li');
    let instruction;
    if (leg.mode === 'WALK' || leg.mode === 'CAR') {
      const destName = i === legs.length - 1 ? 'your destination' : (leg.to && leg.to.name) || 'the next stop';
      instruction = `${leg.mode === 'WALK' ? 'Walk' : 'Drive'} to ${destName}`;
    } else {
      const routeName = leg.route || leg.routeShortName || leg.mode;
      const headsign = leg.headsign ? ` towards ${leg.headsign}` : '';
      const stopCount = leg.intermediateStops ? leg.intermediateStops.length + 1 : null;
      const stops = stopCount ? `, ride ${stopCount} stop${stopCount === 1 ? '' : 's'}` : '';
      instruction = `Board ${routeName}${headsign}${stops}, alight at ${(leg.to && leg.to.name) || 'the stop'}`;
    }
    const waitText = leg.waitsS ? formatWaitsText(leg.waitsS) : null; // waitsS only exists on Kochi-planned legs, not OTP2
    const waitLabel = leg.waitsS && leg.waitsS.length > 1 ? 'Next departures' : 'Next departure';
    const fareText = leg.fareINR != null ? ` &middot; ${formatFareINR(leg.fareINR)}` : '';
    li.innerHTML = `<div class="m-icon">${transitLegIcon(leg.mode)}</div>
      <div class="m-body">
        <div class="instr">${escapeHtml(instruction)}</div>
        ${waitText ? `<div class="meta next-departure">${waitLabel} ${escapeHtml(waitText)}</div>` : ''}
        <div class="meta">${formatDistance(leg.distance || 0)} &middot; ${formatDuration(leg.duration || 0)}${fareText}</div>
        ${leg.mode === 'SUBWAY' && leg.stations ? '<ol class="station-progress hidden"></ol>' : ''}
      </div>`;
    el.maneuverList.appendChild(li);
  });
}

/** Draws a transit itinerary as one line per leg, colour-coded by mode. No live-navigation counterpart. */
async function renderTransitRoute(itinerary) {
  state.transitItinerary = itinerary;
  const features = itinerary.legs.map((leg) => ({
    type: 'Feature',
    properties: { mode: leg.mode },
    geometry: {
      type: 'LineString',
      // Kochi legs are already decoded coordinates; only an OTP2 leg needs decoding, at precision-5 (not Valhalla's precision-6).
      coordinates: leg.geometry || decodePolyline(leg.legGeometry.points, 5),
    },
  }));

  await awaitMapLoad();
  map.getSource('route').setData(emptyFeatureCollection()); // clear any driving route
  // Alternates/traffic overlays live on their own sources — clear them too or they'd stay visible.
  map.getSource('route-alternates').setData(emptyFeatureCollection());
  map.getSource('route-traffic').setData(emptyFeatureCollection());
  map.getSource('transit-route').setData({ type: 'FeatureCollection', features });

  const allCoords = features.flatMap((f) => f.geometry.coordinates);
  const bounds = allCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(allCoords[0], allCoords[0]));
  map.fitBounds(bounds, { padding: 60, duration: 500 });

  renderTransitManeuverList(itinerary.legs);
  const totalDistM = itinerary.legs.reduce((sum, l) => sum + (l.distance || 0), 0);
  const fareSuffix = itinerary.totalFareINR != null ? ` · ${formatFareINR(itinerary.totalFareINR, itinerary.fareIsPartial)}` : '';
  el.sheetSummary.textContent = `${formatDistance(totalDistM)} · about ${formatDuration(itinerary.duration)}${fareSuffix}`;
  el.bottomSheet.classList.remove('hidden');
}

/** Builds/replaces the Kochi-itinerary alternative cards — a lighter, separate mechanism from
 * state.routeOptions/renderRouteOptions (reuses the same card CSS). Hidden with fewer than 2 options. */
function renderTransitItineraryOptions() {
  el.transitItineraryOptionsRow.innerHTML = '';
  const options = state.transitItineraryOptions;
  if (options.length < 2) {
    el.transitItineraryOptionsRow.classList.add('hidden');
    return;
  }
  const labels = buildTransitItineraryLabels(options);
  options.forEach((itinerary, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'route-option-card' + (i === state.selectedTransitItineraryIndex ? ' active' : '');
    const fareSuffix = itinerary.totalFareINR != null ? ` &middot; ${formatFareINR(itinerary.totalFareINR, itinerary.fareIsPartial)}` : '';
    card.innerHTML = `<div class="route-option-dist">${formatDistance(itinerary.distanceM || 0)}</div>
      <div class="route-option-time">${formatDuration(itinerary.duration)}${fareSuffix}</div>
      <div class="route-option-tag">${escapeHtml(labels[i])}</div>`;
    card.addEventListener('click', () => selectTransitItineraryOption(i));
    el.transitItineraryOptionsRow.appendChild(card);
  });
  el.transitItineraryOptionsRow.classList.remove('hidden');
}

/** Switches the active card; no network call, options are already in memory. Locked once tracking starts. */
async function selectTransitItineraryOption(index) {
  if (state.transitTracking || index === state.selectedTransitItineraryIndex || !state.transitItineraryOptions[index]) return;
  state.selectedTransitItineraryIndex = index;
  await renderTransitRoute(state.transitItineraryOptions[index]);
  renderTransitItineraryOptions(); // refreshes active-card highlighting
  updateSheetPeekHeight();
}

el.planBtn.addEventListener('click', async () => {
  if (!state.from || !state.to) {
    showStatus('Please pick both a starting point and a destination from the suggestion list.', 'error');
    return;
  }
  el.planBtn.disabled = true;
  showStatus(state.travelMode === 'transit' ? 'Finding transit route…' : state.travelMode === 'walk' ? 'Finding walking route…' : 'Finding route…', 'info', { sticky: true });
  try {
    forgetBackLayerIfTop(resetToRouteView); // closing poi-results (if open) by side effect of re-submitting the form
    resetToRouteView();
    state.routeOptions = [];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    // Mirrors the routeOptions reset above, so switching modes clears the other mode's leftovers too.
    state.transitItineraryOptions = [];
    state.selectedTransitItineraryIndex = 0;
    renderTransitItineraryOptions();
    if (state.travelMode === 'transit') {
      const itineraries = await requestTransitItineraries(state.from, state.to, getStops());
      state.transitItineraryOptions = itineraries;
      state.selectedTransitItineraryIndex = 0;
      await renderTransitRoute(itineraries[0]);
      renderTransitItineraryOptions();
      el.bottomSheet.classList.remove('expanded', 'half');
      // Live GPS-guided tracking only exists for a Kochi-sourced itinerary; OTP2 has no
      // bundled schedule/station data to detect boarding/alighting against.
      el.startNavBtn.classList.toggle('hidden', itineraries[0].source !== 'kochi');
      el.cancelRouteBtn.classList.remove('hidden');
      el.shareRouteBtn.classList.remove('hidden');
      updateSheetPeekHeight(); // see the same call in the drive/walk branch below for why this needs to happen after the buttons above are actually visible
      hideRouteSearchFeature(); // along-route search is drive-only (see scope note above addStopFromPoi)
      hideRouteChipsInline();
      clearStatus();
    } else { // 'drive' or 'walk' — identical pipeline, parameterized by costing
      state.currentLegIndex = 0;
      const stops = getStops();
      const costing = COSTING_BY_MODE[state.travelMode];
      const { trip, alternates } = await requestRoute(state.from, state.to, stops, 2, costing, { avoidTolls: state.avoidTolls, avoidHighways: state.avoidHighways });
      state.routeOptions = [trip, ...alternates];
      state.selectedRouteIndex = 0;
      await renderRouteOptions();
      await renderRoute(trip, { stops });
      el.bottomSheet.classList.remove('expanded', 'half');
      el.startNavBtn.classList.remove('hidden');
      el.cancelRouteBtn.classList.remove('hidden');
      el.shareRouteBtn.classList.remove('hidden');
      updateSheetPeekHeight(); // re-measure now that these buttons are visible (hidden buttons don't count toward height)
      showRouteChipsInline(); // not navigating yet — see #route-chips-inline vs the FAB in startNavigation
      const warning = checkRoutePlausibility(trip, state.from, state.to, stops.length > 0);
      if (warning) showStatus(warning, 'error'); else clearStatus();
    }
    el.planBtn.classList.add('hidden'); // route shown now, button reappears when from/to changes
    // Records a "recent search" as soon as a route is found, not only once navigation starts.
    addRecentTrip({
      originLabel: state.from.label, originLat: state.from.lat, originLon: state.from.lon,
      destLabel: state.to.label, destLat: state.to.lat, destLon: state.to.lon,
    }).catch((err) => {
      showStatus('Could not save this trip to Recent: ' + err.message, 'error');
    });
    replaceTopBackLayer(cancelPlannedRoute); // one back press discards the whole route, like Cancel
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    el.planBtn.disabled = false;
  }
});

// ---- Bottom sheet: drag the handle to resize, or just tap it to toggle ----
let sheetPeekPx = 136; // pre-first-measurement fallback, matches style.css
function sheetHalfPx() { return window.innerHeight * 0.42; } // keep in sync with .half's 42vh
function sheetExpandedPx() { return window.innerHeight * 0.72; } // keep in sync with .expanded's 72vh

// Keeps map controls clear of the bottom sheet at its current height, whatever that is.
const MAP_CONTROLS_CLEARANCE_GAP_PX = 14;
function syncMapControlsClearance() {
  const visible = !el.bottomSheet.classList.contains('hidden');
  const bottom = visible ? Math.ceil(el.bottomSheet.getBoundingClientRect().height) + MAP_CONTROLS_CLEARANCE_GAP_PX : 24;
  el.mapControls.style.bottom = `${bottom}px`;
  el.mapControlsLeft.style.bottom = `${bottom}px`;
}
new ResizeObserver(syncMapControlsClearance).observe(el.bottomSheet);

/** Measures the sheet's real rendered peek height instead of guessing, so no content gets clipped. */
function updateSheetPeekHeight() {
  const routeOptionsHeight = el.routeOptionsRow.classList.contains('hidden') ? 0 : el.routeOptionsRow.offsetHeight;
  const transitItineraryOptionsHeight = el.transitItineraryOptionsRow.classList.contains('hidden') ? 0 : el.transitItineraryOptionsRow.offsetHeight;
  const elevationHeight = el.elevationProfile.classList.contains('hidden') ? 0 : el.elevationProfile.offsetHeight;
  // Counts fully while navigating, since it's the only peek content then (route-options/elevation are hidden).
  const maneuverListHeight = el.maneuverList.classList.contains('hidden') ? 0 : el.maneuverList.offsetHeight;
  sheetPeekPx = Math.max(136, el.sheetHandle.offsetHeight + routeOptionsHeight + transitItineraryOptionsHeight + elevationHeight + el.sheetActions.offsetHeight + maneuverListHeight);
  // Only applied at rest in the peek state — .half/.expanded CSS and an active drag control it otherwise.
  if (!sheetDragging && currentSheetState() === 'peek') el.bottomSheet.style.maxHeight = `${sheetPeekPx}px`;
}

const SHEET_STOPS = [
  { state: 'peek', px: () => sheetPeekPx },
  { state: 'half', px: sheetHalfPx },
  { state: 'expanded', px: sheetExpandedPx },
];
function currentSheetState() {
  if (el.bottomSheet.classList.contains('expanded')) return 'expanded';
  if (el.bottomSheet.classList.contains('half')) return 'half';
  return 'peek';
}
function setSheetState(targetState) {
  // sheet-animate is only added for the duration of this deliberate change, so it doesn't fight updateSheetPeekHeight's plain measurements elsewhere.
  el.bottomSheet.classList.add('sheet-animate');
  el.bottomSheet.classList.toggle('half', targetState === 'half');
  el.bottomSheet.classList.toggle('expanded', targetState === 'expanded');
  // Peek has no CSS max-height of its own (just the static fallback), so reapply the measured value.
  if (targetState === 'peek') el.bottomSheet.style.maxHeight = `${sheetPeekPx}px`;
  setTimeout(() => el.bottomSheet.classList.remove('sheet-animate'), 300);
}
// Re-measure on resize/rotation, since content can rewrap to a different height.
window.addEventListener('resize', () => { if (!el.bottomSheet.classList.contains('hidden')) updateSheetPeekHeight(); });

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
  // Disable the transition so the map controls track the sheet edge live during drag, without lag.
  el.mapControls.classList.add('no-transition');
  el.mapControlsLeft.classList.add('no-transition');
  el.sheetHandle.setPointerCapture(e.pointerId);
});

el.sheetHandle.addEventListener('pointermove', (e) => {
  if (!sheetDragging) return;
  const dy = sheetDragStartY - e.clientY; // positive while dragging upward
  sheetDragDistance = Math.max(sheetDragDistance, Math.abs(dy));
  const height = Math.min(sheetExpandedPx(), Math.max(sheetPeekPx, sheetDragStartHeight + dy));
  el.bottomSheet.style.maxHeight = `${height}px`;
});

function endSheetDrag(e) {
  if (!sheetDragging) return;
  sheetDragging = false;
  el.bottomSheet.classList.remove('dragging');
  el.mapControls.classList.remove('no-transition');
  el.mapControlsLeft.classList.remove('no-transition');
  el.bottomSheet.style.maxHeight = ''; // hand control back to the CSS class
  if (sheetDragDistance < 10) {
    // Barely moved — treat as a tap: step to the next stop (peek → half → expanded → peek).
    const order = SHEET_STOPS.map((s) => s.state);
    const next = order[(order.indexOf(currentSheetState()) + 1) % order.length];
    setSheetState(next);
    return;
  }
  const dy = sheetDragStartY - e.clientY;
  const finalHeight = Math.min(sheetExpandedPx(), Math.max(sheetPeekPx, sheetDragStartHeight + dy));
  // Snaps to whichever stop the drag ended nearest to, not just past/before a midpoint.
  const nearest = SHEET_STOPS.reduce((a, b) => (
    Math.abs(b.px() - finalHeight) < Math.abs(a.px() - finalHeight) ? b : a
  ));
  setSheetState(nearest.state);
}
el.sheetHandle.addEventListener('pointerup', endSheetDrag);
el.sheetHandle.addEventListener('pointercancel', endSheetDrag);

/** Discards the currently planned route entirely and returns to a blank
 * search — the equivalent of Google Maps' "✕" on the directions panel. */
function cancelPlannedRoute() {
  if (state.transitTracking) endTransitNavigation(); // defensive: avoid leaving a GPS watch/wake lock orphaned
  clearBackLayers(); // discards the whole route (and anything nested on top, e.g. poi-results) back to true home
  state.route = null;
  state.transitItinerary = null;
  state.routeOptions = [];
  state.selectedRouteIndex = 0;
  state.transitItineraryOptions = [];
  state.selectedTransitItineraryIndex = 0;
  state.from = null;
  state.to = null;
  map.getSource('route').setData(emptyFeatureCollection());
  map.getSource('transit-route').setData(emptyFeatureCollection());
  map.getSource('route-alternates').setData(emptyFeatureCollection());
  map.getSource('route-traffic').setData(emptyFeatureCollection()); // its own source, painted over 'route' — must be cleared separately
  clearTraveledRouteSegment();
  el.routeOptionsRow.classList.add('hidden');
  el.transitItineraryOptionsRow.classList.add('hidden');
  el.transitItineraryOptionsRow.innerHTML = '';

  resetToRouteView();
  el.bottomSheet.classList.add('hidden');
  el.bottomSheet.classList.remove('expanded', 'half');
  el.maneuverList.innerHTML = '';
  el.startNavBtn.classList.add('hidden');
  el.cancelRouteBtn.classList.add('hidden');
  el.shareRouteBtn.classList.add('hidden');
  hideRouteSearchFeature();
  hideEffortFeature();
  hideRouteChipsInline();
  hideElevationProfile();

  el.fromInput.value = '';
  el.toInput.value = '';
  el.placeInput.value = '';
  hidePlaceCard();
  clearStops(); // also redraws the (empty) planning markers
  setPlanningUiMode('simple');
  el.planBtn.classList.remove('hidden'); // source/destination just cleared — need it back to plan a new trip

  clearCurrentTrip().catch(() => { /* non-fatal: a stale resume record just won't restore next launch */ });
}
el.cancelRouteBtn.addEventListener('click', cancelPlannedRoute); // explicit "discard everything", not a single back-step — see clearBackLayers

// ============================================================================
// Shareable route links — no server, so the whole route is encoded in the
// URL; opening one pre-fills the form (see applyShareLink) without auto-planning.
// ============================================================================

/** Base64url encode/decode of a unicode string — much shorter in a URL than encodeURIComponent(JSON). */
function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(b64url) {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Shrinks a place down to short name + coordinates rounded to 5 decimals (~1.1m, plenty for routing). */
function compactPlace(p) {
  return { lb: splitPlaceLabel(p.label).primary, la: Math.round(p.lat * 1e5) / 1e5, lo: Math.round(p.lon * 1e5) / 1e5 };
}

function buildShareUrl() {
  if (!state.from || !state.to) return null;
  const payload = { v: 1, m: state.travelMode, f: compactPlace(state.from), t: compactPlace(state.to), s: getStops().map(compactPlace) };
  return `${location.origin}${location.pathname}?share=${base64UrlEncode(JSON.stringify(payload))}`;
}

el.shareRouteBtn.addEventListener('click', async () => {
  const url = buildShareUrl();
  if (!url) return;
  const shareData = {
    title: 'Navigator route',
    text: `Directions: ${shortLabel(state.from)} → ${shortLabel(state.to)}`,
    url,
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err.name !== 'AbortError') showStatus('Could not share: ' + err.message, 'error'); // AbortError: user dismissed the share sheet, not a failure
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showStatus('Route link copied to clipboard.', 'success');
  } catch (err) {
    showStatus('Could not copy the link: ' + err.message, 'error');
  }
});

/** Reverses compactPlace; returns null on anything malformed so a bad link is just ignored. */
function expandPlace(p) {
  if (!p || typeof p.la !== 'number' || typeof p.lo !== 'number' || typeof p.lb !== 'string') return null;
  return { label: p.lb, lat: p.la, lon: p.lo };
}

/** Reads the OS "Share" params (manifest.json's share_target) from Android's share sheet, if present. */
function parseShareTargetParam() {
  const params = new URLSearchParams(location.search);
  const combined = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join(' ');
  return combined.trim() || null;
}

/** Resolves shared text the same way pasting it into the search box would. */
async function handleSharedGoogleMapsLink(text) {
  showStatus('Resolving shared Google Maps link…', 'info');
  const resolved = await resolveGoogleMapsLink(text);
  if (resolved.lat != null) {
    el.placeInput.value = resolved.label;
    selectPlace(resolved);
    autoBookmarkGoogleMapsLink(resolved);
  } else {
    showStatus(`That shared link couldn't be resolved — ${resolved.error}.`, 'error', resolved.matchedUrl
      ? { sticky: true, link: { href: resolved.matchedUrl, text: 'Open the original link' } }
      : {});
  }
}

/** Reads and validates the `?share=` param; returns null on anything malformed instead of throwing.
 * Note: URLSearchParams already decodes it once — don't decodeURIComponent again, it would corrupt a literal '%' in a label. */
function parseShareParam() {
  const raw = new URLSearchParams(location.search).get('share');
  if (!raw) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(raw));
    const from = expandPlace(payload.f);
    const to = expandPlace(payload.t);
    if (!from || !to) return null;
    const stops = Array.isArray(payload.s) ? payload.s.map(expandPlace).filter(Boolean) : [];
    return { mode: payload.m, from, to, stops };
  } catch (err) {
    return null;
  }
}

/** Populates the directions form from a shared link without auto-submitting it. */
function applyShareLink(payload) {
  const rawStops = Array.isArray(payload.stops) ? payload.stops : [];
  const trimmed = rawStops.length > CONFIG.MAX_STOPS;
  const stops = rawStops.slice(0, CONFIG.MAX_STOPS);

  let mode = ['drive', 'walk', 'transit'].includes(payload.mode) ? payload.mode : 'drive';
  let modeFellBack = false;
  if (mode === 'transit' && !TRANSIT_ENABLED) { mode = 'drive'; modeFellBack = true; }
  state.travelMode = mode;
  modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));

  goToDirections({ from: payload.from, to: payload.to }); // also clears/redraws stops+markers, opens directions UI, pushes its own back layer
  stops.forEach((s) => addStopRow(s));
  updatePlanningMarkers();

  if (trimmed) {
    showStatus(`This link had more stops than the ${CONFIG.MAX_STOPS}-stop limit — showing the first ${CONFIG.MAX_STOPS}.`, 'error');
  } else if (modeFellBack) {
    showStatus("Transit isn't set up on this server — showing Drive instead.", 'error');
  } else {
    showStatus('Route loaded from a shared link — tap "Get directions" to plan it.', 'info');
  }
}

// ============================================================================
// Live tracking, voice guidance, deviation/reroute
// ============================================================================

// getVoices() is async — the list is empty until 'voiceschanged' fires. Priming it early
// (rather than waiting for navigation to start) avoids a silent no-op speak() in the Android WebView.
let cachedVoices = [];
function primeSpeechVoices() {
  if (!('speechSynthesis' in window)) return;
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoices = window.speechSynthesis.getVoices();
    resolverDebugLog(`speechSynthesis: voiceschanged fired, ${cachedVoices.length} voice(s) now available.`);
    populateVoiceSelect(cachedVoices);
  });
}
primeSpeechVoices();

// Stored by voiceURI, not index, since a voice list's order isn't stable across reloads.
// native-tts.js duplicates this exact key literal — keep both in sync.
const VOICE_URI_STORAGE_KEY = 'preferredVoiceURI';

/** Fills the Settings voice picker, falling back to "System default" if the stored voice is gone. */
function populateVoiceSelect(voices) {
  if (!el.voiceSelect) return;
  const preferred = localStorage.getItem(VOICE_URI_STORAGE_KEY) || '';
  el.voiceSelect.innerHTML = ['<option value="">System default</option>']
    .concat(voices.map((v) => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`))
    .join('');
  el.voiceSelect.value = voices.some((v) => v.voiceURI === preferred) ? preferred : '';
}

if (isNativePlatform()) {
  primeNativeVoices()
    .then((voices) => populateVoiceSelect(voices))
    .catch((err) => {
      resolverDebugLog(`Voice picker: failed to load native voices — ${err.message}`, 'error');
      // Some OEM builds return a null voice set — hide the picker row rather than show it empty.
      // Turn-by-turn guidance itself still works via the device's default voice.
      el.voiceSelect?.closest('.docs-toggle-row')?.classList.add('hidden');
    });
} else {
  populateVoiceSelect(cachedVoices); // may still be empty here — voiceschanged repopulates once the browser's list is ready
}

if (el.voiceSelect) {
  el.voiceSelect.addEventListener('change', () => {
    if (el.voiceSelect.value) localStorage.setItem(VOICE_URI_STORAGE_KEY, el.voiceSelect.value);
    else localStorage.removeItem(VOICE_URI_STORAGE_KEY);
    resolverDebugLog(`Voice: preferred voice set to "${el.voiceSelect.value || '(system default)'}" via the Settings dropdown.`);
  });
}

// See CONFIG.VOICE_MIN_GAP_MS. Waits on dispatchSpeak's real completion signal, not a flat
// timer, so the queue can't build a backlog and lag behind on a long multi-turn drive.
function voiceGapDelay() {
  return new Promise((resolve) => setTimeout(resolve, CONFIG.VOICE_MIN_GAP_MS));
}

// Every queued voice line chains onto this; starts pre-resolved so the first call dispatches immediately.
let voiceQueueTail = Promise.resolve();

function speak(text, { queue = false } = {}) {
  if (state.voiceMode === 'off') return;
  if (!queue) {
    // A flush dispatches immediately, but still resets the queue tail so anything queued next waits its turn.
    voiceQueueTail = dispatchSpeak(text, queue).then(voiceGapDelay);
    return;
  }
  voiceQueueTail = voiceQueueTail.then(() => dispatchSpeak(text, queue)).then(voiceGapDelay);
}

/** Speak-it-now logic split out from speak() so the queue chain can wait on it. Never rejects. */
function dispatchSpeak(text, queue) {
  if (state.voiceMode === 'off') return Promise.resolve(); // may have been turned off while this queued line was waiting its turn

  if (isNativePlatform()) {
    // Android's WebView never implements Web Speech Synthesis, so the native shell uses real TTS instead (see native-tts.js).
    resolverDebugLog(`speak() [native]: "${text}"${queue ? ' (queued)' : ''}`);
    // speakNative()'s promise resolves on the plugin's real onDone callback, a genuine completion signal.
    return speakNative(text, { queue }).catch((err) => resolverDebugLog(`speak() [native]: threw "${err.message}" for "${text}"`, 'error'));
  }

  if (!('speechSynthesis' in window)) {
    resolverDebugLog('speak(): speechSynthesis not supported on this WebView/browser — voice guidance unavailable.', 'error');
    return Promise.resolve(); // silently unsupported, never crashes navigation
  }
  try {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume(); // WebView can leave the queue stuck paused after backgrounding
    // Only cancel if something's actually in flight — unconditional cancel() has raced the native TTS
    // bridge and killed the new utterance instead of the old one on some Android WebViews. `queue: true`
    // (turn guidance) skips this so a driver always hears the in-flight instruction finish first.
    if (!queue && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Explicitly resolving a voice is the known fix for WebViews that silently no-op with none resolved.
    const preferredVoiceURI = localStorage.getItem(VOICE_URI_STORAGE_KEY);
    const voice = (preferredVoiceURI && cachedVoices.find((v) => v.voiceURI === preferredVoiceURI))
      || cachedVoices.find((v) => v.lang && v.lang.startsWith('en'))
      || cachedVoices[0];
    if (voice) utterance.voice = voice;
    resolverDebugLog(`speak(): "${text}" (voice=${voice ? voice.name : '(default, none resolved)'}, ${cachedVoices.length} voice(s) known)`);
    return new Promise((resolve) => {
      // onend/onerror both resolve (never reject) — a cancelled or failed
      // utterance shouldn't wedge every queued line behind it forever.
      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        resolverDebugLog(`speak(): utterance error "${e.error}" for "${text}"`, 'error');
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  } catch (err) {
    resolverDebugLog(`speak(): threw "${err.message}" for "${text}"`, 'error');
    return Promise.resolve();
  }
}

/** Short two-tone reroute chime, deliberately not a voice prompt so it plays regardless of voiceMode.
 * Built with Web Audio (no bundled audio file); AudioContext is reused, never thrown from. */
let alertAudioCtx = null;
function playAlertTone() {
  try {
    if (!alertAudioCtx) alertAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = alertAudioCtx;
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  } catch (err) {
    // Web Audio unsupported/blocked — never let this break navigation.
  }
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

/** Paints the driven portion of the route dull gray so it falls away as you progress.
 * Also filters out any traffic-overlay dash already behind traveledM, so an old check-in's
 * color doesn't stay bright behind you — filtering just reveals the gray line underneath. */
function updateTraveledRouteSegment(traveledM) {
  if (!state.route || traveledM <= 0) {
    map.getSource('route-traveled').setData(emptyFeatureCollection());
    map.setFilter('route-traffic-line', null);
    return;
  }
  const traveled = turf.lineSliceAlong(state.route.lineFeature, 0, Math.min(traveledM, state.route.totalDistM), { units: 'meters' });
  map.getSource('route-traveled').setData(traveled);
  map.setFilter('route-traffic-line', ['>', ['get', 'endM'], traveledM]);
}
function clearTraveledRouteSegment() {
  map.getSource('route-traveled').setData(emptyFeatureCollection());
  map.setFilter('route-traffic-line', null);
}

/** Figures out which maneuver is "next" from distance travelled, updates the banner/list, and
 * fires the voice prompt within a speed-scaled lead distance. currentManeuverIdx only ratchets forward. */
function updateActiveManeuver(traveledM, lngLat) {
  const maneuvers = state.route.maneuvers;
  // Raw candidate maneuver index — GPS jitter can flicker this across a boundary, so it's not used directly (see the ratchet below).
  let candidateIdx = 0;
  for (let i = 0; i < maneuvers.length; i++) {
    if (maneuvers[i].startDistM <= traveledM) candidateIdx = i;
    else break;
  }
  // Forward-only ratchet with hysteresis on the single-step case, to stop GPS jitter flickering
  // the banner/voice between two maneuvers near their shared boundary.
  if (candidateIdx === state.currentManeuverIdx + 1) {
    if (traveledM >= maneuvers[candidateIdx].startDistM + CONFIG.MANEUVER_ADVANCE_HYSTERESIS_M) {
      state.currentManeuverIdx = candidateIdx;
    }
  } else if (candidateIdx > state.currentManeuverIdx + 1) {
    state.currentManeuverIdx = candidateIdx;
  }
  const currentIdx = state.currentManeuverIdx;
  state.currentLegIndex = maneuvers[currentIdx].legIndex; // which origin/stop/destination leg we're on, for reroute
  const nextIdx = currentIdx + 1 < maneuvers.length ? currentIdx + 1 : null;
  const remainingM = Math.max(0, state.route.totalDistM - traveledM);
  let distToNextM = 0; // hoisted out of the if/nextIdx block below — also needed at the native-car.js call site further down

  // Ends the ride by remaining distance alone, not by maneuver index — Valhalla's cumulative
  // lengths and turf's measured distance can drift apart on a long route, so gating on
  // nextIdx === null could mean arrival is never detected. Requires ARRIVAL_CONFIRM_FIXES
  // consecutive fixes (see config.js), and also checks straight-line distance to the
  // destination itself — a route can pass close to itself elsewhere (ramps, service roads),
  // and remainingM alone could then end the trip early at the wrong spot.
  const straightLineToDestM = lngLat ? turf.distance(lngLat, [state.to.lon, state.to.lat], { units: 'meters' }) : 0;
  if (!state.arrivedAnnounced && remainingM <= CONFIG.ARRIVAL_RADIUS_M && straightLineToDestM <= CONFIG.ARRIVAL_RADIUS_M * 2) {
    state.arrivalCandidateStreak += 1;
  } else {
    state.arrivalCandidateStreak = 0;
  }
  if (!state.arrivedAnnounced && state.arrivalCandidateStreak >= CONFIG.ARRIVAL_CONFIRM_FIXES) {
    state.arrivedAnnounced = true;
    speak('You have arrived at your destination.');
    endNavigation({ showSummary: true, arrived: true }); // showSummary kept for when the (currently disabled) summary panel returns
    return; // navigation just ended — nothing below is still meaningful
  }

  // "Continue straight for X km", spoken once at the start of a straight run (not every
  // maneuver in it, since straightAheadDistanceM already looks ahead through the whole run).
  const current = maneuvers[currentIdx];
  const startsStraightRun = CONTINUE_STRAIGHT_TYPES.has(current.type)
    && (currentIdx === 0 || !CONTINUE_STRAIGHT_TYPES.has(maneuvers[currentIdx - 1].type));
  if (startsStraightRun && !state.spokenContinue.has(currentIdx)) {
    const aheadM = straightAheadDistanceM(maneuvers, currentIdx);
    if (aheadM >= CONTINUE_STRAIGHT_MIN_LENGTH_M) {
      state.spokenContinue.add(currentIdx);
      resolverDebugLog(`Voice: continue-straight run starting at maneuver ${currentIdx}, aggregate ${Math.round(aheadM)}m ahead (own maneuver length alone: ${Math.round(current.lengthM)}m) — announcing the aggregate.`);
      speak(`Continue straight for ${formatDistanceForSpeech(aheadM)}.`, { queue: true });
    }
  }

  if (nextIdx !== null) {
    distToNextM = Math.max(0, maneuvers[nextIdx].startDistM - traveledM);
    highlightManeuver(nextIdx);
    el.navBannerIcon.innerHTML = maneuverIcon(maneuvers[nextIdx].type);
    el.navBannerInstruction.textContent = maneuvers[nextIdx].instruction;
    el.navBannerDistance.textContent = 'in ' + formatDistance(distToNextM);

    // Two-stage voice prompt per maneuver: an early "in X meters, turn right" heads-up, then a
    // short "turn right" reminder. Each stage fires once, with speed-scaled lead distances.
    const next = maneuvers[nextIdx];
    const farText = (next.verbalMultiCue && next.verbalPreTransition) ? next.verbalPreTransition : next.instruction;
    const farLeadM = dynamicVoiceLeadM(CONFIG.VOICE_PROMPT_LEAD_TIME_S, CONFIG.VOICE_PROMPT_MIN_M, CONFIG.VOICE_PROMPT_MAX_M) + speechDurationLeadM(farText);
    const nearLeadM = dynamicVoiceLeadM(CONFIG.VOICE_NEAR_LEAD_TIME_S, CONFIG.VOICE_NEAR_MIN_M, CONFIG.VOICE_NEAR_MAX_M) + speechDurationLeadM(next.instruction);
    // Not gated on `distToNextM > nearLeadM` — a coarse GPS fix could jump past farLeadM into the
    // near window in one tick, so firing purely on farLeadM guarantees at least one far cue.
    if (distToNextM <= farLeadM && !state.spokenFar.has(nextIdx)) {
      const speedMps = state.currentSpeedMps ?? CONFIG.VOICE_DEFAULT_SPEED_MPS;
      resolverDebugLog(`Voice: maneuver ${nextIdx} far cue triggered at ${Math.round(distToNextM)}m (base lead ${Math.round(farLeadM - speechDurationLeadM(farText))}m + ${Math.round(speechDurationLeadM(farText))}m speech-duration compensation = ${Math.round(farLeadM)}m, speed ${speedMps.toFixed(1)}m/s).`);
      if (next.verbalMultiCue && next.verbalPreTransition) {
        // Valhalla's combined phrase for two turns too close to speak separately.
        speak(next.verbalPreTransition, { queue: true });
        state.spokenNear.add(nextIdx); // already covers the near callout too
      } else if (distToNextM < 10) {
        // Under 10m would read as "In 0 meters, turn left" — speak the bare instruction instead.
        speak(next.instruction, { queue: true });
        state.spokenNear.add(nextIdx);
      } else {
        speak(`In ${formatDistanceForSpeech(distToNextM)}, ${next.instruction}`, { queue: true });
        // Already inside the near window this tick — mark done so the near block below doesn't repeat it.
        if (distToNextM <= nearLeadM) {
          resolverDebugLog(`Voice: far/near skip-collapse for maneuver ${nextIdx} (distToNextM=${Math.round(distToNextM)}m already inside nearLeadM=${Math.round(nearLeadM)}m on the same tick) — spoke the far phrasing once instead of a separate near repeat.`);
          state.spokenNear.add(nextIdx);
        }
      }
      state.spokenFar.add(nextIdx);
    }
    if (distToNextM <= nearLeadM && !state.spokenNear.has(nextIdx)) {
      speak(maneuvers[nextIdx].instruction, { queue: true });
      state.spokenNear.add(nextIdx);
    }
  } else {
    // Past the start of the final maneuver but not yet within ARRIVAL_RADIUS_M — just show "Arriving".
    highlightManeuver(currentIdx);
    el.navBannerIcon.innerHTML = maneuverIcon(4); // flag
    el.navBannerInstruction.textContent = maneuvers[currentIdx].instruction || 'You have arrived';
    el.navBannerDistance.textContent = 'Arriving';
  }

  checkInclineAnnouncement(traveledM);

  // Live ETA line in the collapsed bottom sheet, replacing the static total-trip summary.
  let remainingTimeS = state.route.totalDistM > 0
    ? state.route.totalTimeS * (remainingM / state.route.totalDistM)
    : 0;
  let etaSuffix = '';
  if (state.trafficRatio != null && state.trafficRatio < CONFIG.TRAFFIC_HEAVY_THRESHOLD) {
    remainingTimeS = remainingTimeS / state.trafficRatio; // inverse of the ratio — still just an estimate
    etaSuffix = ' (traffic, est.)';
  }
  el.sheetSummary.textContent = `${formatDistance(remainingM)} remaining · about ${formatDuration(remainingTimeS)}${etaSuffix}`;

  // Native Picture-in-Picture mini view, kept in sync with the on-screen banner. Best-effort.
  if (isNativePlatform()) {
    updatePipTurnCard({
      maneuverKind: nextIdx !== null ? maneuverPipIconKey(maneuvers[nextIdx].type) : 'arrive',
      instruction: el.navBannerInstruction.textContent,
      distanceText: el.navBannerDistance.textContent,
      etaText: `${formatDistance(remainingM)} left · ${formatDuration(remainingTimeS)}`,
    }).catch(() => {});
    // Android Auto's NavigationTemplate — same tick, raw numbers instead of
    // pre-formatted text since the car template needs a real Distance
    // object natively, not a string (see CarNavState/NavigationScreen.java).
    updateCarNavTurnCard({
      maneuverKind: nextIdx !== null ? maneuverPipIconKey(maneuvers[nextIdx].type) : 'arrive',
      instruction: el.navBannerInstruction.textContent,
      stepDistM: distToNextM,
      remainingDistM: remainingM,
      remainingTimeS,
    }).catch(() => {});
  }
}

/** Walk-mode only: speaks a one-time heads-up for the next sustained climb/descent, keyed by
 * each segment's startDistM (stable for the route's lifetime) so it's only ever announced once. */
function checkInclineAnnouncement(traveledM) {
  if (state.travelMode !== 'walk' || !state.route.gradeSegments) return;
  const leadM = dynamicVoiceLeadM(CONFIG.INCLINE_LEAD_TIME_S, CONFIG.INCLINE_LEAD_MIN_M, CONFIG.INCLINE_LEAD_MAX_M);
  const segment = state.route.gradeSegments.find((s) => (
    s.startDistM >= traveledM && s.startDistM - traveledM <= leadM && !state.spokenInclines.has(s.startDistM)
  ));
  if (!segment) return;
  state.spokenInclines.add(segment.startDistM);
  const grade = Math.abs(segment.avgGradePct);
  if (grade < CONFIG.INCLINE_GRADE_MODERATE_PCT) return; // too gentle to be worth a voice cue
  const steepness = grade >= CONFIG.INCLINE_GRADE_STEEP_PCT ? 'Steep' : 'Moderate';
  const direction = segment.netHeightM > 0 ? 'incline' : 'downhill';
  const lengthM = segment.endDistM - segment.startDistM;
  const distToStartM = Math.max(0, segment.startDistM - traveledM);
  // Already at (or essentially at) the start of the hill — "for the next
  // X" reads more naturally than "in 0 meters, for the next X".
  const phrase = distToStartM <= 5
    ? `${steepness} ${direction} for the next ${formatDistanceForSpeech(lengthM)}.`
    : `${steepness} ${direction} in ${formatDistanceForSpeech(distToStartM)}, for the next ${formatDistanceForSpeech(lengthM)}.`;
  resolverDebugLog(`Voice: incline segment at ${Math.round(segment.startDistM)}m (grade ${grade.toFixed(1)}%, length ${Math.round(lengthM)}m) — announcing "${phrase}"`);
  speak(phrase, { queue: true });
}

/** Triggers a reroute once continuously off-route for DEVIATION_DURATION_MS; resets instantly
 * once back within threshold, so brief GPS noise never fires a spurious reroute. */
function checkDeviation(offsetM, currentLngLat) {
  if (state.isRerouting) return;
  if (offsetM > CONFIG.DEVIATION_THRESHOLD_M) {
    if (state.offRouteSince == null) state.offRouteSince = Date.now();
    if (Date.now() - state.offRouteSince > CONFIG.DEVIATION_DURATION_MS) {
      triggerReroute(currentLngLat);
    }
  } else if (offsetM <= CONFIG.DEVIATION_CLEAR_THRESHOLD_M) {
    // Clear only once meaningfully under the threshold, so a road running close to the route doesn't flap the timer.
    state.offRouteSince = null;
  }
}

/** If offline or the request fails, keeps guiding off the last known-good route and retries
 * automatically once connectivity returns, rather than stranding the driver. */
async function triggerReroute(currentLngLat) {
  if (state.isRerouting) return;
  state.isRerouting = true;
  playAlertTone(); // a distinct earcon, not a voice prompt — see playAlertTone's own comment

  if (!navigator.onLine) {
    showStatus('Off route, no signal — continuing on the current route until reconnected.', 'error', { sticky: true });
    state.pendingRerouteFrom = currentLngLat;
    state.offRouteSince = null;
    state.isRerouting = false;
    return;
  }

  showStatus('Off route — recalculating…', 'info', { sticky: true });
  try {
    // Heading hint tells Valhalla which way to snap the new start, so it doesn't emit a needless U-turn.
    const from = { lat: currentLngLat[1], lon: currentLngLat[0] };
    if (typeof state.lastHeading === 'number' && !Number.isNaN(state.lastHeading)) {
      from.heading = Math.round(state.lastHeading);
      from.heading_tolerance = 45;
    }
    // Only route through stops still ahead; uses state.route.stops since currentLegIndex is relative to it.
    const remainingStops = state.route.stops.slice(state.currentLegIndex);
    const { trip } = await requestRoute(from, state.to, remainingStops, 0, COSTING_BY_MODE[state.travelMode], { avoidTolls: state.avoidTolls, avoidHighways: state.avoidHighways }); // no alternates — mid-reroute isn't the moment for route choice
    state.routeOptions = [trip];
    state.selectedRouteIndex = 0;
    await renderRouteOptions();
    await renderRoute(trip, { fitView: false, stops: remainingStops }); // camera keeps following the puck
    state.pendingRerouteFrom = null;
    const warning = checkRoutePlausibility(trip, from, state.to, remainingStops.length > 0);
    if (warning) showStatus(warning, 'error'); else clearStatus();
  } catch (err) {
    // Re-check connectivity here too, since it can drop mid-request.
    if (!navigator.onLine) {
      showStatus('Off route, no signal — continuing on the current route until reconnected.', 'error', { sticky: true });
      state.pendingRerouteFrom = currentLngLat;
    } else {
      showStatus(`Could not recalculate — continuing on the current route (${err.message})`, 'error', { sticky: true });
    }
  } finally {
    state.offRouteSince = null;
    state.isRerouting = false;
  }
}

// Retry a deferred reroute the instant connectivity returns, rather than waiting for the next dwell cycle.
window.addEventListener('online', () => {
  if (state.navigating && state.pendingRerouteFrom && !state.isRerouting) {
    showStatus('Back online — recalculating your route…', 'info', { sticky: true });
    triggerReroute(state.pendingRerouteFrom);
  }
});

/** `coords.speed` is null when unavailable (common with poor GPS) — shown as a dash, not an error. */
function updateSpeedText(speed) {
  el.navSpeed.textContent = typeof speed === 'number' && !Number.isNaN(speed)
    ? `${Math.max(0, Math.round(speed * 3.6))} km/h`
    : '— km/h';
}

function onPositionUpdate(pos) {
  // Kochi transit live tracking branches to its own separate handler entirely.
  if (state.travelMode === 'transit' && state.transitTracking) { onTransitPositionUpdate(pos); return; }
  const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
  const lngLat = [lng, lat];
  updateSpeedText(speed);

  // Fix-to-fix distance/time vs the previous fix, shared by the derived-speed and heading fallbacks below.
  let movedM = null;
  let dtS = null;
  if (state.lastFix) {
    movedM = turf.distance([state.lastFix.lng, state.lastFix.lat], lngLat, { units: 'meters' });
    dtS = ((pos.timestamp || Date.now()) - state.lastFix.t) / 1000;
  }
  const derivedSpeedMps = (dtS != null && dtS >= 0.5 && dtS <= 10) ? movedM / dtS : null; // only trusted in a sane time window
  // pos.coords.speed is null on plenty of real fixes — derive from position+time instead of
  // falling back to a flat constant, so voice-guidance timing keeps tracking actual speed.
  state.currentSpeedMps = (typeof speed === 'number' && !Number.isNaN(speed) && speed >= 0) ? speed : derivedSpeedMps;

  // Heading: prefer the device compass/course; fall back to a bearing from the last two fixes.
  let headingDeg = state.lastHeading;
  if (typeof heading === 'number' && !Number.isNaN(heading)) {
    headingDeg = heading;
  } else if (movedM != null && movedM > 0.5) {
    headingDeg = (turf.bearing([state.lastFix.lng, state.lastFix.lat], lngLat) + 360) % 360;
  }
  state.lastHeading = headingDeg;
  state.lastFix = { lng, lat, t: pos.timestamp || Date.now() };
  refreshWeatherBadge(); // fire-and-forget; cache's coarse time bucket stops this from refetching every tick

  // Snap the live fix onto the route line: `location` is distance travelled, `dist` is the
  // perpendicular offset. Used for maneuver-advance/deviation below and where the puck is drawn —
  // only the display position is snapped, distance calculations below still use the raw fix.
  let displayLngLat = lngLat;
  let traveledM = null;
  let offsetM = null;
  if (state.route) {
    const snapped = turf.nearestPointOnLine(state.route.lineFeature, turf.point(lngLat), { units: 'meters' });
    traveledM = snapped.properties.location;
    offsetM = snapped.properties.dist;
    if (offsetM <= CONFIG.PUCK_SNAP_MAX_OFFSET_M) displayLngLat = snapped.geometry.coordinates; // absorb jitter, but show a genuine deviation unsnapped
  }

  updatePuck(displayLngLat, headingDeg);
  if (state.followMode) followCamera(displayLngLat, headingDeg);
  // Android Auto's SurfaceCallback map puck — same cadence as the WebView puck above.
  if (isNativePlatform()) updateCarNavPosition({ lng: displayLngLat[0], lat: displayLngLat[1], headingDeg }).catch(() => {});
  if (!state.route) return;

  state.traveledM = traveledM;
  updateTraveledRouteSegment(traveledM);
  updateLiveAscent(traveledM);
  updateSpeedLimitSign(traveledM);

  updateActiveManeuver(traveledM, lngLat);
  checkDeviation(offsetM, lngLat);
  maybeCheckTraffic(traveledM);
  resaveNavigatingTripThrottled();
}

/** Linearly interpolates height at `distM` along `rangeHeight` ([[cumulativeDistM, heightM], ...],
 * ~30m apart) so live tracking is smoother than jumping between samples. Clamps at the ends. */
function interpolateHeightM(rangeHeight, distM) {
  if (distM <= rangeHeight[0][0]) return rangeHeight[0][1];
  const last = rangeHeight[rangeHeight.length - 1];
  if (distM >= last[0]) return last[1];
  for (let i = 1; i < rangeHeight.length; i++) {
    const [d1, h1] = rangeHeight[i - 1];
    const [d2, h2] = rangeHeight[i];
    if (distM <= d2) {
      const t = (distM - d1) / (d2 - d1 || 1);
      return h1 + (h2 - h1) * t;
    }
  }
  return last[1];
}

/** Accumulates state.liveAscentM/liveDescentM as the live position advances, feeding the
 * "Effort" readout. Walk mode + elevation data only; a no-op until rangeHeight resolves. */
function updateLiveAscent(traveledM) {
  if (state.travelMode !== 'walk' || !state.route.rangeHeight) return;
  const heightM = interpolateHeightM(state.route.rangeHeight, traveledM);
  if (state.lastElevationHeightM != null) {
    const diff = heightM - state.lastElevationHeightM;
    if (diff > 0) state.liveAscentM += diff; else state.liveDescentM += -diff;
  }
  state.lastElevationHeightM = heightM;
  if (!el.effortBtn.classList.contains('hidden')) updateEffortBtnLabel();
}

/** Updates the round speed-limit sign; a no-op until speedLimitProfile resolves. Hides the
 * sign rather than showing a stale/wrong number once traveledM runs past the last known segment. */
function updateSpeedLimitSign(traveledM) {
  if (state.travelMode !== 'drive' || !state.route.speedLimitProfile) { el.speedLimitSign.classList.add('hidden'); return; }
  const seg = speedLimitAt(state.route.speedLimitProfile, traveledM);
  if (!seg) { el.speedLimitSign.classList.add('hidden'); return; }
  el.speedLimitValue.textContent = String(Math.round(seg.speedLimitKmh));
  el.speedLimitSign.classList.toggle('guessed', seg.isGuessed);
  el.speedLimitSign.classList.remove('hidden');
}

let lastTripResaveAt = 0;
/** Keeps the persisted "currently navigating" record in sync with reroutes, so resume-on-reload
 * doesn't restart on a superseded route. Throttled well below GPS cadence to avoid hammering IndexedDB. */
function resaveNavigatingTripThrottled() {
  const now = Date.now();
  if (now - lastTripResaveAt < 15000) return;
  lastTripResaveAt = now;
  saveCurrentTrip({ route: state.route, from: state.from, to: state.to, stops: getStops(), travelMode: state.travelMode, navigating: true })
    .then(() => {
      // No ordering guarantee vs endNavigation's clearCurrentTrip, so re-check after this resolves.
      if (!state.navigating) clearCurrentTrip().catch(() => {});
    })
    .catch(() => { /* non-fatal — see startNavigation's own save for the same reasoning */ });
}

function onPositionError(err) {
  // The native background-geolocation plugin uses a string `code` (e.g. "NOT_AUTHORIZED"), not the
  // browser's numeric GeolocationPositionError constants — checked explicitly below so a disabled
  // Location service on Android is reported accurately instead of falling through to "lost signal".
  const endAnyNavigation = () => (state.transitTracking ? endTransitNavigation() : endNavigation());
  const isLocationServiceDisabled = err.code === 'NOT_AUTHORIZED' && /disabled/i.test(err.message || '');
  if (isLocationServiceDisabled) {
    showStatus('Location is turned off on this device. Turn it on to continue navigation.', 'error');
    endAnyNavigation();
  } else if (err.code === err.PERMISSION_DENIED || err.code === 'NOT_AUTHORIZED') {
    showStatus('Location access was denied. Allow location permission for this site to use turn-by-turn navigation.', 'error');
    endAnyNavigation();
  } else if (err.code === err.TIMEOUT) {
    showStatus('Still waiting for a GPS fix…', 'info');
  } else {
    showStatus('Lost GPS signal. Still trying to reconnect…', 'info');
  }
}

/** Back-layer closeFn while driving. Vetoes (returns true) so a stray back press can't exit
 * turn-by-turn guidance — only the explicit "End" button (endNavigation) really ends it. */
function navigatingBackGuard() {
  showStatus('Tap "End" to stop navigating.', 'info');
  return true;
}

// ============================================================================
// Screen Wake Lock — keeps the display on while navigating. Unsupported browsers just never get a lock.
// ============================================================================
let wakeLockSentinel = null;

async function acquireWakeLock(isRetry = false) {
  if (!('wakeLock' in navigator)) return; // unsupported browser — quietly do nothing
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
      // The platform can revoke the lock without a visibility change (e.g. low-battery mode), so re-request it here too.
      if (state.navigating || state.transitTracking) acquireWakeLock();
    });
  } catch (err) {
    wakeLockSentinel = null;
    // Some Android Chrome versions spuriously reject a request made right as the tab becomes visible — one retry covers it.
    if ((state.navigating || state.transitTracking) && !isRetry) {
      setTimeout(() => { if ((state.navigating || state.transitTracking) && !wakeLockSentinel) acquireWakeLock(true); }, 1000);
    }
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => { /* already released or unsupported — fine either way */ });
    wakeLockSentinel = null;
  }
}

// Re-acquire the wake lock on becoming visible again, and force-refresh the puck marker —
// Android backgrounding can leave it stale even though the map canvas itself repaints fine.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if ((state.navigating || state.transitTracking) && !wakeLockSentinel) acquireWakeLock();
  if ((state.navigating || state.transitTracking) && state.puckMarker && state.lastFix) {
    map.resize();
    updatePuck([state.lastFix.lng, state.lastFix.lat], state.lastHeading);
  }
});

async function startNavigation({ resuming = false } = {}) {
  resolverDebugLog(`startNavigation() called (route: ${!!state.route}, already navigating: ${state.navigating}, resuming: ${resuming})`);
  if (!state.route || state.navigating) {
    resolverDebugLog('Bailing out — no route planned, or already navigating.', 'error');
    return;
  }
  if (!('geolocation' in navigator)) {
    resolverDebugLog('No geolocation support in this browser/WebView.', 'error');
    showStatus('This browser does not support GPS location, so live navigation is not available.', 'error');
    return;
  }
  state.navigating = true; // claimed before the await below so a second tap can't start a second GPS watch/wake lock
  stopIdleLocationShare(); // stop the idle "where am I" watch — no overlapping GPS watches once the nav puck takes over
  if (isNativePlatform()) setPipNavigating(true).catch(() => {}); // lets native PiP know it can auto-enter if the user leaves the app
  if (isNativePlatform()) setCarNavNavigating(true).catch(() => {});
  // mapLoad may not have settled yet on the resume-on-reload path (unlike a normal Start tap, which already awaited it via renderRoute).
  resolverDebugLog('Awaiting map load…');
  try {
    await awaitMapLoad();
    resolverDebugLog('Map loaded.', 'success');
  } catch (err) {
    resolverDebugLog(`Map load failed: ${err.message}`, 'error');
    state.navigating = false;
    if (isNativePlatform()) setPipNavigating(false).catch(() => {});
    if (isNativePlatform()) setCarNavNavigating(false).catch(() => {});
    showStatus(err.message, 'error');
    return;
  }

  // state.route/state.to can be cancelled out from under this call while the await above was
  // pending (e.g. a tap on Cancel) — bail out cleanly instead of dereferencing null below.
  if (!state.route || !state.to) {
    resolverDebugLog('state.route/state.to disappeared while awaiting map load (route was cancelled) — aborting startNavigation.', 'warn');
    state.navigating = false;
    if (isNativePlatform()) setPipNavigating(false).catch(() => {});
    if (isNativePlatform()) setCarNavNavigating(false).catch(() => {});
    return;
  }

  try {
    state.followMode = true;
    state.offRouteSince = null;
    state.isRerouting = false;
    state.pendingRerouteFrom = null;
    state.spokenFar = new Set();
    state.spokenNear = new Set();
    state.spokenContinue = new Set();
    state.spokenInclines = new Set();
    state.currentManeuverIdx = 0; // covers the resume-after-reload path, which sets state.route directly without going through renderRoute
    state.arrivedAnnounced = false;
    state.arrivalCandidateStreak = 0;
    state.lastFix = null;
    resetTrafficTracking();
    state.lastTrafficRerouteAt = null; // a genuinely new trip — not reset by resetTrafficTracking itself, see its own comment
    state.navigationStartedAt = Date.now(); // real wall-clock elapsed time for the trip-summary panel — see endNavigation
    state.liveAscentM = 0; // accumulated live climb so far this trip — see onPositionUpdate/effortLevel
    state.liveDescentM = 0;
    state.lastElevationHeightM = null;
    acquireWakeLock(); // fire-and-forget — see the Screen Wake Lock section above

    // Confirms navigation is on right away, rather than leaving the driver waiting (possibly
    // several silent seconds) for the first GPS fix to trigger a voice cue. Skipped on resume
    // (page reload mid-drive) since the driver's already moving. Reuses the same
    // CONTINUE_STRAIGHT_TYPES/spokenContinue mechanism as updateActiveManeuver's own announcement,
    // marking maneuver 0 spoken so the first real fix doesn't repeat it.
    if (!resuming) {
      const firstManeuver = state.route.maneuvers[0];
      if (CONTINUE_STRAIGHT_TYPES.has(firstManeuver.type)) {
        const aheadM = straightAheadDistanceM(state.route.maneuvers, 0);
        if (aheadM >= CONTINUE_STRAIGHT_MIN_LENGTH_M) {
          state.spokenContinue.add(0);
          resolverDebugLog(`Voice: announcing start-of-navigation continue-straight (${Math.round(aheadM)}m ahead) immediately, marking maneuver 0 as already spoken so updateActiveManeuver doesn't repeat it on the first GPS fix.`);
          speak(`Starting navigation. Continue straight for ${formatDistanceForSpeech(aheadM)}.`, { queue: true });
        } else {
          resolverDebugLog('Voice: announcing start-of-navigation only (first maneuver is a short continue-straight, below the announce threshold).');
          speak('Starting navigation.', { queue: true });
        }
      } else {
        resolverDebugLog(`Voice: announcing start-of-navigation with the first maneuver's own instruction: "${firstManeuver.instruction}"`);
        speak(`Starting navigation. ${firstManeuver.instruction}`, { queue: true });
      }
    }

    // Marks the persisted trip as actively navigating, so a tab reload (e.g. Android memory
    // pressure) resumes live navigation instead of dropping back to the planning screen.
    saveCurrentTrip({ route: state.route, from: state.from, to: state.to, stops: getStops(), travelMode: state.travelMode, navigating: true })
      .catch(() => { /* non-fatal: worst case a reload lands on the planning screen instead of resuming live */ });

    forgetBackLayerIfTop(resetToRouteView); // closing poi-results (if open) by side effect of starting to drive
    resetToRouteView(); // don't start driving mid-way through browsing "restaurants along the route"
    replaceTopBackLayer(navigatingBackGuard); // back warns instead of discarding the route while driving
    el.searchCard.classList.add('hidden');
    el.placeCard.classList.add('hidden');
    el.navBanner.classList.remove('hidden');
    el.navSpeedRow.classList.remove('hidden');
    updateSpeedText(null); // fresh dash until the first fix arrives, rather than a stale reading left over from a previous trip
    el.speedLimitSign.classList.add('hidden'); // fresh start too — no stale sign from a previous trip until the first fix resolves one
    refreshWeatherBadge(); // stays hidden until the first fix arrives (state.lastFix is null right after this reset)
    el.bottomSheet.classList.remove('expanded', 'half');
    el.startNavBtn.classList.add('hidden');
    el.cancelRouteBtn.classList.add('hidden');
    // Along-route search stays available while driving (scoped to what's ahead), moved from the
    // inline row to the floating FAB+popover since the search card is now hidden.
    hideRouteChipsInline();
    showRouteSearchFeature();
    showEffortFeature(); // no-op outside walk mode
    el.routeOptionsRow.classList.add('hidden'); // no more switching routes once you're committed and driving
    map.getSource('route-alternates').setData(emptyFeatureCollection());
    el.endNavBtn.classList.remove('hidden');
    updateLocateBtnState();

    // The live puck takes over as the "where am I" marker — stop the idle location watch too.
    if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
    if (state.myLocationMarker) { state.myLocationMarker.remove(); state.myLocationMarker = null; }
    if (state.idleLocationWatchId != null) { navigator.geolocation.clearWatch(state.idleLocationWatchId); state.idleLocationWatchId = null; disableDeviceOrientation(); }

    showStatus('Getting your location…', 'info');
    resolverDebugLog('Calling startLocationWatch() — on the Android shell this requests the background-geolocation permission and can pause here waiting on that native dialog…');
    try {
      // Plain watchPosition on the web; a real Android foreground service via background-geolocation
      // on the native shell (feeding the same onPositionUpdate), so tracking keeps working screen-off.
      state.watchId = await startLocationWatch(onPositionUpdate, onPositionError, CONFIG.GEOLOCATION_OPTIONS, {
        title: 'Navigating to ' + state.to.label,
        message: 'Tracking your location for turn-by-turn guidance.',
      });
      resolverDebugLog(`Location watch started (id: ${JSON.stringify(state.watchId)}).`, 'success');
    } catch (err) {
      resolverDebugLog(`startLocationWatch() failed: ${err.message}`, 'error');
      showStatus('Could not start location tracking: ' + err.message, 'error');
      endNavigation();
    }
  } catch (err) {
    // Safety net for anything unexpected — without this, state.navigating would stay stuck true forever.
    resolverDebugLog(`startNavigation() failed: ${err.message}`, 'error');
    state.navigating = false;
    releaseWakeLock();
    if (isNativePlatform()) setPipNavigating(false).catch(() => {});
    if (isNativePlatform()) setCarNavNavigating(false).catch(() => {});
    showStatus('Could not start navigation: ' + err.message, 'error');
  }
}

/** `showSummary` is only true for intentional stops (arrival, manual "End"), not error call
 * sites — a summary panel over an error toast would be jarring. `arrived` picks the wording. */
function endNavigation({ showSummary = false, arrived = false } = {}) {
  const summary = showSummary ? { // captured before cleanup resets these — the real, not planned, totals
    arrived,
    distanceM: state.traveledM || 0,
    elapsedS: state.navigationStartedAt ? (Date.now() - state.navigationStartedAt) / 1000 : 0,
    ascentM: state.travelMode === 'walk' ? state.liveAscentM : null,
    descentM: state.travelMode === 'walk' ? state.liveDescentM : null,
    effort: state.travelMode === 'walk' ? effortLevel() : null,
  } : null;

  replaceTopBackLayer(cancelPlannedRoute); // direct call, not goBackInApp — restores the "planned, not driving" back-layer
  if (state.watchId != null) stopLocationWatch(state.watchId).catch(() => { /* best-effort cleanup */ });
  state.watchId = null;
  state.navigating = false;
  releaseWakeLock();
  if (isNativePlatform()) setPipNavigating(false).catch(() => {}); // see the matching call in startNavigation
  if (isNativePlatform()) setCarNavNavigating(false).catch(() => {});

  if (state.puckMarker) { state.puckMarker.remove(); state.puckMarker = null; }
  // Stops whatever's still speaking — speechSynthesis.cancel() alone is a silent no-op on the native shell.
  if (isNativePlatform()) stopNative().catch(() => {}); // best-effort — ending navigation shouldn't be blocked by this
  else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  clearTraveledRouteSegment();
  resetTrafficTracking();
  state.lastTrafficRerouteAt = null; // not reset by resetTrafficTracking itself, see its own comment

  el.navBanner.classList.add('hidden');
  el.navSpeedRow.classList.add('hidden');
  refreshWeatherBadge(); // re-evaluate now state.navigating is false — shows a place card's weather if one's still open, else hides
  el.endNavBtn.classList.add('hidden');
  el.startNavBtn.classList.remove('hidden');
  el.cancelRouteBtn.classList.remove('hidden');
  el.maneuverList.classList.add('hidden'); // back to the planning screen — see the matching toggle in renderRoute (UX audit finding F4)
  hideRouteSearchFeature(); // endNavigation is only reachable from a drive-mode session
  hideEffortFeature();
  showRouteChipsInline(); // back to "planned, not driving" — chips move back under the search card
  el.searchCard.classList.remove('hidden');
  renderRouteOptions(); // typically just re-hides the row: rerouting while driving collapses options down to one
  updateLocateBtnState();

  if (state.route) renderRouteSummary(state.route.totalDistM, state.route.totalTimeS);
  updatePlanningMarkers(); // restore the original origin pin for the planning view
  clearStatus();

  clearCurrentTrip().catch(() => { /* non-fatal: a stale resume record just won't restore next launch */ });

  // Disabled: end-of-trip summary panel. Flip to true to re-enable (the fallback toast below stops firing on its own).
  const TRIP_SUMMARY_PANEL_ENABLED = false;
  if (summary) {
    if (TRIP_SUMMARY_PANEL_ENABLED) {
      renderTripSummary(summary);
    } else {
      // Plain toast fallback — the spoken arrival announcement alone isn't a reliable confirmation (muted device, cut short by cancel() above, etc).
      showStatus(summary.arrived ? 'You have arrived at your destination.' : 'Trip ended.', 'success');
    }
  }
}

/** Populates the trip-summary panel with what actually happened, not the planned totals.
 * Elevation/effort rows are omitted outside walk mode, or if elevation data never resolved. */
function renderTripSummary({ arrived, distanceM, elapsedS, ascentM, descentM, effort }) {
  el.tripSummaryTitle.textContent = arrived ? 'You arrived!' : 'Trip ended';
  const rows = [
    { label: 'Distance', value: formatDistance(distanceM) },
    { label: 'Time', value: formatDuration(elapsedS) },
  ];
  if (ascentM != null) {
    rows.push({ label: 'Elevation', value: `↑${formatDistance(ascentM)}  ↓${formatDistance(descentM)}` });
    rows.push({ label: 'Effort', value: effort });
  }
  el.tripSummaryStats.innerHTML = rows.map((r) => `
    <div class="trip-summary-row">
      <span class="trip-summary-label">${escapeHtml(r.label)}</span>
      <span class="trip-summary-value">${escapeHtml(r.value)}</span>
    </div>`).join('');
  pushBackLayer(() => el.tripSummaryPanel.classList.add('hidden'));
  el.tripSummaryPanel.classList.remove('hidden');
}

// ============================================================================
// Kochi transit live tracking — GPS-guided progress through a Kochi itinerary only
// ============================================================================
// Own state machine (state.transitTracking/transitLegIndex/...), kept separate from
// state.navigating so normal drive/walk position handling is never affected.

/** Resets per-leg tracking state for the current leg, on entering tracking and on each leg
 * transition. Paints the banner/list highlight immediately rather than waiting for the next GPS fix. */
function resetTransitLegTrackingState() {
  const leg = state.transitItinerary.legs[state.transitLegIndex];
  state.transitLegManeuverIdx = 0;
  state.transitLegArrivalStreak = 0;
  state.transitRideBoarded = false;
  state.transitRideOffRouteSince = null;
  state.transitRideHidden = false;
  state.transitRideStationIdx = null;
  el.boardConfirmBtn.classList.add('hidden');
  // Defensive: clears the new leg's station-progress list so a stale one from a previous visit doesn't flash.
  const newLegLi = el.maneuverList.children[state.transitLegIndex];
  const newLegStationList = newLegLi && newLegLi.querySelector('.station-progress');
  if (newLegStationList) { newLegStationList.classList.add('hidden'); newLegStationList.innerHTML = ''; }
  state.transitLegLineFeature = leg && leg.geometry && leg.geometry.length > 1 ? turf.lineString(leg.geometry) : null;
  highlightTransitLeg(state.transitLegIndex);
  if (!leg) return;
  if (leg.mode === 'WALK' || leg.mode === 'CAR') {
    const first = leg.maneuvers && leg.maneuvers[0];
    el.navBannerIcon.innerHTML = first ? maneuverIcon(first.type) : transitLegIcon(leg.mode);
    el.navBannerInstruction.textContent = first ? first.instruction : `Walk to ${(leg.to && leg.to.name) || 'the next stop'}`;
    el.navBannerDistance.textContent = formatDistance(leg.distance || 0);
  } else {
    el.navBannerIcon.innerHTML = transitLegIcon(leg.mode);
    el.navBannerInstruction.textContent = `Head to ${(leg.from && leg.from.name) || 'the platform'}`;
    el.navBannerDistance.textContent = 'Waiting to board';
  }
}

/** Toggles 'active'/'done' on the maneuver list's <li> elements. idx < 0 clears all highlighting. */
function highlightTransitLeg(idx) {
  [...el.maneuverList.children].forEach((li, i) => {
    li.classList.toggle('active', i === idx);
    li.classList.toggle('done', idx >= 0 && i < idx);
  });
  const activeLi = idx >= 0 ? el.maneuverList.children[idx] : null;
  if (activeLi) activeLi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Builds the current SUBWAY leg's station list on first call, then just toggles active/done per station.
 * Never called for FERRY — water metro has no intermediate-stop data. */
function renderStationProgress(legIndex, stations, currentIdx) {
  const li = el.maneuverList.children[legIndex];
  const list = li && li.querySelector('.station-progress');
  if (!list) return;
  if (!list.children.length) {
    list.innerHTML = stations.map((s) => `<li>${escapeHtml(s.name)}</li>`).join('');
  }
  [...list.children].forEach((row, i) => {
    row.classList.toggle('done', i < currentIdx);
    row.classList.toggle('active', i === currentIdx);
  });
  list.classList.remove('hidden');
  const activeRow = list.children[currentIdx];
  if (activeRow) activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Advances to the next leg, or ends the trip if that was the last one. */
function advanceTransitLeg() {
  state.transitLegIndex += 1;
  if (state.transitLegIndex >= state.transitItinerary.legs.length) {
    endTransitNavigation({ arrived: true });
    return;
  }
  resetTransitLegTrackingState();
}

/** WALK/CAR leg progress — the same startDistM ratchet as updateActiveManeuver, scoped to this
 * leg's own maneuvers/geometry. No voice guidance or reroute behavior; Kochi itineraries can't reroute. */
function updateTransitWalkLeg(leg, lngLat) {
  if (!state.transitLegLineFeature || !leg.maneuvers || !leg.maneuvers.length) {
    // No usable geometry (a same-spot "walk" can produce a single-point geometry) — fall back to a plain readout.
    el.navBannerInstruction.textContent = `Walk to ${(leg.to && leg.to.name) || 'the next stop'}`;
    el.navBannerDistance.textContent = formatDistance(leg.distance || 0);
    return;
  }
  const snapped = turf.nearestPointOnLine(state.transitLegLineFeature, turf.point(lngLat), { units: 'meters' });
  const traveledM = snapped.properties.location;

  const maneuvers = leg.maneuvers;
  let candidateIdx = 0;
  for (let i = 0; i < maneuvers.length; i++) {
    if (maneuvers[i].startDistM <= traveledM) candidateIdx = i; else break;
  }
  // Same forward-only ratchet hysteresis as updateActiveManeuver, scoped to this leg's own index.
  if (candidateIdx === state.transitLegManeuverIdx + 1) {
    if (traveledM >= maneuvers[candidateIdx].startDistM + CONFIG.MANEUVER_ADVANCE_HYSTERESIS_M) state.transitLegManeuverIdx = candidateIdx;
  } else if (candidateIdx > state.transitLegManeuverIdx + 1) {
    state.transitLegManeuverIdx = candidateIdx;
  }
  const currentIdx = state.transitLegManeuverIdx;
  const nextIdx = currentIdx + 1 < maneuvers.length ? currentIdx + 1 : null;
  const legTotalM = leg.distance || maneuvers[maneuvers.length - 1].startDistM + maneuvers[maneuvers.length - 1].lengthM;
  const remainingM = Math.max(0, legTotalM - traveledM);

  if (nextIdx !== null) {
    const distToNextM = Math.max(0, maneuvers[nextIdx].startDistM - traveledM);
    el.navBannerIcon.innerHTML = maneuverIcon(maneuvers[nextIdx].type);
    el.navBannerInstruction.textContent = maneuvers[nextIdx].instruction;
    el.navBannerDistance.textContent = 'in ' + formatDistance(distToNextM);
  } else {
    el.navBannerIcon.innerHTML = maneuverIcon(4); // flag — same "arriving" icon updateActiveManeuver uses
    el.navBannerInstruction.textContent = maneuvers[currentIdx].instruction || `Arriving at ${(leg.to && leg.to.name) || 'the next stop'}`;
    el.navBannerDistance.textContent = 'Arriving';
  }

  // Leg-complete check: genuinely close to this leg's own end point, same straight-line
  // reasoning as updateActiveManeuver's arrival check, scoped to this leg instead of the whole trip.
  const legEndCoord = leg.geometry[leg.geometry.length - 1];
  const straightLineToEndM = turf.distance(lngLat, legEndCoord, { units: 'meters' });
  if (remainingM <= CONFIG.TRANSIT_ALIGHT_RADIUS_M && straightLineToEndM <= CONFIG.TRANSIT_ALIGHT_RADIUS_M * 2) {
    state.transitLegArrivalStreak += 1;
  } else {
    state.transitLegArrivalStreak = 0;
  }
  if (state.transitLegArrivalStreak >= CONFIG.TRANSIT_ARRIVAL_CONFIRM_FIXES) {
    advanceTransitLeg();
  }
}

/** SUBWAY/FERRY ride-leg progress. Boarding combines GPS proximity with the real scheduled
 * departure time, not proximity alone (see TRANSIT_BOARDING_RADIUS_M in config.js). Metro shows
 * next-station/stops-remaining; water metro (no intermediate-stop data) gets percent-of-distance
 * instead. No reroute concept for a ride leg — sustained deviation just hides the readout. */
function updateTransitRideLeg(leg, lngLat) {
  const originCoord = leg.geometry[0];
  const destCoord = leg.geometry[leg.geometry.length - 1];

  if (!state.transitRideBoarded) {
    const distToOriginM = turf.distance(lngLat, originCoord, { units: 'meters' });
    const withinBoardingRadius = distToOriginM <= CONFIG.TRANSIT_BOARDING_RADIUS_M;
    // Manual confirm button: shown on GPS proximity alone, not gated on departure time having
    // passed (unlike the automatic check below) — lets boarding early be confirmed too.
    if (withinBoardingRadius) {
      if (el.boardConfirmBtn.classList.contains('hidden')) {
        el.boardConfirmBtn.textContent = leg.mode === 'FERRY' ? "I'm on the boat" : "I'm on the train";
        el.boardConfirmBtn.classList.remove('hidden');
      }
    } else {
      el.boardConfirmBtn.classList.add('hidden');
    }

    // departureAtMs is null when there's no real departure left to check (e.g. last train of the
    // day) — falls back to proximity alone. Fallback path for anyone who doesn't tap confirm above.
    const pastDeparture = leg.departureAtMs == null || Date.now() >= leg.departureAtMs;
    if (withinBoardingRadius && pastDeparture) {
      state.transitRideBoarded = true;
      el.boardConfirmBtn.classList.add('hidden');
    } else {
      el.navBannerIcon.innerHTML = transitLegIcon(leg.mode);
      el.navBannerInstruction.textContent = `Head to ${(leg.from && leg.from.name) || 'the platform'}`;
      el.navBannerDistance.textContent = pastDeparture
        ? `${formatDistance(distToOriginM)} away`
        : `${formatDistance(distToOriginM)} away · next ${formatWaitText(Math.round((leg.departureAtMs - Date.now()) / 1000))}`;
      return;
    }
  }

  if (!state.transitLegLineFeature) return; // shouldn't happen — every ride leg has a >=2-point geometry
  const snapped = turf.nearestPointOnLine(state.transitLegLineFeature, turf.point(lngLat), { units: 'meters' });
  const traveledM = snapped.properties.location;
  const offsetM = snapped.properties.dist;

  // No-reroute deviation grace — same hysteresis idea as checkDeviation, more generous, ends in hiding the readout.
  if (offsetM > CONFIG.TRANSIT_RIDE_DEVIATION_THRESHOLD_M) {
    if (state.transitRideOffRouteSince == null) state.transitRideOffRouteSince = Date.now();
    if (Date.now() - state.transitRideOffRouteSince > CONFIG.TRANSIT_RIDE_DEVIATION_DURATION_MS) state.transitRideHidden = true;
  } else {
    state.transitRideOffRouteSince = null;
    state.transitRideHidden = false;
  }

  if (state.transitRideHidden) {
    el.navBannerIcon.innerHTML = transitLegIcon(leg.mode);
    el.navBannerInstruction.textContent = `On ${leg.route || leg.mode}`;
    el.navBannerDistance.textContent = `Towards ${(leg.to && leg.to.name) || 'your stop'}`;
  } else if (leg.mode === 'SUBWAY' && leg.stations && leg.stations.length > 1) {
    const stations = leg.stations;
    let cumM = 0;
    let nextIdx = stations.length - 1;
    for (let i = 0; i < stations.length - 1; i++) {
      cumM += turf.distance([stations[i].lon, stations[i].lat], [stations[i + 1].lon, stations[i + 1].lat], { units: 'meters' });
      if (cumM > traveledM) { nextIdx = i + 1; break; }
    }
    const stopsRemaining = Math.max(0, stations.length - 1 - nextIdx);
    el.navBannerIcon.innerHTML = transitLegIcon(leg.mode);
    el.navBannerInstruction.textContent = `Next stop: ${stations[nextIdx].name}`;
    el.navBannerDistance.textContent = stopsRemaining > 0 ? `${stopsRemaining} stop${stopsRemaining === 1 ? '' : 's'} to go` : 'Arriving';
    if (nextIdx !== state.transitRideStationIdx) {
      renderStationProgress(state.transitLegIndex, stations, nextIdx);
      state.transitRideStationIdx = nextIdx;
    }
  } else {
    // FERRY (or a metro leg missing its stations array) — no intermediate stops, so percent-of-distance instead.
    const totalM = leg.distance || turf.length(state.transitLegLineFeature, { units: 'meters' });
    const pct = totalM > 0 ? Math.min(100, Math.round((traveledM / totalM) * 100)) : 0;
    el.navBannerIcon.innerHTML = transitLegIcon(leg.mode);
    el.navBannerInstruction.textContent = `Approaching ${(leg.to && leg.to.name) || 'your stop'}`;
    el.navBannerDistance.textContent = `${pct}% · ${formatDistance(Math.max(0, totalM - traveledM))} to go`;
  }

  // Alight check: same consecutive-fix confirmation as the walk-leg check above — one noisy fix near a station isn't enough.
  const distToDestM = turf.distance(lngLat, destCoord, { units: 'meters' });
  if (distToDestM <= CONFIG.TRANSIT_ALIGHT_RADIUS_M) {
    state.transitLegArrivalStreak += 1;
  } else {
    state.transitLegArrivalStreak = 0;
  }
  if (state.transitLegArrivalStreak >= CONFIG.TRANSIT_ARRIVAL_CONFIRM_FIXES) {
    advanceTransitLeg();
  }
}

/** Transit-tracking equivalent of onPositionUpdate. Shares updatePuck/followCamera; the rest
 * dispatches to updateTransitWalkLeg/updateTransitRideLeg instead of state.route-based logic. */
function onTransitPositionUpdate(pos) {
  const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
  const lngLat = [lng, lat];
  updateSpeedText(speed);

  let headingDeg = state.lastHeading;
  if (typeof heading === 'number' && !Number.isNaN(heading)) {
    headingDeg = heading;
  } else if (state.lastFix) {
    const movedM = turf.distance([state.lastFix.lng, state.lastFix.lat], lngLat, { units: 'meters' });
    if (movedM > 0.5) headingDeg = (turf.bearing([state.lastFix.lng, state.lastFix.lat], lngLat) + 360) % 360;
  }
  state.lastHeading = headingDeg;
  state.lastFix = { lng, lat, t: pos.timestamp || Date.now() };

  updatePuck(lngLat, headingDeg);
  if (state.followMode) followCamera(lngLat, headingDeg);

  const leg = state.transitItinerary && state.transitItinerary.legs[state.transitLegIndex];
  if (!leg) return;
  if (leg.mode === 'WALK' || leg.mode === 'CAR') updateTransitWalkLeg(leg, lngLat);
  else updateTransitRideLeg(leg, lngLat);
}

/** Explicit "Start" tap for a Kochi-sourced transit itinerary, mirroring startNavigation but
 * against state.transitItinerary. Guarded against an OTP2 itinerary (no schedule data), though its
 * Start button is already hidden before this could be tapped. */
async function startTransitNavigation(itinerary) {
  if (!itinerary || itinerary.source !== 'kochi' || state.transitTracking || state.navigating) return;
  if (!('geolocation' in navigator)) {
    showStatus('This browser does not support GPS location, so live tracking is not available.', 'error');
    return;
  }
  state.transitTracking = true;
  state.transitLegIndex = 0;
  state.followMode = true;
  state.lastFix = null;
  state.lastHeading = 0;
  acquireWakeLock();
  if (isNativePlatform()) setPipNavigating(true).catch(() => {});
  if (isNativePlatform()) setCarNavNavigating(true).catch(() => {});

  stopIdleLocationShare(); // same "the live puck takes over" handoff startNavigation does
  if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
  if (state.myLocationMarker) { state.myLocationMarker.remove(); state.myLocationMarker = null; }
  if (state.idleLocationWatchId != null) { navigator.geolocation.clearWatch(state.idleLocationWatchId); state.idleLocationWatchId = null; disableDeviceOrientation(); }

  resetTransitLegTrackingState();
  replaceTopBackLayer(navigatingBackGuard); // same "back warns, doesn't exit" guard drive/walk navigation uses
  el.searchCard.classList.add('hidden');
  el.placeCard.classList.add('hidden');
  el.navBanner.classList.remove('hidden');
  el.navSpeedRow.classList.remove('hidden');
  updateSpeedText(null);
  el.speedLimitSign.classList.add('hidden'); // drive-only feature (see updateSpeedLimitSign) — never populated during transit tracking
  el.bottomSheet.classList.remove('expanded', 'half');
  el.startNavBtn.classList.add('hidden');
  el.cancelRouteBtn.classList.add('hidden');
  el.transitItineraryOptionsRow.classList.add('hidden'); // no more switching itineraries once you're committed
  el.endNavBtn.classList.remove('hidden');
  updateLocateBtnState();

  showStatus('Getting your location…', 'info');
  try {
    state.watchId = await startLocationWatch(onPositionUpdate, onPositionError, CONFIG.GEOLOCATION_OPTIONS, {
      title: 'Tracking your Kochi transit trip',
      message: 'Tracking your location for live transit guidance.',
    });
    clearStatus();
  } catch (err) {
    showStatus('Could not start location tracking: ' + err.message, 'error');
    endTransitNavigation();
  }
}

/** Manual "End" tap, or the automatic end-of-trip path from advanceTransitLeg. Mirrors
 * endNavigation's cleanup, but leaves state.transitItinerary alone so "Start" resumes from leg 0. */
function endTransitNavigation({ arrived = false } = {}) {
  replaceTopBackLayer(cancelPlannedRoute);
  if (state.watchId != null) stopLocationWatch(state.watchId).catch(() => { /* best-effort cleanup */ });
  state.watchId = null;
  state.transitTracking = false;
  releaseWakeLock();
  if (isNativePlatform()) setPipNavigating(false).catch(() => {});
  if (isNativePlatform()) setCarNavNavigating(false).catch(() => {});

  if (state.puckMarker) { state.puckMarker.remove(); state.puckMarker = null; }
  if (isNativePlatform()) stopNative().catch(() => {});
  else if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  el.navBanner.classList.add('hidden');
  el.navSpeedRow.classList.add('hidden');
  el.boardConfirmBtn.classList.add('hidden');
  el.endNavBtn.classList.add('hidden');
  el.startNavBtn.classList.remove('hidden');
  el.cancelRouteBtn.classList.remove('hidden');
  el.searchCard.classList.remove('hidden');
  renderTransitItineraryOptions(); // typically re-shows the row (only if >=2 options) with correct active-card highlighting
  updateSheetPeekHeight();
  highlightTransitLeg(-1);
  updateLocateBtnState();

  showStatus(arrived ? 'You have arrived at your destination.' : 'Trip tracking ended.', 'success');
}

el.startNavBtn.addEventListener('click', () => {
  if (state.travelMode === 'transit') startTransitNavigation(state.transitItinerary);
  else startNavigation();
});
el.endNavBtn.addEventListener('click', () => {
  if (state.transitTracking) endTransitNavigation();
  else endNavigation({ showSummary: true });
});
el.boardConfirmBtn.addEventListener('click', () => {
  state.transitRideBoarded = true;
  el.boardConfirmBtn.classList.add('hidden');
});

// ============================================================================
// PWA installability
// ============================================================================
// Skipped inside the Capacitor Android shell — assets are already bundled, no SW benefit.
// Also unregisters any old SW/cache there so a stale build can't keep serving.
if ('serviceWorker' in navigator) {
  if (isNativePlatform()) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => { /* non-fatal */ });
    if ('caches' in window) {
      // Only the SW's own app-shell cache — must not sweep up the offline-tiles caches, or this would delete downloaded maps.
      caches.keys()
        .then((keys) => keys.filter((k) => k.startsWith('navigator-shell-')).forEach((k) => caches.delete(k)))
        .catch(() => { /* non-fatal */ });
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* non-fatal: app still works */ });
    });
  }
}

// ============================================================================
// Startup: offer to resume an in-progress trip if the tab was reloaded or restarted mid-drive.
// Favorites/recents need no startup work — loaded on demand when a search field is focused.
// ============================================================================

// Show the live "you are here" dot on open, silently so a permission prompt/denial doesn't also
// pop a status banner. Safe even when about to auto-resume a drive — startNavigation stops this itself.
startIdleLocationShare({ silent: true });

const shareTargetText = parseShareTargetParam();
const sharedRoutePayload = shareTargetText ? null : parseShareParam();
if (shareTargetText) {
  history.replaceState(null, '', location.pathname); // strip share-target params so reload/back doesn't re-resolve the link
  handleSharedGoogleMapsLink(shareTargetText);
} else if (sharedRoutePayload) {
  // replaceState (not pushState) so ?share=... doesn't add a back-stack layer or re-trigger on reload.
  // A deliberately opened share link always wins over resuming a stale local trip below.
  history.replaceState(null, '', location.pathname);
  applyShareLink(sharedRoutePayload);
} else {
  (async () => {
    try {
      const saved = await loadCurrentTrip();
      if (saved && saved.route && saved.to) {
        state.route = saved.route;
        state.route.lineFeature = turf.lineString(state.route.coords);
        if (isNativePlatform()) updateCarNavRoute({ coordinates: state.route.coords }).catch(() => {});
        state.from = saved.from;
        state.to = saved.to;
        state.travelMode = saved.travelMode || 'drive';
        modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === state.travelMode));

        await awaitMapLoad();
        map.getSource('route').setData(state.route.lineFeature);
        const bounds = state.route.coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(state.route.coords[0], state.route.coords[0]),
        );
        map.fitBounds(bounds, { padding: 60, duration: 0 });
        renderManeuverList(state.route.maneuvers);
        renderRouteSummary(state.route.totalDistM, state.route.totalTimeS);
        el.bottomSheet.classList.remove('hidden');
        goToDirections({ from: state.from, to: state.to }); // also clears stops — repopulate after
        (saved.stops || []).forEach((stop) => addStopRow(stop));
        updatePlanningMarkers();
        replaceTopBackLayer(cancelPlannedRoute); // a route is already active here, not just the bare directions form

        if (saved.navigating) {
          // Was actively navigating when reloaded (most likely Android discarding a backgrounded
          // tab) — resume straight into live navigation instead of the "tap Start again" screen.
          showStatus('Resuming your drive…', 'info');
          startNavigation({ resuming: true });
        } else {
          el.startNavBtn.classList.remove('hidden');
          el.cancelRouteBtn.classList.remove('hidden');
          el.shareRouteBtn.classList.remove('hidden');
          updateSheetPeekHeight(); // see the drive/walk plan-handler branch for why this needs to run after the buttons above are visible, not before
          showRouteChipsInline();
          if (state.travelMode === 'walk') updateElevationProfileForRoute();
          showStatus('Restored your in-progress route.', 'info');
        }
      }
    } catch (err) {
      // Non-fatal: fall back to a fresh planning screen with an explanatory status instead of silently forgetting the trip.
      console.error('Failed to restore in-progress trip:', err);
      showStatus("Couldn't restore your in-progress trip — starting fresh.", 'error');
    }
  })();
}

