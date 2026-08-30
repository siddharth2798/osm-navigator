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
// Dynamically imported (see the Plus Code branch of resolveGoogleMapsLink
// below) rather than statically here — it's a ~28KB module only ever
// exercised by the rare case of a Google Maps place with no street address,
// so there's no reason to make every single page load fetch/parse/evaluate
// it up front.

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
  openNowChip: document.getElementById('open-now-chip'),
  routeOptionsRow: document.getElementById('route-options'),
  elevationProfile: document.getElementById('elevation-profile'),
  routeChips: document.getElementById('route-chips'),
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
  navSpeed: document.getElementById('nav-speed'),
  trafficBadge: document.getElementById('traffic-badge'),
  flightBadge: document.getElementById('flight-badge'),
  flightBadgeText: document.getElementById('flight-badge-text'),
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
  flightTrackingBtn: document.getElementById('flight-tracking-btn'),
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
  from: null,          // {label, lat, lon} chosen from suggestions
  to: null,            // {label, lat, lon} chosen from suggestions
  route: null,         // {coords, maneuvers, totalDistM, totalTimeS, lineFeature}
  routeOptions: [],    // raw Valhalla trip objects: [primary, ...meaningfully-different alternates]
  routeOptionDetourTrips: new Set(), // subset of routeOptions added by maybeAddTrafficDetourOption — tagged "Avoids traffic" instead of the normal Fastest/Shortest/tolls logic (see buildRouteOptionTags), reset on every renderRouteOptions
  selectedRouteIndex: 0, // which entry of routeOptions is currently drawn/active
  travelMode: 'drive', // 'drive' | 'walk' | 'transit' — transit has no live-navigation counterpart
  avoidTolls: false,   // drive-only; see costingOptionsFor()
  avoidHighways: false, // drive-only; see costingOptionsFor()
  filterOpenNow: false, // category/along-route search modifier; see applyOpenNowFilter
  transitItinerary: null, // last-planned OTP2 itinerary, kept separate from `route` since it's a different shape
  pendingQuickPlaceKind: null, // 'home' | 'work' while the next place picked from search should be saved as a quick place, not routed to
  originMarker: null,
  destMarker: null,
  stopMarkers: [],     // numbered pins for intermediate stops, in visit order
  poiMarkers: [],      // one per candidate in the current category/along-route search, cleared on next search or selection
  elevationHighlightMarker: null, // shows where a tapped elevation-chart point sits on the actual route, cleared with the chart itself
  currentLegIndex: 0,  // which leg of a multi-stop trip we're currently on — see updateActiveManeuver
  currentManeuverIdx: 0, // ratcheted forward-only index into state.route.maneuvers — see updateActiveManeuver; reset to 0 alongside spokenFar/spokenNear/spokenContinue whenever state.route is replaced (renderRoute, startNavigation)
  currentSpeedMps: null, // live GPS speed, or null when unavailable/unreliable — see onPositionUpdate and dynamicVoiceLeadM
  traveledM: null,     // distance travelled along state.route so far — see onPositionUpdate, used to scope "search along route" to what's still ahead once navigating
  puckMarker: null,
  myLocationMarker: null, // live "you are here" arrow shown by the locate button before navigation starts
  idleLocationWatchId: null, // navigator.geolocation.watchPosition id backing myLocationMarker — null when not sharing
  navigating: false,
  watchId: null,
  // Indices of maneuvers already spoken aloud, tracked separately per prompt
  // stage so each maneuver gets its own far ("in 150 meters, turn right")
  // and near ("turn right") reminder exactly once.
  spokenFar: new Set(),
  spokenNear: new Set(),
  spokenContinue: new Set(), // "Continue straight for X km" — spoken once per long straight maneuver, on becoming current rather than approaching
  spokenInclines: new Set(), // grade-segment start indices already announced — see checkInclineAnnouncement
  voiceMode: 'all', // 'all' | 'off' — see the voice-mode toggle button
  arrivedAnnounced: false,
  arrivalCandidateStreak: 0, // consecutive fixes in a row within ARRIVAL_RADIUS_M — see the arrival check in updateActiveManeuver
  lastFix: null,       // {lng, lat, t} of the previous GPS fix, for bearing fallback
  lastHeading: 0,
  offRouteSince: null, // timestamp when we first went off-route, or null
  isRerouting: false,
  pendingRerouteFrom: null, // last known-good lngLat we owe a reroute to, once connectivity returns
  followMode: true,    // whether the camera auto-follows the live position
  // Live traffic (TomTom Flow Segment Data) — see maybeCheckTraffic/
  // runTrafficCheckin. All reset together by resetTrafficTracking()
  // whenever a route is (re)planned or navigation starts/ends.
  lastTrafficCheckAt: null,     // Date.now() of the last check-in, or null before the first one
  lastTrafficCheckDistM: null,  // state.traveledM at the last check-in, or null before the first one
  trafficCheckInFlight: false,  // guards against a slow check-in overlapping the next one
  trafficRatio: null,           // last averaged currentSpeed/freeFlowSpeed, or null if no data yet / all samples failed
  // Cooldown for maybeRerouteForTraffic — deliberately NOT reset by
  // resetTrafficTracking (which fires on every reroute, including a
  // traffic one's own); only startNavigation/endNavigation clear this, see
  // maybeRerouteForTraffic's own comment for why.
  lastTrafficRerouteAt: null,
  // Personal flight-tracking overlay (see maybeCheckFlights/runFlightCheckin
  // below) — a session-only toggle, not persisted, same as voiceMode. All
  // reset together by resetFlightTracking() whenever navigation starts/ends.
  flightTrackingEnabled: false,
  lastFlightCheckAt: null,      // Date.now() of the last check-in, or null before the first one
  flightCheckInFlight: false,   // guards against a slow check-in overlapping the next one
  flightOverheadAircraft: [],   // aircraft currently within FLIGHT_OVERHEAD_RADIUS_M (or still inside the hysteresis clear radius) — drives the badge
  flightCheckinFailStreak: 0,   // consecutive failed check-ins — see noteFlightCheckinFailure
  flightCheckinWarned: false,   // whether the current outage (if any) has already been surfaced to the user
  flightBackoffUntil: null,     // Date.now() timestamp; maybeCheckFlights skips polling entirely until past this — see applyFlightBackoff
  flightBackoffMs: 0,           // current backoff length, doubling per consecutive 429; reset to 0 on any successful check-in
  flightActiveSource: null,     // 'adsb.lol' | 'adsb.fi', from the proxy's own x-flight-source header — see runFlightCheckin
  navigationStartedAt: null, // Date.now() when the current trip started — real elapsed time for the trip-summary panel
  liveAscentM: 0,       // accumulated live climb so far this trip (walk mode) — see onPositionUpdate/effortLevel
  liveDescentM: 0,      // accumulated live descent so far this trip (walk mode) — trip-summary panel only, not used by effortLevel
  lastElevationHeightM: null, // interpolated height at the previous tick's traveledM, for the live-ascent/descent diff above
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
// event — fired for our own history.back() calls, and (on the web) for a
// real browser back press too — is what actually closes it. This is the
// standard technique for making a back button behave sensibly in a
// single-page app.
//
// Inside the Capacitor Android shell specifically, the hardware/gesture
// back button does NOT fire a popstate event at all (confirmed live:
// Capacitor's BridgeActivity registers no back-press callback and
// dispatches nothing to JS for it by default) — left alone, it falls
// straight through to Android's default "finish the activity" behaviour
// and exits the app entirely, bypassing this whole mechanism. See
// native-back.js: initNativeBackButton below routes the hardware/gesture
// back button through this exact same goBackInApp()/backStack pipeline
// instead of introducing a second, parallel back-handling path.
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
  } else if (backStack[backStack.length - 1] === closeFn) {
    // Only pop if closeFn is still the top entry — some closeFns (e.g.
    // leaveDirectionsMode, which reveals the place card as its own new
    // closeable layer) legitimately push/replace a layer of their own as a
    // side effect of running. Popping unconditionally here would then
    // remove that JUST-ADDED entry instead of this one, leaving closeFn
    // itself permanently stuck on top of backStack — confirmed live: every
    // later back press (hardware/gesture back included, same
    // goBackInApp()/popstate path) just re-ran it harmlessly forever,
    // and the place card could never be dismissed via back again.
    backStack.pop();
  }
});

if (isNativePlatform()) {
  initNativeBackButton({
    hasOpenLayer: () => backStack.length > 0 || !el.resolverDebugPanel.classList.contains('hidden'),
    goBack: () => {
      // The debug panel deliberately isn't tracked in backStack (see the
      // comment in resolverDebugLog for why — it needs to stay closeable
      // no matter what else is open) — checked explicitly first so the
      // hardware/gesture back button can still close it when it's the
      // only thing open, instead of falling through to App.exitApp().
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

/** Plain `fetch()` has no timeout — a degraded or throttled connection to a
 * public demo server can otherwise leave "Finding route…" (or a search)
 * spinning forever on a promise that may never settle, instead of ever
 * failing with a clear, retryable error. AbortController gives fetch itself
 * something to reject on once the clock runs out. */
async function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Ensures calls spaced at least `minIntervalMs` apart — used to respect the
 * fair-use / rate limits of the public Nominatim and Valhalla instances.
 * Callers are chained onto a shared queue so concurrent calls (e.g. a
 * debounced search firing again before an earlier keystroke's request has
 * finished) take their turn one at a time, rather than racing to read/write
 * `lastCall` independently — that race let bursts of calls through at once
 * instead of properly spacing them out, which is exactly the kind of burst
 * a fair-use rate limit is meant to prevent, and public instances that see
 * one tend to throttle the offending client hard for a while afterward. */
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

function formatDistance(m) {
  if (m < 950) return Math.round(m) + ' m';
  return (m / 1000).toFixed(1) + ' km';
}

/** Same idea as formatDistance, but for text handed to speechSynthesis —
 * "150 m" is read aloud as the letter "m", not "meters", so voice prompts
 * need the units spelled out in full. Never used for on-screen text.
 * Rounds meters DOWN to the nearest 10 ("in 50 meters", not "in 56 meters")
 * — a spoken distance reads as an approximation anyway, and a round number
 * is quicker to process while driving than an oddly specific one. */
function formatDistanceForSpeech(m) {
  if (m < 950) return `${Math.floor(m / 10) * 10} meters`;
  return `${(m / 1000).toFixed(1)} kilometers`;
}

/** Turns a target lead TIME into a lead DISTANCE at the current live speed,
 * clamped to [minM, maxM] — see the CONFIG comment above VOICE_PROMPT_LEAD_TIME_S
 * for why this is time-based rather than a flat distance (the same fixed
 * meter value is both too early in slow city traffic and dangerously late
 * at highway speed — this project's own tuned take on the general
 * time-based-lead convention common to turn-by-turn nav UX, not a verified
 * match to any specific app's real algorithm). state.currentSpeedMps
 * already carries a fix-to-fix derived estimate whenever the live GPS fix
 * itself didn't report a usable speed (see onPositionUpdate), so
 * CONFIG.VOICE_DEFAULT_SPEED_MPS below is only the last-resort fallback —
 * effectively just the very first fix of a trip, before there's a previous
 * fix to derive anything from. */
function dynamicVoiceLeadM(leadTimeS, minM, maxM) {
  const speedMps = state.currentSpeedMps ?? CONFIG.VOICE_DEFAULT_SPEED_MPS;
  return Math.min(maxM, Math.max(minM, speedMps * leadTimeS));
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

// escapeHtml() only escapes HTML metacharacters — it doesn't stop a
// `javascript:` (or other non-http(s)) value from being written into an
// href and executing on click. Used wherever a URL comes from a
// community-editable upstream source (Open Charge Map operator links)
// rather than this app's own code.
function isSafeHttpUrl(value) {
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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
  8: {},                                                                    // continue straight (kContinue) — plain arrow, the table's own default
  9: { rotate: 30 }, 10: { rotate: 90 }, 11: { rotate: 120 },                // (slight/-/sharp) right
  12: { path: UTURN_PATH, flip: true }, 13: { path: UTURN_PATH },            // u-turns
  14: { rotate: -120 }, 15: { rotate: -90 }, 16: { rotate: -30 },            // sharp/-/slight left
  18: { rotate: 45 }, 19: { rotate: -45 }, 20: { rotate: 45 }, 21: { rotate: -45 }, // ramps/exits
  22: {},                                                                   // stay straight (kStayStraight) — plain arrow
  23: { rotate: 20 }, 24: { rotate: -20 },                                   // stay right/left
  26: { path: ROUNDABOUT_PATH }, 27: { path: ROUNDABOUT_PATH },              // roundabout
};

// "Continue straight for X km" is spoken once per occurrence of any of
// these Valhalla maneuver types, but only when the straight leg is long
// enough to be worth calling out — a plain straight-through at a minor
// intersection every few hundred metres would otherwise narrate constantly.
// kContinue/kStayStraight are the obvious "keep going" types; kBecomes
// ("road becomes X") is still a straight-through, just a name change, so it
// counts too — and matters here because it's exactly the kind of boundary
// Valhalla splits a long straight stretch on (see straightAheadDistanceM).
const CONTINUE_STRAIGHT_TYPES = new Set([7, 8, 22]);
const CONTINUE_STRAIGHT_MIN_LENGTH_M = 1000;

/** Sums the length of maneuvers[startIdx] plus every consecutive
 * straight-through maneuver right after it, stopping at the first real
 * turn (or the end of the route). Valhalla often splits one genuinely long
 * straight stretch into several consecutive kContinue/kBecomes maneuvers —
 * at a named-road change, an interchange guidance point, a minor jog — each
 * individually well under CONTINUE_STRAIGHT_MIN_LENGTH_M even though the
 * aggregate distance to the next actual turn is long. Using only
 * maneuvers[startIdx].lengthM would miss the "Continue straight for X km"
 * callout in exactly that (common) case; this looks ahead to find the real
 * distance the driver will spend going straight. */
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

/** Maps a Valhalla maneuver type to a small fixed icon-key string for the
 * native Picture-in-Picture mini view (see native-pip.js / MainActivity.java)
 * — native has no idea what Valhalla's numeric
 * maneuver types mean, so this collapses MANEUVER_ICONS' same
 * categorization down to a handful of named buckets it can do a simple
 * lookup against, rather than duplicating Valhalla's type numbers there. */
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
/** Plain-language status banner. Auto-dismisses after a delay unless
 * `opts.sticky` — used only by genuine in-progress states ("Finding
 * route…", "Off route, no signal…") that need to persist until a real
 * follow-up event replaces them. Errors get a longer delay than info/
 * success (more to read), but still auto-dismiss: many error call sites
 * have no natural follow-up showStatus/clearStatus call, so leaving them
 * unconditionally sticky (the previous behavior) meant they'd sit pinned
 * on screen indefinitely — confirmed live with
 * "Couldn't restore your in-progress trip — starting fresh.". */
function showStatus(message, type = 'info', opts = {}) {
  clearTimeout(statusTimer);
  // Reset any leftover swipe-drag transform/opacity from a previous message
  // — without this, a new message shown mid-gesture (e.g. right as a small,
  // below-threshold drag was releasing) could inherit a half-dismissed
  // look instead of appearing fully visible.
  el.statusBanner.style.transform = '';
  el.statusBanner.style.opacity = '';
  el.statusBanner.textContent = message;
  el.statusBanner.className = type;
  if (!opts.sticky) {
    statusTimer = setTimeout(clearStatus, opts.timeoutMs || (type === 'error' ? 8000 : 4000));
  }
}
function clearStatus() {
  el.statusBanner.className = 'hidden';
  el.statusBanner.textContent = '';
}

// Swipe the status banner left or right to dismiss it immediately, instead
// of waiting out its auto-dismiss timer (see showStatus) — same pointer-
// event idiom as startStopDrag's list-reorder drag. Attached once, directly
// on the banner element, since it's a single fixed element reused for every
// message rather than one instance per message.
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
      // Lets the slide-out transition actually play before the element
      // itself disappears (clearStatus sets display:none via the 'hidden'
      // class, which would otherwise cut the animation off instantly).
      setTimeout(clearStatus, 200);
    } else {
      // Below the threshold — snap back to fully visible rather than treating
      // an accidental small nudge as a dismiss.
      el.statusBanner.style.transform = '';
      el.statusBanner.style.opacity = '';
    }
  }
  el.statusBanner.addEventListener('pointerup', endDrag);
  el.statusBanner.addEventListener('pointercancel', endDrag);
})();

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

/** Valhalla's own narrative text says "Bear left"/"Bear right" for a slight
 * turn — confusingly, since "bear" isn't otherwise used that way in
 * everyday directions. Swapped for "Slight left"/"Slight right", the same
 * wording Google Maps uses for the identical maneuver. Everything else
 * about Valhalla's generated phrasing stays as-is. */
function rewordInstruction(instruction) {
  return instruction.replace(/\bbear\b/gi, (match) => (match[0] === 'B' ? 'Slight' : 'slight'));
}

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/** Valhalla's own roundabout-exit phrasing varies by version/locale —
 * building it explicitly here guarantees the "Take the 2nd exit" wording
 * Google Maps uses, rather than depending on whatever Valhalla's own
 * template happens to say. `roundabout_exit_count` is the exit number
 * counting from the entry point — the 1st exit is the first spoke you pass,
 * not necessarily "straight across".
 *
 * Verified live against the public Valhalla server (Place Charles de
 * Gaulle, Paris): `roundabout_exit_count` actually arrives on the
 * kRoundaboutEnter maneuver (type 26), not kRoundaboutExit (type 27) as the
 * API docs describe — the exit maneuver had no such field at all. Checking
 * only type 27 (the original shape of this function) meant this phrasing
 * silently never fired for a real roundabout; both types are checked here
 * so it works regardless of which one actually carries the count. On the
 * enter maneuver, `street_names` is the roundabout's own name, not the road
 * being exited onto — that's on `nextM`, the exit maneuver that always
 * immediately follows. */
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

      // Valhalla's maneuver-level `bridge` flag is real routing data, not a
      // guess — worth calling out explicitly, since Valhalla's generic
      // "ramp"/"exit" wording for a grade-separated interchange reads
      // identically whether that ramp is an actual elevated flyover or just
      // an OSM-tagged at-grade connector road (common in India), which is
      // exactly the "why does it call this a ramp?" confusion this
      // disambiguates where the data actually lets us.
      if (m.bridge && !isArrivalType) {
        instruction += ' — this leads onto a flyover.';
      }

      // Valhalla labels arrival at an intermediate stop the same generic way
      // as the true final destination ("You have arrived at your
      // destination."). Relabel it with the actual stop name so a
      // multi-stop trip doesn't say "destination" twice in a row.
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
        // Valhalla's own solution to "two turns too close together to speak
        // both in full" — verbal_multi_cue is set on the maneuver right
        // before a short segment, and verbal_pre_transition_instruction is
        // already a natural combined phrase covering both maneuvers
        // (confirmed live: a 23m segment produced "Drive southeast on MDR.
        // Then Turn left onto Old NH 47."). See updateActiveManeuver's
        // far-callout branch — speaking this instead of hand-building "In X
        // meters, ${instruction}" is the whole fix, no client-side
        // "are these two maneuvers close together" heuristic needed.
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

/** `mapLoad` itself never rejects — MapLibre's 'load' event either fires or
 * it doesn't, with nothing to catch. If the map's style/tiles never finish
 * loading (a flaky connection, a blocked CDN, anything short of a full
 * network failure that map.on('error') would already surface elsewhere),
 * every caller awaiting the bare promise directly would hang forever with
 * no way to recover short of reloading the page — indistinguishable from
 * "Finding route…" or a search just spinning endlessly. This races it
 * against a bounded timeout instead, so the wait always eventually ends in
 * a clear, actionable error. */
function awaitMapLoad() {
  return Promise.race([
    mapLoad,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('The map failed to load — check your connection and reload the page.')),
      CONFIG.MAP_LOAD_TIMEOUT_MS,
    )),
  ]);
}

// Every layer belonging to the base "liberty" vector style, captured before
// any of our own sources/layers are added below — this is exactly what
// setMapViewMode hides/shows to switch to satellite imagery, without the
// disruptive full map.setStyle() swap that would otherwise drop every
// custom source (route, puck, etc.) added at runtime.
let baseStyleLayerIds = [];
let mapViewMode = 'map'; // 'map' | 'satellite'

/** Toggles between the normal vector map and Esri World Imagery satellite
 * tiles (free, keyless — the standard no-signup option for this). Hides
 * every base-style layer rather than swapping styles, so the route line,
 * live puck, and every other runtime-added layer stay exactly as they are —
 * you see your route drawn over satellite imagery, not a bare basemap. */
// Only these layer *types* actually need hiding for satellite mode — the
// ones that paint a solid area (land/water/buildings, the plain background
// color, and "liberty"'s own low-zoom natural_earth raster backdrop) would
// otherwise sit on top of and completely obscure the real imagery. Roads,
// borders (all 'line' layers) and every label/POI icon ('symbol' layers)
// are deliberately left alone, so satellite mode is a proper hybrid view —
// imagery plus labels — not a bare, unlabeled photo. Confirmed via the
// style's own JSON (curl https://tiles.openfreemap.org/styles/liberty) that
// "liberty" has exactly one layer of each of these three obscuring types.
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
  el.mapLayerBtn.setAttribute('aria-label', satellite ? 'Switch to map view' : 'Switch to satellite view');
}

mapLoad.then(() => {
  baseStyleLayerIds = map.getStyle().layers.map((l) => l.id);

  // Inserted with an explicit beforeId so it lands at the very BOTTOM of the
  // layer stack (addLayer with no second argument appends to the END —
  // i.e. on TOP of every base-style layer already loaded at this point,
  // which would silently cover the road/label layers setMapViewMode keeps
  // visible over it). Everything else (roads, labels, our own route/puck
  // layers) draws above this either way, so it only actually shows once the
  // base style's obscuring layers (land/water fills, background) are
  // hidden — see setMapViewMode/SATELLITE_HIDE_LAYER_TYPES.
  map.addSource('satellite', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    // Esri's service nominally supports up to z23, but real imagery
    // resolution varies a lot by place — plenty of areas (especially
    // outside major cities) have nothing past z17-19, and requesting a
    // tile deeper than what's actually captured there returns a literal
    // gray "Map data not yet available" placeholder image, not a clean
    // failure. Capping maxzoom here means MapLibre instead automatically
    // upscales the deepest real tile once you zoom in past this — blurrier,
    // but never that placeholder.
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });
  map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, baseStyleLayerIds[0]);

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
  // Painted over route-line (added after, so it draws on top) for whatever
  // portion of the route has already been driven — see
  // updateTraveledRouteSegment, called on every position update during
  // navigation. Empty until then, so it's invisible before/between trips.
  map.addSource('route-traveled', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'route-traveled-line',
    type: 'line',
    source: 'route-traveled',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5b6472', 'line-width': 5, 'line-opacity': 0.85 },
  });
  // Colors the route by how busy TomTom found it — two different shapes
  // depending on when it's populated: a handful of short dashes over just
  // the road ahead during live navigation (see runTrafficCheckin), or full
  // gap-free coverage of every option shown at planning time (see
  // paintRouteOptionsTrafficOverlay) so a busy stretch is visible on the
  // selected line and the gray alternates alike, not just called out in
  // the cards below. Either way, only populated with TomTom features
  // turned on (CONFIG.TOMTOM_FEATURES_ENABLED, overridable per device via
  // the Settings toggle — see tomtomFeaturesEnabled) and drive mode; empty
  // (and so invisible) otherwise. Added after route-traveled-line so it
  // always draws on top.
  map.addSource('route-traffic', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'route-traffic-line',
    type: 'line',
    source: 'route-traffic',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': 6,
      // Amber breakpoint reuses CONFIG.TRAFFIC_HEAVY_THRESHOLD so the line
      // coloring and the badge/ETA "heavy" cutoff stay tied together.
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

  // Harmless to always add — an empty source costs nothing, and it keeps
  // the "is transit configured" gating limited to the UI/network logic
  // below rather than needing to be threaded through map setup too.
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

  // Personal flight-tracking overlay (see runFlightCheckin/updateFlightLayer
  // below) — a plain circle + text label rather than a rotated plane icon.
  // A real rotated-heading icon would need map.loadImage/addImage for a
  // sprite; a circle is enough for "is a plane near me" situational
  // awareness and keeps this personal-branch feature's map code simple.
  // Harmless to always add, same reasoning as transit-route above.
  map.addSource('flight-aircraft', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'flight-aircraft-dot',
    type: 'circle',
    source: 'flight-aircraft',
    paint: {
      'circle-radius': 5,
      'circle-color': '#3d8bfd',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
    },
  });
  map.addLayer({
    id: 'flight-aircraft-label',
    type: 'symbol',
    source: 'flight-aircraft',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-allow-overlap': true,
      'text-optional': true,
    },
    paint: {
      'text-color': '#e8ecf3',
      'text-halo-color': '#0d1420',
      'text-halo-width': 1.2,
    },
  });
  // Tap an aircraft for its full detail — see showAircraftDetail. Same
  // click/hover-cursor pattern as route-alternates-line above.
  map.on('click', 'flight-aircraft-dot', (e) => {
    if (e.features.length) showAircraftDetail(e.features[0].properties);
  });
  map.on('mouseenter', 'flight-aircraft-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'flight-aircraft-dot', () => { map.getCanvas().style.cursor = ''; });
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
 * destination — this one specifically means "one of several options").
 * Carries a small name-tag bubble above the dot so it's clear which result
 * is which without having to tap each one — the label is absolutely
 * positioned (out of normal flow), so it doesn't affect the wrapper's own
 * size and the dot's center still lands exactly on the marker's lngLat.
 * `statusKey` (only ever set for an Open Charge Map EV result — see
 * normalizeChargingStation) tints the dot with the same honest
 * operational-status coloring as the place card's status dot; omitted
 * entirely for every other category, which keeps today's plain accent
 * color. */
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

/** The live-navigation puck — a bold directional chevron, deliberately
 * bigger and more distinct than the plain idle dot (createLocationDotElement
 * below), so movement/heading reads clearly at a glance while driving.
 * `.puck-marker-nav` (style.css) gives it a larger footprint than the base
 * `.puck-marker` size shared with the idle dot. */
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

/** The idle (non-navigating) "you are here" marker — a round dot with a
 * small directional wedge in front, the same idea as Google Maps' own
 * stationary location marker. Smaller than the full nav puck (createPuckElement
 * above) so it doesn't look like navigation is active when it isn't. */
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

/** Live "you are here" marker shown when the locate button is tapped
 * outside of navigation — unlike the old one-shot dot, this keeps updating
 * (see the locate button's own watchPosition below) and rotates its wedge
 * to match `headingDeg` when one is available (GPS course-over-ground while
 * moving, device-compass heading while stationary — see
 * handleDeviceOrientation) exactly like the nav puck does. `headingDeg` of
 * `null` (no heading source available yet) just leaves the last rotation in
 * place rather than snapping to 0/north. */
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

/** Device-compass heading, kept fresh by handleDeviceOrientation below —
 * the fallback for the idle location marker's rotation while stationary,
 * when GPS course-over-ground (pos.coords.heading) is meaningless (it
 * requires movement to mean anything, and is null/NaN at rest). Navigation
 * mode doesn't use this — its puck is always moving, so GPS/fix-to-fix
 * bearing alone (see onPositionUpdate) is already reliable there. */
let compassHeadingDeg = null;
function handleDeviceOrientation(event) {
  // iOS Safari exposes a ready-to-use true-north compass heading directly
  // via the non-standard `webkitCompassHeading`. Everywhere else, `alpha`
  // from the *absolute* variant of this event is degrees counter-clockwise
  // from north, so `360 - alpha` converts it to a standard clockwise compass
  // bearing. A non-absolute event (no compass hardware, or the browser only
  // ever fires the relative variant) has no fixed reference frame and is
  // deliberately ignored rather than shown as a plausible-looking but wrong
  // heading.
  const heading = typeof event.webkitCompassHeading === 'number'
    ? event.webkitCompassHeading
    : (event.absolute && typeof event.alpha === 'number' ? (360 - event.alpha) % 360 : null);
  if (heading != null) compassHeadingDeg = heading;
}

let deviceOrientationActive = false;
/** iOS 13+ gates DeviceOrientationEvent behind an explicit permission
 * prompt that can only be requested from within a real user-gesture
 * handler — called from the locate button's own click handler for exactly
 * that reason, not proactively on page load. A no-op everywhere else
 * (Android/desktop Chrome never define `requestPermission` at all, and
 * just start receiving orientation events once listened for). */
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
  window.addEventListener('deviceorientation', handleDeviceOrientation); // carries iOS's webkitCompassHeading instead of firing separately
  deviceOrientationActive = true;
}

/** The only consumer of these listeners is the idle "my location" marker
 * (compassHeadingDeg is read nowhere else — active navigation always has a
 * real GPS heading and never calls enableDeviceOrientation at all), so once
 * that's turned off there's no reason left to keep the device's
 * orientation/compass sensor hardware active and the JS engine processing a
 * steady stream of events (tens of Hz is common) for the rest of the tab's
 * lifetime. Called everywhere state.idleLocationWatchId is cleared. */
function disableDeviceOrientation() {
  if (!deviceOrientationActive) return;
  window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation);
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  deviceOrientationActive = false;
  compassHeadingDeg = null;
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

/** Two distinct glyphs, not just a recolor — an icon that only changes
 * color is easy to miss in peripheral vision while driving. The off-center
 * one reads as "this is your direction arrow, tap to bring it back into
 * view"; fill="currentColor" so it goes white automatically once
 * .fab.active sets color:#fff on the accent background, no separate CSS
 * needed for that. Same JS-owns-the-icon pattern as voiceModeIcon() above. */
function locateBtnIcon(offCenter) {
  if (offCenter) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><path d="M12 2 L19 21 L12 17 L5 21 Z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
    + '<circle cx="12" cy="12" r="3"/><path d="M12 2 v3.5 M12 18.5 v3 M2.5 12 h3.5 M18.5 12 h3"/></svg>';
}

// null (not false) so the very first updateLocateBtnState() call below
// always paints an icon — #locate-btn ships with no inline SVG at all
// (see index.html), unlike the old static-markup version this replaced.
let lastLocateBtnOffCenter = null;
function updateLocateBtnState() {
  const offCenter = state.navigating && !state.followMode;
  el.locateBtn.classList.toggle('active', offCenter);
  if (offCenter !== lastLocateBtnOffCenter) {
    el.locateBtn.innerHTML = locateBtnIcon(offCenter);
    el.locateBtn.setAttribute('aria-label', offCenter ? 'Recenter on your location' : 'Show my location');
    if (offCenter) {
      // Remove-reflow-readd so the pulse retriggers even if this somehow
      // fires twice in a row — a CSS animation won't restart on a class
      // that's already present with no reflow in between.
      el.locateBtn.classList.remove('pulse-once');
      void el.locateBtn.offsetWidth;
      el.locateBtn.classList.add('pulse-once');
    }
    lastLocateBtnOffCenter = offCenter;
  }
}
el.locateBtn.addEventListener('animationend', () => el.locateBtn.classList.remove('pulse-once'));
updateLocateBtnState(); // paints the default (following) icon on load

/** Starts the idle "where am I" GPS share backing state.myLocationMarker —
 * shared by the locate button's click handler and the silent auto-start on
 * app open (see the bottom of this file). `silent` (auto-start) skips
 * everything that assumes a user just tapped something: enableDeviceOrientation
 * (gesture-gated on iOS — there's no gesture to hang it off of at app open;
 * GPS course-over-ground still covers heading while moving) and every
 * showStatus call, success or failure — an unprompted permission ask
 * shouldn't also unprompt-edly nag with an error banner if declined. The
 * marker/map-flyTo behavior itself is identical either way. No-ops if a
 * share is already running (defensive; the button's own click handler
 * handles toggling an active share off separately, before this could ever
 * be called while one's already active). */
async function startIdleLocationShare({ silent = false } = {}) {
  if (state.idleLocationWatchId != null) return;
  if (!('geolocation' in navigator)) {
    resolverDebugLog(`startIdleLocationShare(silent=${silent}): no geolocation support in this browser/WebView.`, 'error');
    if (!silent) showStatus('This browser does not support GPS location.', 'error');
    return;
  }
  resolverDebugLog(`startIdleLocationShare(silent=${silent}) called — this is the ${silent ? 'automatic on-open' : 'locate-button'} share, separate from real navigation's own GPS watch.`);
  if (!silent) await enableDeviceOrientation(); // gesture-gated on this same tap — iOS requires that
  // This path uses plain navigator.geolocation even on the Android shell
  // (unlike real navigation's startLocationWatch, which goes through
  // @capacitor-community/background-geolocation) — but the device's
  // Location *service* being off breaks it exactly the same way, so it
  // needs the same proactive "turn on Location?" nudge before watching.
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
      // GPS course-over-ground while actually moving, the device compass
      // while stationary (see handleDeviceOrientation) — the same
      // preference order the nav puck already uses in onPositionUpdate.
      const headingDeg = typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : compassHeadingDeg;
      updateMyLocationMarker(lngLat, headingDeg);
    },
    (err) => {
      // Without this reset, the very next tap hits stopIdleLocationShare's
      // "already sharing, turn it off" case (state.idleLocationWatchId is
      // still a non-null, dead id) and silently no-ops — the user has to
      // tap twice to actually retry after e.g. granting a permission
      // they'd denied.
      resolverDebugLog(`startIdleLocationShare(silent=${silent}): watchPosition error "${err.message}" (code ${err.code}) — ${silent ? 'staying quiet, this was an unprompted attempt' : 'showing an error banner'}.`, 'error');
      navigator.geolocation.clearWatch(state.idleLocationWatchId);
      state.idleLocationWatchId = null;
      el.locateBtn.classList.remove('active');
      disableDeviceOrientation();
      // POSITION_UNAVAILABLE (2) is what the browser/WebView reports when
      // the device's Location *service* is off — a different problem from
      // PERMISSION_DENIED (1), and "check location permissions" is actively
      // misleading for it (the permission is fine; the OS-level service
      // isn't). ensureLocationEnabled() above should catch this before it
      // ever gets here on the Android shell, but plain web/PWA has no
      // equivalent prompt, so this can still happen there.
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

/** Stops the idle share started above — only ever called automatically,
 * when real navigation starts and takes over live tracking with its own
 * watch (see startNavigation). Not reachable from the locate button itself
 * any more — see its click handler for why. */
function stopIdleLocationShare() {
  if (state.idleLocationWatchId == null) return;
  navigator.geolocation.clearWatch(state.idleLocationWatchId);
  state.idleLocationWatchId = null;
  if (state.myLocationMarker) { state.myLocationMarker.remove(); state.myLocationMarker = null; }
  el.locateBtn.classList.remove('active');
  disableDeviceOrientation();
}

el.locateBtn.addEventListener('click', async () => {
  if (state.navigating) {
    state.followMode = true;
    updateLocateBtnState();
    if (state.lastFix) followCamera([state.lastFix.lng, state.lastFix.lat], state.lastHeading);
    return;
  }
  // Already sharing — re-center on the live position instead of stopping
  // it. This used to call stopIdleLocationShare() here (a second tap
  // toggling sharing back off, same as any other toggled-on FAB) — but
  // confirmed live, that reads as "the app lost my GPS location" rather
  // than a deliberate toggle: every other map app's own locate button
  // (Google Maps, Apple Maps, ...) just re-centers on a repeat tap and
  // never stops showing your position this way.
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
// runs — no coverage layer, no street-view buttons anywhere, no network
// calls to Mapillary at all. There's no public shared token to default to
// (every app must register its own), so "disabled" has to be the default.
// ============================================================================
const MAPILLARY_ENABLED = !!CONFIG.MAPILLARY_ACCESS_TOKEN;
let mapillaryLayerVisible = false;
const mapillarySequence = { ids: [], index: -1 };
// Guards against a rapid open of two different street-view buttons before
// the first request resolves — without this, a slower first response
// arriving after a second (different) one would overwrite the viewer with
// the wrong image. Same isStale()-style token idea used for autocomplete
// elsewhere in this file, just not previously applied here.
let mapillaryOpenSeq = 0;

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
    await awaitMapLoad();
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
// Offline map tiles for a chosen region
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
          // fetchWithTimeout, not a bare fetch — every other network call in
          // this app already goes through it. A single stalled tile (flaky
          // network, a captive portal that accepts the connection but never
          // answers) would otherwise hang this worker's loop forever: the
          // Promise.all below never resolves, the progress UI freezes
          // permanently, and Cancel (only checked between tiles, not
          // against a fetch already in flight) can't get it unstuck either.
          const res = await fetchWithTimeout(url);
          if (res.ok) { await cache.put(url, res); ok = true; }
        } catch (err) {
          // Network hiccup (or a timeout, now) — loop retries, or falls
          // through to "failed" below.
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

// Session-only cache keyed by normalized query text: re-searching something
// already looked up this session returns instantly with no network call,
// no rate-limit wait, and works even with no connection at all.
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
    res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'The geocoding service is taking too long to respond. Try again in a moment.'
      : 'Could not reach the geocoding service. Check your connection or the Nominatim server address.');
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
 * used for live GPS snapping) so `.distanceM` is distance
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

/** Best-effort "is this place open right now" from an OSM opening_hours
 * string (see the openingHours field nominatimSearch/fetchNearbyChargingStations
 * already attach to results) — for the "Open now" search filter. Covers
 * the syntax that shows up in practice (day lists/ranges, comma-separated
 * time ranges, overnight ranges spanning midnight, 24/7, off/closed) but
 * deliberately not the full spec (public/school holidays, month ranges,
 * sunrise/sunset, quoted comments) — those bail out to null rather than
 * risk a confidently wrong answer.
 *
 * Returns true/false when it can actually tell, or null when it can't —
 * callers (see applyOpenNowFilter) treat null as "unknown", never as
 * closed: hiding a place that's actually open is a worse mistake than
 * showing one whose hours this couldn't parse. */
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
      // Yesterday's overnight range can still cover right now (e.g. now is
      // 01:00 Saturday, rule is "Fr 22:00-02:00") — check nowMinutes as if
      // measured from yesterday's midnight instead.
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

/** Nominatim's per-tag search frequently returns the SAME real-world
 * amenity twice — once as the OSM way (a mapped building/canopy footprint)
 * and once as a separate node (the actual pump/point), each carrying an
 * identical name but centered tens of metres apart (the way's polygon
 * centroid vs. the node's own point). Confirmed live against Nominatim: a
 * "Bharat Petroleum" fuel station near Kochi comes back as both a `way` at
 * one point and a `node` ~40m away, same name, both passing straight
 * through as separate results. Fuel stations in India are frequently
 * double-mapped like this; EV charging points are almost always a single
 * node, which is why this bug reads as "petrol pump markers jump around"
 * while EV charging looked fine — it isn't category-specific, it's just
 * that fuel data happens to trigger it far more often. Left undeduped, the
 * same-named result appears twice in the list and as two separate map
 * markers a stone's throw apart, so tapping "the" result for that name can
 * land on either one depending on which of the two nearly-identical
 * entries the sort happened to put first — reading as the pin "randomly"
 * moving. Collapses any two results with the same primary name (the part
 * before the first comma in the label — see splitPlaceLabel) within
 * DUPLICATE_DISTANCE_M of each other down to just the first one seen; safe
 * to key on name alone at this range since two genuinely different real
 * places sharing an identical name (e.g. two separate "HP" pumps) are never
 * actually mapped this close together. */
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
// EV charging details: Open Charge Map (see CONFIG.OPENCHARGEMAP_ENABLED for
// why this exists, and why it's never a live "is this charger free right
// now" feature). Only ever called when a key is configured — see the branch
// inside categorySearchNear just below, the single dispatch point every EV
// search (category chip, "search along the route", "EV charging near X")
// already funnels through.
// ============================================================================
const EV_CHARGING_TAG = 'amenity=charging_station'; // matches CHIP_CATEGORY_TAGS.ev and the POI_CATEGORY_TAGS entry below — one literal, repeated deliberately rather than introduced as a shared constant those tables would need to import
const openChargeMapLimiter = createLimiter(CONFIG.OPENCHARGEMAP_MIN_INTERVAL_MS);

// Open Charge Map's own StatusType.Title strings, mapped to one of three
// CSS-safe keys the place card and map markers style against. Never
// invents a status for a POI that has none — see normalizeChargingStation,
// which leaves statusKey as 'unknown' rather than guessing.
const OCM_STATUS_KEY_BY_TITLE = {
  Operational: 'operational',
  'Partly Operational': 'operational',
  'Not Operational': 'not-operational',
  'Temporarily Unavailable': 'not-operational',
};

/** "4 months ago" / "3 days ago" / "today" — used only for Open Charge
 * Map's DateLastStatusUpdate. That field matters more here than a typical
 * "last updated" timestamp would: OCM's status is community-maintained and
 * confirmed often stale, so a bare status word with no age reads as far
 * more trustworthy than it should — see the OPENCHARGEMAP_ENABLED comment
 * in config.js. Returns null for a missing/unparseable date so callers can
 * say "check-in date unknown" rather than showing a wrong one. */
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

/** Normalizes one Open Charge Map POI into this app's existing
 * {label, lat, lon} search-result shape (see nominatimSearch) plus an
 * `evDetails` object the place card renders when present (see
 * showPlaceCard). Field names sourced directly from OCM's own OpenAPI spec
 * — AddressInfo/Connections/OperatorInfo/UsageType/StatusType are all
 * nested objects with their own `.Title`, not flat strings. */
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

/** Open Charge Map-backed EV charging search — see the branch inside
 * categorySearchNear just below for how this and the plain-OSM path
 * coexist. Calls this deployment's own /api/opencharge-poi (see
 * lib/opencharge-poi.js, worker.js, functions/api/opencharge-poi.js)
 * rather than Open Charge Map directly — the real API key is a Cloudflare
 * secret attached server-side, never something the client sends (see
 * CONFIG.OPENCHARGEMAP_ENABLED's comment in config.js for why). Same
 * native-base-URL handling as resolveGoogleMapsLink's call to
 * /api/resolve-maps-url: the Android shell's own origin has no server of
 * its own to route this to.
 *
 * Returns `null` (not an error) when this deployment has
 * OPENCHARGEMAP_ENABLED set but never finished configuring the
 * OPENCHARGEMAP_API_KEY secret server-side — categorySearchNear treats
 * that as "fall back to the OSM search" rather than showing an error for
 * what's really a one-time setup gap. Any other failure still throws, the
 * same way nominatimSearch/requestRoute do (a plain Error with a
 * user-facing message), so it fits the existing try/catch-and-showStatus
 * handling at every call site unchanged. */
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
    // OPENCHARGEMAP_API_KEY not set server-side yet — see the comment above.
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

// Maps our OSM category tags to a plain-text TomTom Category Search term.
// TomTom's endpoint takes a free-text query term biased by lat/lon/radius
// rather than requiring an exact numeric category ID, so this stays a
// simple lookup instead of a fragile hardcoded ID table.
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
 * radii — real for categories with genuinely sparse OSM coverage in India
 * (EV charging especially, see README's "Known limitations"). Only ever
 * called with tomtomFeaturesEnabled true (same flag the traffic feature
 * uses, defaulting to CONFIG.TOMTOM_FEATURES_ENABLED and overridable per
 * device via the Settings toggle; false means this fallback never fires
 * either, and behaviour is unchanged from before it existed). Calls this
 * app's own /api/places route (a Cloudflare Pages Function — see
 * functions/api/places.js) rather
 * than TomTom directly, so the real API key never reaches the client.
 * Degrades quietly on any failure — network error, timeout, non-200,
 * malformed body — same as every other optional integration in this file: a
 * search simply stays empty rather than surfacing a scary error for a
 * non-critical path. */
async function tomtomCategorySearchNear(tag, lat, lon) {
  const term = TOMTOM_CATEGORY_TERM[tag];
  if (!term || !tomtomFeaturesEnabled) return [];
  try {
    // isNativePlatform() prefix: the Android shell's own origin
    // (https://localhost) has no server behind it, so a plain relative
    // path here would try to reach a route that doesn't exist natively —
    // same reason every other proxy call in this file already does this.
    const base = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
    const url = `${base}/api/places?term=${encodeURIComponent(term)}&lat=${lat}&lon=${lon}&radius=${CONFIG.TOMTOM_PLACES_FALLBACK_RADIUS_M}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
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
    return []; // network error, AbortError from fetchWithTimeout's own timeout, malformed JSON — all treated the same
  }
}

/** Nominatim's bracket syntax (`q=[amenity=fuel]`) searches by OSM tag
 * rather than by name — this is what makes "petrol pumps near me" work at
 * all, since petrol pumps mostly aren't individually named in OSM. Tries
 * the default radius first, then a wider one, since some categories (EV
 * charging especially) have genuinely sparse OSM coverage in India and a
 * too-tight box can come back empty even where results do exist nearby.
 * Only after BOTH Nominatim radii come back empty does it try TomTom
 * Places Search as a last resort (see tomtomCategorySearchNear) — Nominatim
 * stays the primary source since it needs no API key and generally has
 * better OSM-native coverage; TomTom only fills the genuine gaps. */
async function categorySearchNear(tag, lat, lon) {
  const cacheKey = categorySearchCacheKey(tag, lat, lon);
  if (categorySearchCache.has(cacheKey)) return categorySearchCache.get(cacheKey);
  // Open Charge Map, when enabled, replaces the OSM path specifically for
  // EV charging — every caller of categorySearchNear (the category chip,
  // "search along the route", "EV charging near X") funnels through here,
  // so this one branch is the whole integration point. Not enabled, or
  // enabled but the server-side API key isn't actually configured yet
  // (fetchNearbyChargingStations returns null for that case — see its own
  // comment): falls through to the exact OSM search below, unchanged from
  // before this feature existed.
  if (tag === EV_CHARGING_TAG) {
    if (CONFIG.OPENCHARGEMAP_ENABLED) {
      const results = await fetchNearbyChargingStations(lat, lon);
      if (results) {
        categorySearchCache.set(cacheKey, results);
        return results;
      }
      // results === null: fetchNearbyChargingStations already logged why
      // (the 501/not-configured case) — fall through to OSM below.
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
// speak() (above, in the live-tracking section) is what actually reads this;
// this block is just the button and its icon/label per state. Not persisted
// across a reload — a session preference, same as the avoid-tolls/avoid-
// highways toggles elsewhere in this app.
//
// Used to be a three-way all/important/off choice, meant to mirror Google
// Maps' own alerts-only mode. Removed rather than fixed: "important" only
// ever spoke one rare event (arrival) while silencing every turn-by-turn
// instruction — the opposite of an alerts-only mode, and actively harmful
// for actual driving (no turn guidance at all). On/off is the whole
// meaningful choice here.
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

/** What to say the moment voice guidance is switched back on mid-trip —
 * turning it off then back on otherwise gives total silence until the
 * upcoming maneuver's own far/near cue happens to cross its distance
 * threshold on its own schedule, which (confirmed as a real gap, not a
 * "nothing to say yet" false alarm) could be minutes away, leaving no way
 * to tell the toggle actually worked. Deliberately a one-off confirmation,
 * not routed through state.spokenFar/spokenNear — it doesn't mark either
 * as done, so the normal timed cues for this same maneuver still fire on
 * their own schedule afterward, however near or far that turn actually is.
 * Returns null when there's nothing meaningful to confirm with (not
 * navigating, or already on the final "arriving" stretch with no further
 * maneuver ahead) — the toggle's own status toast is enough on its own
 * then. */
function describeCurrentManeuverForUnmuteConfirmation() {
  if (!state.navigating || !state.route || state.traveledM == null) return null;
  const maneuvers = state.route.maneuvers;
  const nextIdx = state.currentManeuverIdx + 1 < maneuvers.length ? state.currentManeuverIdx + 1 : null;
  if (nextIdx == null) return null;
  const distToNextM = Math.max(0, maneuvers[nextIdx].startDistM - state.traveledM);
  const instruction = maneuvers[nextIdx].instruction;
  // formatDistanceForSpeech floors to the nearest 10m — anything closer
  // than that would otherwise read as "In 0 meters, turn left" (same
  // rounding quirk the real far/near cues already work around).
  return distToNextM < 10 ? instruction : `In ${formatDistanceForSpeech(distToNextM)}, ${instruction}`;
}

// Guards the unmute confirmation above against a quick mute/unmute flick
// (double-tapping the button, or muting then immediately regretting it) —
// without this, that would sound exactly like two back-to-back navigation
// prompts, which is the opposite of the point of the confirmation. Tracks
// the last toggle in EITHER direction, not just unmutes, so a rapid
// off→on→off→on sequence stays quiet throughout rather than only skipping
// every other one.
let lastVoiceModeToggleAt = 0;

el.voiceModeBtn.addEventListener('click', () => {
  const nextIdx = (VOICE_MODE_ORDER.indexOf(state.voiceMode) + 1) % VOICE_MODE_ORDER.length;
  const previousMode = state.voiceMode;
  state.voiceMode = VOICE_MODE_ORDER[nextIdx];
  renderVoiceModeBtn();
  // Switching to off mid-sentence shouldn't let the old prompt keep
  // talking — speechSynthesis.cancel() only ever silences the web path;
  // on the native shell it's a silent no-op (confirmed live: toggling
  // voice off during a walk left the in-progress instruction playing out
  // regardless), so that platform needs its own explicit stop() instead.
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

el.mapLayerBtn.addEventListener('click', () => {
  setMapViewMode(mapViewMode === 'satellite' ? 'map' : 'satellite');
});

// ============================================================================
// Weather badge — current conditions either at a selected place or at the
// live GPS position while navigating (see refreshWeatherBadge below).
// Backed by Open-Meteo: free, keyless, CORS-enabled, no config needed —
// unlike every other external service this app talks to, there's no
// self-hosted alternative to point at instead, which is exactly why
// CONFIG.WEATHER_ENABLED exists as a one-line escape hatch for a
// privacy-conscious user who doesn't want this app's GPS position going
// anywhere, even to a free/anonymous API.
// ============================================================================
// Codes 0/1 (WMO "clear sky"/"mainly clear" — no actual precipitation or
// cloud phenomenon) are the only ones that read as visibly wrong at night:
// a sun icon while driving in the dark. Everything else (cloud/rain/snow/
// storm glyphs) doesn't carry a day/night connotation strong enough to be
// worth a second variant, so only these two get one.
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
/** `isDay` is Open-Meteo's own `current.is_day` (1/0) — computed server-side
 * from the actual local sunrise/sunset at that lat/lon, not just a client
 * clock guess, so it's correct in any timezone/season without this app
 * needing to compute sun position itself. */
function weatherEmojiForCode(code, isDay) {
  if (CLEAR_SKY_CODES.has(code) && !isDay) return '🌙';
  return WEATHER_EMOJI_BY_CODE[code] || '☁️'; // unrecognized code — safe default rather than showing nothing
}

// Session-only cache keyed by (rounded lat/lon, coarse time bucket) — same
// idea as nominatimCache/categorySearchCache above. Rounding to ~0.05°
// (~5km) plus a 10-minute time bucket means the constant stream of GPS
// fixes during navigation mostly resolves from cache instead of hitting
// Open-Meteo on every tick — the cache key itself is the throttle, no
// separate timer needed.
const weatherCache = new Map();
function weatherCacheKey(lat, lon) {
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const rLat = (Math.round(lat / 0.05) * 0.05).toFixed(2);
  const rLon = (Math.round(lon / 0.05) * 0.05).toFixed(2);
  return `${rLat}|${rLon}|${bucket}`;
}

/** Never throws — any failure (network error, non-200, malformed JSON)
 * resolves to null so the badge simply stays hidden rather than showing an
 * error, matching how every other optional enrichment in this app degrades.
 * `force` skips the cache *read* (still writes the fresh result back to it)
 * — used by the weather badge's own tap-to-refresh, since otherwise the
 * 10-minute cache bucket would make a manual refresh a no-op. */
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
    return null;
  }
}

// Guards against an older, slower-to-resolve refreshWeatherBadge() call
// clobbering the badge after a newer one has already applied — same
// "ignore a superseded async result" idea as the isStale() checks around
// the autocomplete/geocoding calls above, just without needing a whole
// closure since there's only ever one badge to keep consistent.
let weatherRequestToken = 0;

/** Single source of truth for what the weather badge currently shows: the
 * live GPS position while navigating takes priority over an incidentally-
 * still-open place card, which in turn beats showing nothing. Call this
 * from anywhere state changes in a way that could affect it — see the
 * showPlaceCard/hidePlaceCard/startNavigation/onPositionUpdate/
 * endNavigation call sites. Always fire-and-forget: never awaited by
 * callers, since none of this should block a synchronous UI update.
 * `force` forwards to fetchWeather to bypass its cache — see the badge's
 * own click handler below. */
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

// Tap-to-refresh: only meaningful while the badge is actually visible (it's
// not a button when hidden/non-interactive-looking), force-bypasses the
// cache so a manual refresh always hits the network rather than silently
// no-op'ing within the same 10-minute cache bucket. Also reachable via
// keyboard (Enter/Space) since the badge is a role="button" div, not a
// real <button>, for layout reasons matching the other .fab controls.
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
//
// Deliberately narrow in scope: TomTom's free tier gives Flow Segment Data
// 20K requests/month, but Traffic Incident Details only 2,500/month, so this
// only ever uses Flow Segment Data (currentSpeed vs. freeFlowSpeed for the
// road segment nearest a point) — never incidents, never TomTom's own
// routing (Valhalla remains the only routing engine). A handful of samples
// fired a few times per drive stays nowhere near either cap.
//
// CONFIG.TOMTOM_FEATURES_ENABLED false (the shipped default, overridable per
// device via the Settings toggle — see tomtomFeaturesEnabled) disables this
// entirely: maybeCheckTraffic bails before any fetch. See config.js for the
// full cadence/sampling/threshold tunables.
// ============================================================================

// Short-TTL cache keyed by a coarse lat/lon grid cell (see
// TRAFFIC_CACHE_GRID_DECIMALS) — route options routinely share a stretch
// near a common start/end point, a detour candidate re-samples ground a
// sibling option already covered, and a check-in during dead-stopped
// traffic re-queries almost the same spot every cycle. This collapses those
// into one real call instead of re-asking a question already answered
// (see fetchTomTomFlowRatio for which responses are actually cached).
const trafficRatioCache = new Map(); // gridKey -> { ratio, expiresAt }
// Expired entries aren't actively pruned (checked lazily on next lookup, if
// any), so a long drive covering mostly-new ground could otherwise grow
// this without bound. Plain FIFO cap, same reasoning as capValhallaCache
// below — this only ever saves a genuinely-nearby-in-time repeat query, not
// a working set worth optimizing real LRU eviction order for.
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

/** One Flow Segment Data request for a single point. Returns the
 * currentSpeed/freeFlowSpeed ratio, or null on any failure — network error,
 * timeout, non-200 (including HTTP 429 quota-exceeded), a malformed/missing
 * body, or a confidence below CONFIG.TRAFFIC_MIN_CONFIDENCE (see that
 * constant's own comment — a low-confidence reading is TomTom's own signal
 * that it fell back to a historical average rather than real live probe
 * data, so it's excluded the same as a failed request rather than averaged
 * in as if it were equally trustworthy). Callers simply exclude a null from
 * the average: same quiet-degrade treatment as fetchWeather above, and
 * navigation is never affected by this failing.
 *
 * Checks trafficRatioCache first and, on a real (non-network-error) answer,
 * writes back into it — see that cache's own comment above for why. Only a
 * well-formed response gets cached, whether that's a usable ratio or a
 * confidently-filtered null (low confidence/missing data — TomTom's own
 * answer, unlikely to change within the TTL); a genuine fetch failure
 * (bad HTTP status, network error, timeout, malformed body) is deliberately
 * never cached, since that's worth retrying next time, not remembering as
 * "no data" for the whole window.
 *
 * Calls this app's own /api/traffic route (a Cloudflare Pages Function —
 * see functions/api/traffic.js) rather than TomTom directly, so the real
 * API key never reaches the client.
 *
 * Deliberately does NOT use the response's own coordinates.coordinate
 * geometry for anything — that's TomTom's own matched road segment from
 * TomTom's map data, which is a different dataset than the OSM/Valhalla
 * route actually being drawn. In a dense area with parallel or crossing
 * roads it can snap to a nearby-but-different road, drawing a colored dash
 * that's visibly off the route. sampleTrafficAhead instead slices our own
 * route line around the queried point, so any dash is guaranteed to land
 * exactly on the line already on screen. */
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
    // isNativePlatform() prefix: the Android shell's own origin
    // (https://localhost) has no server behind it, so a plain relative
    // path here would try to reach a route that doesn't exist natively —
    // confirmed as the reason live traffic never showed any colored
    // route dashes on the APK at all (every call silently failed and hit
    // the catch block below, however TOMTOM_API_KEY was configured).
    const base = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
    const url = `${base}/api/traffic?lat=${lat}&lon=${lon}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null; // covers 429 and any other non-200 — not cached, worth retrying
    const data = await res.json();
    const seg = data && data.flowSegmentData;
    const current = seg && seg.currentSpeed;
    const freeFlow = seg && seg.freeFlowSpeed;
    if (typeof current !== 'number' || typeof freeFlow !== 'number' || freeFlow <= 0) return cacheAndReturn(null);
    // Missing confidence (shouldn't happen per TomTom's own schema, but
    // never assumed) is treated as "no reason to distrust it" rather than
    // dropped outright.
    const confidence = typeof seg.confidence === 'number' ? seg.confidence : 1;
    if (confidence < CONFIG.TRAFFIC_MIN_CONFIDENCE) return cacheAndReturn(null);
    return cacheAndReturn(current / freeFlow);
  } catch (err) {
    return null; // network error, AbortError from fetchWithTimeout's own timeout, malformed JSON — not cached, worth retrying
  }
}

/** Fires one Flow Segment Data request per point, evenly spaced over
 * `aheadM` metres of `lineFeature` starting at `startM` along it, and
 * returns a distance-weighted average currentSpeed/freeFlowSpeed ratio —
 * nearer samples count more (weight 1/(1 + kilometres from the start of
 * the window)), so a bad patch right ahead isn't diluted into invisibility
 * by clear road further out in the same window, the way a flat average
 * would. Shared by runTrafficCheckin (the live route's own lookahead) and
 * maybeRerouteForTraffic (comparing the current route against alternates)
 * — identical sampling/weighting logic either way, just a different
 * lineFeature/window. Returns `{ ratio: null, samples: [] }` if `aheadM` is
 * non-positive or every sample failed/was filtered out. */
async function sampleTrafficAhead(lineFeature, startM, aheadM, n) {
  if (aheadM <= 0) return { ratio: null, samples: [] };
  const points = [];
  for (let i = 0; i < n; i++) {
    // Midpoints of n equal segments across the sampled window — spreads
    // samples evenly without wasting one right at the window's own start
    // (already known) or right at its far edge.
    const d = Math.min(aheadM * (i + 0.5) / n, aheadM);
    const [lon, lat] = turf.along(lineFeature, startM + d, { units: 'meters' }).geometry.coordinates;
    points.push({ lon, lat, d }); // d: distance from the START of this window (not the full route) — see callers for how that's turned into an absolute route distance
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

/** Single source of truth for the "Heavy traffic ahead" indicator: visible
 * only while there's a valid averaged ratio under
 * CONFIG.TRAFFIC_HEAVY_THRESHOLD. No data yet, all samples failed, or
 * traffic is fine — all just hide it, so this reads as occasional, not
 * constant chatter. */
function refreshTrafficBadge() {
  const heavy = state.trafficRatio != null && state.trafficRatio < CONFIG.TRAFFIC_HEAVY_THRESHOLD;
  el.trafficBadge.classList.toggle('hidden', !heavy);
}

/** Resets every piece of check-in bookkeeping and hides the indicator.
 * Called whenever a route is (re)planned (renderRoute) and when navigation
 * starts/ends, so a stale ratio or cadence timer from a previous/replaced
 * route never leaks into the next one. */
function resetTrafficTracking() {
  state.lastTrafficCheckAt = null;
  state.lastTrafficCheckDistM = null;
  state.trafficCheckInFlight = false;
  state.trafficRatio = null;
  refreshTrafficBadge();
  // Guarded: renderRoute calls this before awaitMapLoad() resolves (same
  // spot spokenFar/spokenNear get reset), so on the very first route of a
  // cold page load the map's sources may not exist yet — nothing to clear
  // in that case anyway, since route-traffic couldn't have any stale data.
  const trafficSource = map.getSource('route-traffic');
  if (trafficSource) trafficSource.setData(emptyFeatureCollection());
}

/** Samples the live route's own near-term lookahead (see
 * sampleTrafficAhead), sized to CONFIG.TRAFFIC_SAMPLE_AHEAD_TIME_S at
 * current speed — clamped between TRAFFIC_SAMPLE_AHEAD_MIN_M/_MAX_M, and
 * never past the destination — via the same dynamicVoiceLeadM helper the
 * turn-by-turn voice cues already use, so a highway cruise and a slow city
 * crawl each get a lookahead window that actually covers a similar amount
 * of real driving time. If every sample fails, state.trafficRatio becomes
 * null ("no data"), never something alarming. Each successful sample also
 * becomes one colored dash on the route-traffic map layer.
 *
 * Once a valid ratio comes back below CONFIG.TRAFFIC_HEAVY_THRESHOLD, hands
 * off to maybeRerouteForTraffic to decide whether a genuinely better
 * alternate exists — fire-and-forget, so a reroute attempt (which itself
 * makes further network calls) never delays this check-in's own return. */
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
    const { ratio, samples } = await sampleTrafficAhead(ahead, 0, aheadM, Math.max(1, CONFIG.TRAFFIC_SAMPLE_POINTS));
    state.trafficRatio = ratio;
    refreshTrafficBadge();

    // Each dash is a short slice of OUR OWN route line centered on the
    // sample point — not TomTom's own matched-segment geometry (see
    // fetchTomTomFlowRatio's comment) — so it's always exactly on the route
    // actually drawn on screen, never a nearby-but-different road.
    const half = CONFIG.TRAFFIC_DASH_HALF_WIDTH_M;
    const lineFeatures = samples.map((s) => {
      const absoluteM = traveledM + s.d; // s.d is relative to the sampled window's own start (traveledM), not the full route
      const from = Math.max(0, absoluteM - half);
      const to = Math.min(state.route.totalDistM, absoluteM + half);
      const dash = turf.lineSliceAlong(state.route.lineFeature, from, to, { units: 'meters' });
      return { type: 'Feature', properties: { ratio: s.ratio }, geometry: dash.geometry };
    });
    map.getSource('route-traffic').setData({ type: 'FeatureCollection', features: lineFeatures });

    if (ratio != null && ratio < CONFIG.TRAFFIC_HEAVY_THRESHOLD) {
      maybeRerouteForTraffic(traveledM);
    }
  } finally {
    state.trafficCheckInFlight = false;
  }
}

/** Only ever called right after a check-in confirms heavy traffic ahead
 * (see runTrafficCheckin) — requests alternates from the live position and
 * compares each one's own near-term traffic ratio against the current
 * route's, switching only if a genuinely better option exists. Unlike a
 * deviation reroute, Valhalla itself has no notion that traffic exists at
 * all — its routing graph only knows static road speeds/class, so asking
 * it to "reroute" with no comparison against real flow data would almost
 * always just hand back the exact same route. Shares state.isRerouting
 * with checkDeviation/triggerReroute so the two can never fire at once —
 * a genuinely off-route driver takes priority over a traffic comparison. */
async function maybeRerouteForTraffic(traveledM) {
  if (state.isRerouting || !state.navigating || state.travelMode !== 'drive' || !state.route) return;
  const now = Date.now();
  if (state.lastTrafficRerouteAt != null && now - state.lastTrafficRerouteAt < CONFIG.TRAFFIC_REROUTE_MIN_INTERVAL_MS) return;
  // Claimed up front, deliberately NOT reset by resetTrafficTracking (which
  // fires on every reroute, including this one's own) — this cooldown is
  // meant to survive the very reroute it causes, so a route that still
  // looks bad right after switching doesn't immediately trigger another
  // one. Only startNavigation/endNavigation clear it (a genuinely new trip).
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
    // Clamped to what's actually left on each line before sampling it, not
    // just when slicing it — sampleTrafficAhead's own turf.along calls
    // would otherwise be asked to sample past a short slice's real length
    // (turf.along silently clamps to the line's last point rather than
    // throwing, but that would just repeat-sample the same endpoint).
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

/** Gates and paces TomTom check-ins from onPositionUpdate: only while
 * actually driving with the feature enabled (never planning, walking, or
 * transit — and never at all with the shipped CONFIG.TOMTOM_FEATURES_ENABLED
 * = false default, unless overridden per device via the Settings toggle —
 * see tomtomFeaturesEnabled), at most once both CONFIG.TRAFFIC_CHECK_MIN_INTERVAL_MS
 * and CONFIG.TRAFFIC_CHECK_MIN_DISTANCE_M have elapsed since the last one,
 * and never once under CONFIG.TRAFFIC_STOP_CHECKING_REMAINING_M from the
 * destination. Fire-and-forget, like refreshWeatherBadge — this must never
 * hold up maneuver-advance or deviation checks on the same GPS callback. */
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

// ============================================================================
// Personal flight-tracking overlay (not on main — see
// CONFIG.FLIGHT_TRACKING_ENABLED in config.js and docs/FLIGHT_TRACKING.md).
// Shows nearby aircraft on the map while navigating: an alert above the
// search box when one crosses close to your live position, or every
// aircraft the query returns once you're near a bundled airport. Backed by
// api.adsb.lol via this app's own /api/flights proxy — see
// lib/flights-proxy.js for why a proxy is needed with no secret involved
// (it's purely a CORS relay, adsb.lol needs no API key today).
// ============================================================================

// Loaded once, lazily, the first time the feature is actually turned on —
// no point spending ~650KB of static reference data (airports, aircraft
// types, airline codes; see vendor/) on a session that never touches this
// personal-branch-only feature.
let flightRefData = null;
let flightRefDataPromise = null;
function loadFlightRefData() {
  if (!flightRefDataPromise) {
    flightRefDataPromise = Promise.all([
      fetch('vendor/airports.json').then((r) => r.json()),
      fetch('vendor/aircraft-types.json').then((r) => r.json()),
      fetch('vendor/airline-codes.json').then((r) => r.json()),
    ]).then(([airports, aircraftTypes, airlineCodes]) => {
      flightRefData = { airports, aircraftTypes, airlineCodes };
      return flightRefData;
    }).catch((err) => {
      resolverDebugLog(`Flight tracking: failed to load reference data — ${err.message}`, 'error');
      flightRefDataPromise = null; // let the next check-in try again rather than being stuck failed for the rest of the session
      throw err;
    });
  }
  return flightRefDataPromise;
}

/** Readable "Ryanair 36JX" style label from adsb.lol's raw callsign
 * ('flight' field, space-padded to 8 chars) — splits the 3-letter ICAO
 * airline prefix from the flight-number tail and looks the prefix up in
 * the bundled airline-codes table, falling back to the bare callsign
 * whenever the prefix isn't a known airline (private/GA aircraft mostly
 * fly under their own registration as the callsign, not an airline code). */
function describeCallsign(rawCallsign) {
  const callsign = (rawCallsign || '').trim();
  if (!callsign) return 'Unknown flight';
  const prefix = callsign.slice(0, 3).toUpperCase();
  const airline = flightRefData && flightRefData.airlineCodes[prefix];
  if (!airline) return callsign;
  const tail = callsign.slice(3).trim();
  return tail ? `${airline} ${tail}` : airline;
}

function describeAircraftType(typeCode) {
  if (!typeCode) return null;
  const name = flightRefData && flightRefData.aircraftTypes[typeCode.toUpperCase()];
  return name || typeCode; // unknown code: show the raw code rather than nothing
}

/** Nearest bundled airport within radiusM of lngLat, or null — a plain
 * linear scan over the few-thousand-row bundled list (vendor/airports.json,
 * large/medium commercial airports only), cheap enough to run at the same
 * cadence as the flight poll itself (not every GPS tick). */
function nearestAirportWithin(lngLat, radiusM) {
  if (!flightRefData) return null;
  let nearest = null;
  let nearestDistM = Infinity;
  flightRefData.airports.forEach((airport) => {
    const distM = turf.distance(lngLat, [airport.lon, airport.lat], { units: 'meters' });
    if (distM < nearestDistM) { nearestDistM = distM; nearest = airport; }
  });
  return nearest && nearestDistM <= radiusM ? nearest : null;
}

/** Gates and paces flight check-ins from onPositionUpdate, same shape as
 * maybeCheckTraffic right above: only while actually navigating with the
 * feature toggled on, at most once every CONFIG.FLIGHT_POLL_INTERVAL_MS. */
function maybeCheckFlights(traveledM, lngLat) {
  if (!state.navigating || !state.flightTrackingEnabled || !state.route) return;
  if (state.flightCheckInFlight) return; // previous check-in still in flight — skip this tick rather than pile up requests
  const now = Date.now();
  if (state.flightBackoffUntil != null && now < state.flightBackoffUntil) return; // rate-limited — see applyFlightBackoff
  if (state.lastFlightCheckAt != null && now - state.lastFlightCheckAt < CONFIG.FLIGHT_POLL_INTERVAL_MS) return;
  state.lastFlightCheckAt = now;
  runFlightCheckin(lngLat);
}

/** adsb.lol documents "dynamic rate limiting based on environment load"
 * with no fixed published cap (see docs/FLIGHT_TRACKING.md) — a 429 means
 * back off, not keep polling at the normal cadence into an endpoint
 * that's already throttling. Honors the response's own Retry-After header
 * when present; otherwise doubles from FLIGHT_BACKOFF_BASE_MS up to
 * FLIGHT_BACKOFF_MAX_MS. state.flightBackoffMs is reset to 0 the next time
 * a check-in actually succeeds, so an isolated 429 doesn't leave polling
 * needlessly slow long after the throttling has cleared. */
function applyFlightBackoff(res) {
  const retryAfterS = parseFloat(res.headers.get('retry-after'));
  state.flightBackoffMs = Number.isFinite(retryAfterS) && retryAfterS > 0
    ? retryAfterS * 1000
    : Math.min(state.flightBackoffMs ? state.flightBackoffMs * 2 : CONFIG.FLIGHT_BACKOFF_BASE_MS, CONFIG.FLIGHT_BACKOFF_MAX_MS);
  state.flightBackoffUntil = Date.now() + state.flightBackoffMs;
  resolverDebugLog(`Flight tracking: rate-limited by the data source, backing off ${Math.round(state.flightBackoffMs / 1000)}s.`, 'warn');
}

/** Distance (metres) from `lngLat` to where aircraft `a` will be at ANY
 * point between now and the NEXT scheduled check-in — not just where it is
 * right now. A fast jet (400kt ≈ 3km per 15s poll gap) can cross straight
 * through a radius as small as FLIGHT_OVERHEAD_RADIUS_M well within one
 * poll interval; checking only the instantaneous position could miss it
 * arriving and leaving between two samples entirely. Projects the
 * aircraft's own reported track/ground-speed forward by one poll interval
 * and measures distance to that whole line segment instead of just the
 * current point. Falls back to a plain point distance when track/speed
 * aren't reported (adsb.lol omits them for some contacts) — nothing to
 * project with in that case. */
function aircraftApproachDistM(lngLat, a) {
  const current = [a.lon, a.lat];
  if (typeof a.track !== 'number' || typeof a.gs !== 'number' || a.gs <= 0) {
    return turf.distance(lngLat, current, { units: 'meters' });
  }
  const aheadHours = (CONFIG.FLIGHT_POLL_INTERVAL_MS / 1000) / 3600;
  const aheadKm = a.gs * 1.852 * aheadHours; // gs is knots (nautical miles/hour), the ADS-B convention
  const projected = turf.destination(current, aheadKm, a.track, { units: 'kilometers' }).geometry.coordinates;
  return turf.pointToLineDistance(lngLat, turf.lineString([current, projected]), { units: 'meters' });
}

async function runFlightCheckin(lngLat) {
  state.flightCheckInFlight = true;
  try {
    await loadFlightRefData();
    const nearAirport = nearestAirportWithin(lngLat, CONFIG.FLIGHT_NEAR_AIRPORT_RADIUS_M);
    const radiusNm = nearAirport ? CONFIG.FLIGHT_REGIONAL_QUERY_RADIUS_NM : CONFIG.FLIGHT_QUERY_RADIUS_NM;
    const base = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
    const res = await fetch(`${base}/api/flights?lat=${lngLat[1]}&lon=${lngLat[0]}&radiusNm=${radiusNm}`);
    if (!res.ok) {
      resolverDebugLog(`Flight tracking: /api/flights returned HTTP ${res.status}.`, 'error');
      if (res.status === 429) applyFlightBackoff(res);
      noteFlightCheckinFailure();
      return;
    }
    const body = await res.json();
    // The round trip to adsb.lol itself succeeded the moment the response
    // parses — mark that now, before touching the badge/map layer below.
    // Otherwise an unrelated rendering hiccup in refreshFlightBadge/
    // updateFlightLayer would land in the catch block further down and get
    // miscounted as a DATA-SOURCE failure, which is exactly the wrong
    // signal to warn the user about.
    noteFlightCheckinSuccess();
    state.flightBackoffMs = 0; // a successful check-in clears any earlier 429 backoff
    state.flightBackoffUntil = null;
    // The proxy itself falls back from adsb.lol to adsb.fi on a failure —
    // see lib/flights-proxy.js — so this app never sees most of those
    // failures directly. Logged only on a transition (not every poll while
    // the fallback stays in use), same "don't spam every tick" reasoning
    // as noteFlightCheckinFailure's warn-once threshold above.
    const activeSource = res.headers.get('x-flight-source');
    if (activeSource && activeSource !== state.flightActiveSource) {
      if (state.flightActiveSource != null) {
        resolverDebugLog(`Flight tracking: data source switched to ${activeSource}.`, activeSource === 'adsb.lol' ? 'success' : 'warn');
      }
      state.flightActiveSource = activeSource;
    }
    const aircraft = (Array.isArray(body.ac) ? body.ac : []).filter((a) => (
      typeof a.lat === 'number' && typeof a.lon === 'number'
      // seen_pos: seconds since THIS aircraft's position last actually
      // updated — can lag behind the response's own timestamp, especially
      // for MLAT-derived fixes. A stale one isn't trustworthy for
      // "crossing right now", so it's excluded rather than shown as current.
      && !(typeof a.seen_pos === 'number' && a.seen_pos > CONFIG.FLIGHT_MAX_POSITION_AGE_S)
    ));

    // Deliberately its own try/catch, not covered by the outer one above:
    // by this point the round trip to adsb.lol has already succeeded (see
    // noteFlightCheckinSuccess() above) — a bug in the local overhead/
    // hysteresis math or the map/badge rendering below is a real problem
    // worth logging, but it says nothing about whether the DATA SOURCE is
    // reachable, so it must never feed noteFlightCheckinFailure/trigger the
    // "having trouble reaching the data source" warning.
    try {
      const overhead = [];
      aircraft.forEach((a) => {
        const distM = aircraftApproachDistM(lngLat, a);
        a._distM = distM; // stashed for refreshFlightBadge/updateFlightLayer — local bookkeeping only, never sent anywhere
        const wasOverhead = state.flightOverheadAircraft.some((o) => o.hex === a.hex);
        // Hysteresis: once an aircraft is flagged overhead, it stays
        // flagged until it's past the WIDER clear radius, not just back
        // over the original threshold — stops the badge flickering on/off
        // across consecutive polls for one hovering right at the boundary.
        const radius = wasOverhead ? CONFIG.FLIGHT_OVERHEAD_CLEAR_RADIUS_M : CONFIG.FLIGHT_OVERHEAD_RADIUS_M;
        if (distM <= radius) overhead.push(a);
      });
      state.flightOverheadAircraft = overhead;
      refreshFlightBadge();
      updateFlightLayer(nearAirport ? aircraft : overhead);
    } catch (err) {
      resolverDebugLog(`Flight tracking: rendering the result failed — ${err.message}`, 'error');
    }
  } catch (err) {
    resolverDebugLog(`Flight tracking check-in failed: ${err.message}`, 'error');
    noteFlightCheckinFailure();
  } finally {
    state.flightCheckInFlight = false;
  }
}

/** Warns once per outage, not once per failed poll — a single dropped
 * request every CONFIG.FLIGHT_POLL_INTERVAL_MS is ordinary network noise,
 * not worth a toast; CONFIG.FLIGHT_CHECKIN_FAIL_WARN_THRESHOLD in a row
 * means the feature has actually stopped working, and silence there would
 * just look identical to "nothing nearby" instead of a real failure. */
function noteFlightCheckinFailure() {
  state.flightCheckinFailStreak += 1;
  if (state.flightCheckinFailStreak >= CONFIG.FLIGHT_CHECKIN_FAIL_WARN_THRESHOLD && !state.flightCheckinWarned) {
    state.flightCheckinWarned = true;
    showStatus('Flight tracking: having trouble reaching the data source. Still trying…', 'error');
  }
}
function noteFlightCheckinSuccess() {
  state.flightCheckinFailStreak = 0;
  state.flightCheckinWarned = false; // a NEW outage later warns again
}

/** Single source of truth for the "plane overhead" alert — visible only
 * while state.flightOverheadAircraft is non-empty. Shows the closest one
 * if more than one currently qualifies, plus a "+N more" count rather than
 * silently dropping the others — same "don't drown the user in every
 * possibility, but don't hide that there IS more" spirit as showing one
 * traffic ETA rather than every sampled point. Whatever this sets can be
 * temporarily overwritten by showAircraftDetail (tapping a marker); its own
 * revert timer calls back in here once that detail view's time is up. */
function refreshFlightBadge() {
  const list = state.flightOverheadAircraft;
  if (!list.length) {
    el.flightBadge.classList.add('hidden');
    return;
  }
  const closest = list.reduce((a, b) => (a._distM <= b._distM ? a : b));
  const type = describeAircraftType(closest.t);
  const altText = typeof closest.alt_baro === 'number' ? `, overhead at ${Math.round(closest.alt_baro).toLocaleString()} ft` : '';
  const moreText = list.length > 1 ? ` (+${list.length - 1} more)` : '';
  el.flightBadgeText.textContent = `${describeCallsign(closest.flight)}${type ? ` · ${type}` : ''}${altText}${moreText}`;
  el.flightBadge.classList.remove('hidden');
}

// Tapping an aircraft marker (see map.on('click', 'flight-aircraft-dot', ...)
// in mapLoad.then above) shows its full detail in the very same badge slot
// for a few seconds, rather than a separate popup/card — this feature
// already has one dedicated, always-in-the-same-place surface for aircraft
// info, so reuse it instead of adding a second UI surface for one tap
// interaction. Reverts back to the normal overhead-alert content on its
// own once CONFIG.FLIGHT_DETAIL_DISPLAY_MS elapses.
let flightDetailRevertTimer = null;
/** `props` is a GeoJSON feature's properties object (see updateFlightLayer)
 * — a MapLibre click event only ever hands back properties, never the
 * original JS object runFlightCheckin built them from. */
function showAircraftDetail(props) {
  const type = describeAircraftType(props.t);
  const parts = [describeCallsign(props.flight)];
  if (type) parts.push(type);
  if (props.r) parts.push(`reg ${props.r}`);
  if (typeof props.alt_baro === 'number') parts.push(`${Math.round(props.alt_baro).toLocaleString()} ft`);
  if (typeof props.gs === 'number') parts.push(`${Math.round(props.gs)} kt`);
  if (typeof props.distM === 'number') parts.push(`${formatDistance(props.distM)} away`);
  el.flightBadgeText.textContent = parts.join(' · ');
  el.flightBadge.classList.remove('hidden');
  clearTimeout(flightDetailRevertTimer);
  flightDetailRevertTimer = setTimeout(refreshFlightBadge, CONFIG.FLIGHT_DETAIL_DISPLAY_MS);
}

/** Repaints the flight-aircraft GeoJSON source (see the map.addSource/
 * addLayer calls in mapLoad.then above) from whichever list is currently
 * relevant — every aircraft the query returned in near-airport/regional
 * mode, or just the ones triggering the overhead alert otherwise, so the
 * map doesn't clutter with cruising traffic far from your route when
 * you're nowhere near an airport. Carries enough raw fields in each
 * feature's properties for showAircraftDetail to use on tap. */
function updateFlightLayer(aircraftList) {
  const features = aircraftList
    .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
    .map((a) => ({
      type: 'Feature',
      properties: {
        label: describeCallsign(a.flight),
        flight: a.flight || null,
        t: a.t || null,
        r: a.r || null,
        alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
        gs: typeof a.gs === 'number' ? a.gs : null,
        distM: typeof a._distM === 'number' ? a._distM : null,
      },
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
    }));
  map.getSource('flight-aircraft').setData({ type: 'FeatureCollection', features });
}

/** Resets every piece of check-in bookkeeping and hides the badge/clears
 * the map layer. Called whenever navigation starts/ends, so a stale
 * overhead list, cadence timer, or outage warning from a previous trip
 * never leaks into the next one — same pattern as resetTrafficTracking
 * right above. */
function resetFlightTracking() {
  state.lastFlightCheckAt = null;
  state.flightCheckInFlight = false;
  state.flightOverheadAircraft = [];
  state.flightCheckinFailStreak = 0;
  state.flightCheckinWarned = false;
  state.flightBackoffUntil = null;
  state.flightBackoffMs = 0;
  state.flightActiveSource = null;
  clearTimeout(flightDetailRevertTimer);
  refreshFlightBadge();
  updateFlightLayer([]);
}

if (CONFIG.FLIGHT_TRACKING_ENABLED) {
  el.flightTrackingBtn.classList.remove('hidden');
  el.flightTrackingBtn.addEventListener('click', () => {
    state.flightTrackingEnabled = !state.flightTrackingEnabled;
    el.flightTrackingBtn.classList.toggle('active', state.flightTrackingEnabled);
    el.flightTrackingBtn.setAttribute('aria-label', `Flight tracking: ${state.flightTrackingEnabled ? 'on' : 'off'}`);
    showStatus(`Flight tracking: ${state.flightTrackingEnabled ? 'on' : 'off'}`, 'info');
    if (!state.flightTrackingEnabled) resetFlightTracking();
  });
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
// Word-boundary matching, not a raw substring check — e.g. `s.includes('atm')`
// matched "Katmandu Kitchen" and "Atmiya Institute" (confirmed live), silently
// hijacking a specific-place lookup into an ATM category search near the
// anchor instead, with no fallback to the free-text path since geocodeNear
// only falls through when the tag search comes back genuinely empty.
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

// Matches "<subject> near/close to/around/in <place>" — case-insensitive,
// subject and place both required and non-empty. "in" covers the equally
// natural "EV charging stations in Kakkanad" phrasing, not just "near X" —
// the `\s+...\s+` on both sides means it only matches "in" as its own
// whitespace-delimited word, so it can't misfire on words that merely
// contain "in" (e.g. "parking", "within").
const NEAR_QUERY_PATTERN = /^(.+?)\s+(?:near|close to|around|in)\s+(.+)$/i;

// Matches "<origin> to <destination>" typed into the plain search box —
// e.g. "Milky Way Apartments to Trinity World" — as a directions shortcut.
// Checked separately from, and only after, NEAR_QUERY_PATTERN above:
// "close to" contains the literal substring " to ", so a query like
// "petrol pump close to Marine Drive" would otherwise wrongly split as a
// (nonsensical) "petrol pump close" -> "Marine Drive" trip instead of the
// intended near-search — see setupAutocomplete's onDirectionsShortcut.
const TO_QUERY_PATTERN = /^(.+?)\s+to\s+(.+)$/i;

const GOOGLE_MAPS_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);

/** Pure, no-network parse of a pasted Google Maps URL. `!3d<lat>!4d<lng>`
 * (present on most /maps/place/ links) is the precise place-pin coordinate
 * Google itself resolved the name to — preferred over the `@lat,lng,zoom`
 * segment, which is only ever the map's viewport center at share time (can
 * be off if the sharer had panned before sharing). Falls back to the place
 * name in the path for a short link with no coordinates yet, or a URL that
 * only ever had a name (e.g. a plain `?q=` search link).
 * Returns `null` only when `text` isn't a Google Maps URL at all — once the
 * host matches, always returns an object (`{lat, lon, name?}`, `{name}`, or
 * `{}`), even when nothing could be extracted yet (a bare short link with
 * no name/coordinates in its own URL — resolveGoogleMapsLink's redirect
 * hop is what fills that in), so callers can tell "not a Google Maps
 * link" apart from "is one, nothing to show yet". */
// On-screen trace of the Google Maps link resolver — the only practical way
// to see what actually happened on a phone with no cable/remote-inspector
// attached. resolverDebugReset() clears it at the start of each resolve
// attempt so the panel always shows exactly one run's trace, never a mix of
// several. resolverDebugLog() timestamps each line relative to that reset
// and un-hides the panel, so it appears the moment there's anything to show.
// Off by default: the log includes exact GPS coordinates and place names
// (and, on a failure, a raw snippet of the server's response), which is more
// than a personal address-book app should put on screen unasked — a
// screenshot taken to report an unrelated bug, or someone glancing at the
// phone mid-paste, would otherwise see it every single time. Two ways to
// turn it on, both backed by the same localStorage flag so either sticks
// across reloads: the "Debug mode" toggle in the docs panel's Settings
// section (see below), or ?debug=resolver in the address bar
// (?debug=off turns it back off). console.log stays unconditional either
// way, so a connected remote-debugger session always sees the trace
// regardless of whether the on-screen panel is enabled.
//
// resolverDebugLog() records every line into resolverDebugHistory below
// REGARDLESS of whether Debug mode is on — otherwise turning it on mid-
// session would only start showing whatever logs next, silently missing
// everything that already happened (the moment you'd most want to see:
// something already went wrong before you thought to turn this on).
// setResolverDebugEnabled(true) replays the whole buffered history into the
// panel immediately, so flipping the toggle always shows the full session
// trace from the start, not just new activity from that point on. Capped so
// a long session can't grow this unboundedly.
const RESOLVER_DEBUG_HISTORY_MAX = 1000;
const resolverDebugHistory = []; // { text, kind } entries, oldest first — see resolverDebugLog/setResolverDebugEnabled
const RESOLVER_DEBUG_STORAGE_KEY = 'resolverDebugEnabled';
const debugParam = new URLSearchParams(location.search).get('debug');
if (debugParam === 'resolver') localStorage.setItem(RESOLVER_DEBUG_STORAGE_KEY, '1');
else if (debugParam === 'off') localStorage.removeItem(RESOLVER_DEBUG_STORAGE_KEY);
let resolverDebugEnabled = localStorage.getItem(RESOLVER_DEBUG_STORAGE_KEY) === '1';

/** Single place that turns Debug mode on/off — keeps the Settings section's
 * toggle and the debug panel's own visibility in sync, rather than each
 * call site touching a subset of them separately. Turning off also hides
 * the panel itself — this is a real "stop debug mode" action, not just
 * "hide the panel for now" (see resolverDebugCloseBtn below for that
 * distinction). */
function setResolverDebugEnabled(enabled) {
  resolverDebugEnabled = enabled;
  if (enabled) localStorage.setItem(RESOLVER_DEBUG_STORAGE_KEY, '1');
  else localStorage.removeItem(RESOLVER_DEBUG_STORAGE_KEY);
  if (el.debugModeToggle) {
    el.debugModeToggle.classList.toggle('active', enabled);
    el.debugModeToggle.setAttribute('aria-checked', String(enabled));
  }
  if (enabled) {
    // Replay the full session history immediately (see resolverDebugHistory
    // above) and show the panel right away — turning Debug mode on should
    // never leave you staring at an empty/hidden panel waiting for the next
    // thing to happen to log.
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
setResolverDebugEnabled(resolverDebugEnabled); // paints the toggle's initial state on load

if (el.debugModeToggle) {
  el.debugModeToggle.addEventListener('click', () => setResolverDebugEnabled(!resolverDebugEnabled));
}

// Lets the "Self-hosted Valhalla" Settings toggle override
// CONFIG.USE_SELF_HOSTED_VALHALLA per device without editing config.js —
// handy for flipping it on/off while testing. localStorage wins once set;
// with nothing stored yet, the toggle reflects (and this app instance
// behaves like) whatever config.js shipped with.
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

// Same per-device-override pattern as useSelfHostedValhalla above: lets the
// "TomTom live traffic" Settings toggle override CONFIG.TOMTOM_FEATURES_ENABLED
// without editing config.js. Toggling this on does nothing by itself if this
// deployment never configured a TomTom API key server-side — /api/traffic
// and /api/places just keep returning errors, the same as if the flag were
// still off (see fetchTomTomFlowRatio/tomtomCategorySearchNear).
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

// Captured before the console.* patch further below ever runs, so
// resolverDebugLog's own logging (and the patch itself) can call the real
// console without recursing into itself.
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
/** Appends one already-formatted history entry ({ text, kind } — see
 * resolverDebugLog) to the on-screen panel. Split out so
 * setResolverDebugEnabled can replay the whole buffered history in one
 * pass without duplicating the DOM-building logic. */
function appendResolverDebugLine(entry) {
  const lineEl = document.createElement('div');
  lineEl.className = entry.kind ? `resolver-debug-line ${entry.kind}` : 'resolver-debug-line';
  lineEl.textContent = entry.text;
  el.resolverDebugLogEl.appendChild(lineEl);
}
function resolverDebugLog(message, kind = '') {
  if (resolverDebugStartTs == null) resolverDebugStartTs = Date.now();
  nativeConsole.log('[resolver]', message);
  // Recorded unconditionally, Debug mode on or off — see resolverDebugHistory
  // above for why: otherwise turning it on mid-session would only surface
  // whatever logs next, missing everything that already happened.
  const entry = { text: `[+${Date.now() - resolverDebugStartTs}ms] ${message}`, kind };
  resolverDebugHistory.push(entry);
  if (resolverDebugHistory.length > RESOLVER_DEBUG_HISTORY_MAX) resolverDebugHistory.shift();
  if (!resolverDebugEnabled || !el.resolverDebugLogEl) return;
  appendResolverDebugLine(entry);
  el.resolverDebugLogEl.scrollTop = el.resolverDebugLogEl.scrollHeight;
  // Deliberately NOT pushBackLayer()'d — this panel needs to stay
  // dismissable no matter what else is open (a place card, active
  // navigation, ...). A previous version pushed it onto the shared
  // backStack the first time it opened, but that back-stack is a strict
  // LIFO: selecting a place afterward pushes closePlaceCard ON TOP of it,
  // and starting navigation calls replaceTopBackLayer(navigatingBackGuard)
  // which OVERWRITES it outright — either way the panel's own close
  // button (routed through the shared goBackInApp()) ends up closing
  // something else entirely while the panel itself stayed stuck open
  // (confirmed live: exactly the "gets stuck when a place is selected or
  // navigation is on" symptom). See resolverDebugCloseBtn/resolverDebugEndBtn
  // for the panel's own always-works close controls instead, and
  // initNativeBackButton's wiring below for how the hardware/gesture back
  // button still special-cases this panel without going through
  // backStack.
  el.resolverDebugPanel.classList.remove('hidden');
}
// This panel started out resolver-specific but is the only on-screen trace
// this app has anywhere, so it's the obvious place to also surface an
// otherwise-invisible crash — an uncaught exception or a rejected promise
// nobody awaited (e.g. startNavigation() is called fire-and-forget from its
// button's click handler) normally leaves zero on-screen sign that anything
// went wrong at all, which is exactly what "the button did nothing" reports
// look like. Only actually appends to the on-screen panel when Debug mode
// is on, same as every other resolverDebugLog call — the browser's own
// console always shows uncaught errors regardless, for a connected
// remote-debugger session.
window.addEventListener('error', (e) => {
  resolverDebugLog(`Uncaught error: ${e.message} (${e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : 'unknown location'})`, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const detail = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
  resolverDebugLog(`Unhandled promise rejection: ${detail}`, 'error');
});

/** Makes the on-screen Debug mode panel a genuine general-purpose log
 * capture, not just the resolver/native-shell call sites already
 * instrumented with their own explicit resolverDebugLog() calls — any
 * console.log/warn/error/info anywhere (this app's own code, or a library
 * it loads, e.g. MapLibre) now also lands on screen. This is practically
 * the only way to see what happened on a real Android device, where
 * devtools isn't reachable. Every patched method still calls straight
 * through to the real console first via nativeConsole — this only ADDS a
 * second destination, a connected remote-debugger session or a desktop
 * browser's own devtools keep working exactly as before. */
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

if (el.resolverDebugCloseBtn) {
  // Direct hide, not goBackInApp() — this panel isn't on the shared
  // backStack (see the comment in resolverDebugLog for why), so it needs
  // its own always-works close action instead of relying on the general
  // back-press pipeline. Only hides the panel for now; Debug mode itself
  // stays on and will reopen it on the next log line — use the "End"
  // button next to it to actually turn Debug mode off instead.
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

function parseGoogleMapsUrl(text) {
  const trimmed = text.trim();
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a bare URL by itself — Google Maps' own "Share" action (and most
    // other apps) share a place name and link together as one blob of text
    // ("Cafe UUTOPIA ft. Toddy\nhttps://maps.app.goo.gl/...") rather than a
    // clean URL on its own, so look for a URL anywhere inside the string
    // before giving up. The rest of this function still matches !3d/!4d and
    // @lat,lng against the whole original blob below, which is fine — those
    // are numeric URL-only patterns a place name won't coincidentally contain.
    const embedded = trimmed.match(/https?:\/\/\S+/);
    if (!embedded) return null;
    try {
      url = new URL(embedded[0]);
    } catch {
      return null;
    }
  }
  if (!GOOGLE_MAPS_HOSTS.has(url.hostname) || (url.hostname !== 'maps.app.goo.gl' && !url.pathname.includes('/maps'))) return null;
  // The isolated URL itself — not the surrounding blob — is what a caller
  // needs to hand to /api/resolve-maps-url for a short link; the raw text
  // (e.g. "Cafe UUTOPIA ft. Toddy\nhttps://maps.app.goo.gl/...") isn't a
  // valid URL on its own and would just get rejected as a bad request.
  const matchedUrl = url.toString();

  const nameMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : (url.searchParams.get('q') || null);

  const preciseMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (preciseMatch) return { lat: parseFloat(preciseMatch[1]), lon: parseFloat(preciseMatch[2]), name, matchedUrl };

  const centerMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  if (centerMatch) return { lat: parseFloat(centerMatch[1]), lon: parseFloat(centerMatch[2]), name, matchedUrl };

  return name ? { name, matchedUrl } : { matchedUrl };
}

/** Resolves a pasted Google Maps link (any format: a long place/coordinate
 * URL, or a maps.app.goo.gl/goo.gl short link) to `{label, lat, lon,
 * sourceUrl}`, or `null` if `text` isn't a Google Maps link at all — in
 * which case the caller should fall through to a normal search unchanged.
 * A short link has no coordinates in the URL itself, so it needs one
 * server-side hop (see functions/api/resolve-maps-url.js) to follow the
 * redirect — a browser can't read a cross-origin redirect's target itself. */
// Set right before a failed resolveGoogleMapsLink call returns null, so a
// caller can show something more specific than a generic "couldn't
// resolve" — and so a real failure (network/timeout/server error) is
// distinguishable at a glance from "genuinely not a resolvable link",
// without needing to attach a remote debugger to see what actually
// happened. Cleared at the start of every call.
/** Resolves to `{ label, lat, lon, sourceUrl }` on success, or `{ error }`
 * on failure (never a bare `null`) — the error lives on the returned value
 * itself rather than a shared module variable, so two resolveGoogleMapsLink
 * calls running concurrently (e.g. the Android share-target path and a
 * search-box paste happening at the same time) can never read back a
 * message that actually belongs to the other call. `resolved.lat != null`
 * is the reliable success check; a failure object never has a `lat`. */
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
      // Relative on the web — always correct there regardless of what
      // domain a self-hoster deploys to, same-origin, no CORS to worry
      // about. Only the Android shell needs the absolute override: its own
      // origin is a local asset-serving scheme with no backend of its own
      // (see CONFIG.RESOLVE_MAPS_URL_BASE's own comment for the exact
      // failure this fixes), so ignoring the config value here on a plain
      // web deployment means it can never accidentally break someone
      // else's self-hosted instance via a cross-origin/CORS mismatch.
      const resolveBase = isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : '';
      const res = await fetchWithTimeout(`${resolveBase}/api/resolve-maps-url?url=${encodeURIComponent(parsed.matchedUrl)}`);
      const contentType = res.headers.get('content-type') || '';
      resolverDebugLog(`Response: HTTP ${res.status}, content-type "${contentType || '(none)'}"`);
      // A non-JSON body here (even on a 200) is never something this app's
      // own worker code returns — it means something in front of it
      // (a Cloudflare security challenge/interstitial, a carrier's
      // transparent proxy injecting a block page, etc.) swapped in its own
      // response. Surfacing a snippet of that body turns "network error"
      // into an actual lead instead of a guess, without needing a remote
      // debugger attached to the phone that's failing.
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

  // sourceUrl is always the isolated Google Maps URL (parsed.matchedUrl),
  // never the raw shared/pasted text — that text can be a whole blob
  // ("Cafe UUTOPIA ft. Toddy\nhttps://maps.app.goo.gl/..."), and sourceUrl
  // ends up as a favorite's note, rendered directly as a link href.
  if (parsed.lat != null) {
    resolverDebugLog(`Done: resolved to ${parsed.lat}, ${parsed.lon}${parsed.name ? ` ("${parsed.name}")` : ''}`, 'success');
    return { label: parsed.name || 'Pinned location', lat: parsed.lat, lon: parsed.lon, sourceUrl: parsed.matchedUrl };
  }
  if (parsed.name) {
    // Places with no formal street address (a sea wall, an unnamed junction,
    // a plot of land) get a name that leads with a Plus Code — Google's own
    // open, offline-decodable encoding of the approximate location — instead
    // of a resolvable address, e.g. "R72F+2J Chellanam Sea Wall, Chellanam,
    // Kerala 682008". Decoding it directly recovers the actual pin instead
    // of falling back to a same-named search that OSM has no chance of
    // matching (that's the whole reason this feature exists — the place
    // isn't in OSM's data at all). Needs an approximate reference point to
    // anchor the code (a short code like this one is only unambiguous within
    // ~1 degree), which the locality text right after the code supplies.
    const plusCodeMatch = parsed.name.match(/^([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7})(?:[\s,]+(.*))?$/i);
    // Dynamically imported: this ~28KB module is only ever needed for this
    // rare no-street-address case, so a place name that doesn't even look
    // like it might start with a Plus Code never pays for fetching/parsing
    // it at all — let alone the common case of a name that isn't a Google
    // Maps link in the first place.
    const olc = plusCodeMatch ? new (await import('./vendor/open-location-code.js')).OpenLocationCode() : null;
    // The regex above only checks character-set/shape; it can't tell a real
    // Plus Code apart from a coincidentally similar-looking token (a
    // shop/gate/serial code built from the same restricted alphabet plus a
    // literal '+'). olc.isValid()/isShort() enforce the actual Open Location
    // Code rules (separator parity/position, code-length constraints) that
    // the regex doesn't fully replicate — still not a guarantee the string
    // IS a Plus Code, but it rejects shapes the format itself disallows
    // rather than trusting the regex's looser approximation of it.
    if (plusCodeMatch && olc.isValid(plusCodeMatch[1].toUpperCase()) && olc.isShort(plusCodeMatch[1].toUpperCase())) {
      const plusCode = plusCodeMatch[1].toUpperCase();
      const remainder = (plusCodeMatch[2] || '').trim();
      // Prefer the text after the first comma (locality/state/pincode) over
      // the full remainder, which usually leads with a landmark name Nominatim
      // has no chance of geocoding either — the locality alone is plenty
      // precise enough to anchor a short code.
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
      // Nominatim also drew a blank — nothing more to try.
    }
  }
  resolverDebugLog('Giving up.', 'error');
  return { error: resolveError || "couldn't find coordinates for that link" };
}

/** Every place resolved from a pasted Google Maps link is, by definition,
 * one OSM/Nominatim couldn't find on its own — bookmark it into "To add to
 * OSM" automatically, no save-star tap required, so nothing found this way
 * is ever lost. Fire-and-forget: a failed save shouldn't block using the
 * resolved place for search/directions, and there's no UI waiting on this. */
async function autoBookmarkGoogleMapsLink({ label, lat, lon, sourceUrl }) {
  try {
    const listId = await getOrCreateNamedListId('To add to OSM');
    // Re-pasting/re-resolving the same place (or two different link variants
    // that land on the same pin) shouldn't pile up duplicate entries — a
    // coordinate match is what "the same place" actually means here, not
    // exact link text, since a short link and its resolved long link are
    // different strings for the same spot.
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

// Sentinel label for a place resolved from live GPS rather than a search —
// shared by geocodeNear's "near me" case right below, useCurrentLocationFor,
// and the recent-trips reuse path (resolvePlaceForReuse), so all three
// recognize the same string consistently.
const CURRENT_LOCATION_LABEL = 'Your location';
const NEAR_ME_KEYWORDS = new Set(['me', 'my location', 'here', 'current location']);

/** One-shot GPS fetch used as the anchor for a "X near me" query — rejects
 * (rather than resolving null) on failure so the caller's existing
 * "could not find X to search near" error path handles it uniformly with
 * a genuine geocoding failure. */
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

/** "EV charging near Gateway of India" (or "EV charging in Kochi") → geocode
 * the place first as the anchor, then search "EV charging" around that
 * anchor. "EV charging near me"/"...near here" is the one case that should
 * mean the device's own location instead of a geocoded place — Nominatim
 * obviously can't resolve the literal word "me" to anywhere real, so that
 * case is special-cased to a live GPS fix before falling through to the
 * normal anchor-geocoding path for everything else. */
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
  // Fall back to a bounded free-text search. Confirmed via testing this is
  // markedly less reliable than the tag-based search (natural-language
  // "petrol pump near X" phrasing alone returns zero results from
  // Nominatim), but bounding a plain-text query to the anchor's area is
  // still better than an unconstrained search that could return anywhere.
  return nominatimSearch(subject, viewboxParam(anchor.lat, anchor.lon, CONFIG.GEOCODE_NEAR_RADIUS_DEG_WIDE));
}

/** Nominatim matches words/prefixes, not spelling — a single mistyped letter
 * (e.g. "Koramangla" for "Koramangala") reliably comes back with zero
 * results even though the place exists. Generates a small, prioritized set
 * of single-edit variants to retry when the real query draws a blank:
 * adjacent-letter transpositions first (the single most common real-world
 * typo, e.g. "Koramnagala"), then single-character deletions (catches an
 * accidental doubled letter, e.g. "Koramaangala"). Deliberately does NOT
 * attempt substitutions or insertions — those would require trying up to 26
 * candidate letters at every position, which turns one extra lookup into
 * dozens against a rate-limited public server for comparatively rare cases.
 * (A missing letter, e.g. "milky" typed as "milk"/"miky", needs an
 * insertion to fix and isn't covered here — see wordDropCandidates below
 * for why that's handled differently instead of extending this list.) */
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

/** A second, unrelated failure mode from a misspelling: the query is
 * *truncated*, not misspelled — "Milky Way Apart" for "Milky Way
 * Apartments" — because the user stopped typing early or dropped a word
 * expecting autocomplete to fill the rest in. No character-level edit
 * fixes this (it's not a fixed-size edit away from the real name), and it
 * needs a different query, not a variant of the same one. Progressively
 * drops whole trailing words — "milky way apart" -> "milky way" -> "milky"
 * — since dropping down to a complete, correctly-spelled PREFIX of the
 * real name is exactly what turns a dead-end query into one Nominatim can
 * match. Stops at single words, and skips anything left too short to
 * search meaningfully. */
function wordDropCandidates(query) {
  const words = query.trim().split(/\s+/);
  const candidates = [];
  for (let dropCount = 1; dropCount < words.length; dropCount++) {
    const candidate = words.slice(0, words.length - dropCount).join(' ');
    if (candidate.length >= 3) candidates.push(candidate);
  }
  return candidates;
}

/** Classic edit-distance DP — used only to rank already-fetched results by
 * how close they are to what was actually typed (see rankBySimilarity),
 * never to generate new candidates itself (that's what typoVariants/
 * wordDropCandidates are for), so its O(n*m) cost only ever runs against a
 * handful of short place names, not in a hot loop. */
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

/** How well a candidate result matches what was actually typed, from 0 (no
 * resemblance) to 1 (identical). Deliberately compares the query against a
 * same-length PREFIX of the result's own primary name, not the whole
 * thing — a truncated query ("milky way apart" for "Milky Way Apartments")
 * or a short typo'd word ("milk" for "milky") is naturally "close to" the
 * START of the real name, and comparing against the FULL name (much longer
 * than the query) would rack up edit-distance for all the trailing text
 * the query never had a chance to match in the first place, scoring a
 * perfectly good match as if it were a poor one. */
function similarityScore(query, label) {
  const q = query.trim().toLowerCase();
  const primary = splitPlaceLabel(label).primary.toLowerCase();
  const prefix = primary.slice(0, q.length);
  const distance = levenshteinDistance(q, prefix);
  return 1 - distance / Math.max(q.length, prefix.length, 1);
}

/** A broadened/truncated fallback query answers a *different* question than
 * the one the user actually asked — "what matches 'milky way'" instead of
 * "milky way apart" — so Nominatim's own ranking of the results it returns
 * reflects the shorter query, not what was really typed. Re-sorting by
 * similarity to the ORIGINAL text (see similarityScore) fixes that. */
function rankBySimilarity(results, originalQuery) {
  return [...results].sort((a, b) => similarityScore(originalQuery, b.label) - similarityScore(originalQuery, a.label));
}

// Bounds how many extra Nominatim calls a single zero-result search can
// trigger while trying fallback candidates — each one still goes through
// nominatimLimiter like any other request, so this only adds latency to the
// already-rare "genuinely found nothing" case, never extra request bursts.
// Sized to cover the full run of adjacent-transpositions for a typical place
// name (most are well under 13 letters, i.e. up to 12 transpositions) plus a
// few deletions and word-drops on top — confirmed via testing that a lower
// cap (5) cut the search off before reaching the transposition that
// actually fixed a real typo ("Whitefeild" needs the swap at position 6,
// the 7th variant tried).
const TYPO_FALLBACK_MAX_ATTEMPTS = 12;

// A candidate scoring at or above this is treated as confident enough to
// stop searching immediately (saves requests/time in the common case of a
// single obvious fix). Below it, every candidate within the attempt budget
// is still tried and the single best-scoring one across all of them wins —
// otherwise a broadened word-drop candidate that happens to match *some*
// unrelated place (e.g. "milk" alone, for the query "milk way") would
// wrongly win by just being the first candidate to return anything, before
// a much better character-edit candidate ("milky way") ever got a chance.
const GOOD_ENOUGH_SIMILARITY = 0.75;

/** Only called when the user's actual (debounced, non-stale) query drew a
 * blank. Tries wordDropCandidates() (cheap — at most a few attempts, one
 * per word, and the most likely real-world case: a query that stopped
 * short of the full name) and typoVariants() of the full query (character-
 * level edits — the transposed/doubled-letter/missing-trailing-letter
 * case) together, scoring every candidate that returns anything and
 * keeping the single best match across all of them (see
 * GOOD_ENOUGH_SIMILARITY for why this can't just take the first hit).
 * The winning candidate's results are re-ranked by similarity to the
 * original query before being tagged with `.correctedQuery` — a broadened
 * candidate can return several plausible results, and Nominatim's own
 * ranking reflects the candidate it was actually asked for, not the fuller
 * text the user actually typed. Too-short queries are skipped entirely —
 * edits/drops on 1-2 leftover letters are more likely to misfire than help.
 *
 * `shouldAbort`, if given, is checked before every attempt and stops the
 * loop immediately once it returns true. Without this, a fallback chain
 * kicked off by an intermediate substring during a mid-word typing pause
 * (see setupAutocomplete) would run its full up-to-12-request course through
 * the shared rate limiter even after the user has kept typing and made that
 * search irrelevant — queuing up behind it and delaying the search the user
 * actually cares about. Returns `aborted: true` in that case so the caller
 * knows NOT to cache the (incomplete, therefore meaningless) empty result. */
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

/** `opts.shouldAbort` and `opts.onFallbackStart` are optional and only
 * meaningful for the live-typed autocomplete path (setupAutocomplete passes
 * both). `shouldAbort` lets an in-progress typo-fallback chain for a
 * since-superseded query give up early instead of running to completion
 * behind the user's back. `onFallbackStart` fires once, right before the
 * first fallback request goes out, so the UI can swap its "Searching…"
 * indicator for something that explains the extra wait (trying similar
 * spellings can take several seconds, since it's a chain of individually
 * rate-limited requests, not one fast lookup). Other callers (there are
 * none currently, but keep this in mind before adding one) simply never
 * abort and never get a fallback-start notification. */
async function geocodeSearch(query, opts = {}) {
  const trimmed = query.trim();
  const cacheKey = trimmed.toLowerCase();
  const nearMatch = trimmed.match(NEAR_QUERY_PATTERN);
  // A GPS-anchored "near me"/"near here" query resolves against wherever the
  // device currently is — caching it by literal text alone (like every other
  // query) would serve today's results to the exact same phrase typed again
  // from a completely different location. "Near <a fixed place>" doesn't
  // have this problem (the place always resolves to the same anchor), so it
  // stays cached as normal.
  const isNearMe = !!nearMatch && NEAR_ME_KEYWORDS.has(nearMatch[2].trim().toLowerCase());
  if (!isNearMe && nominatimCache.has(cacheKey)) return nominatimCache.get(cacheKey);

  let results = nearMatch
    ? await geocodeNear(nearMatch[1].trim(), nearMatch[2].trim())
    : await nominatimSearch(trimmed);

  // Fuzzy fallback only applies to a plain place-name search — a "near X"
  // query already does its own two-step anchor lookup with its own error
  // message, and layering fuzzy retries onto both halves of that would be a
  // lot of extra requests for a much rarer case.
  let aborted = false;
  if (!results.length && !nearMatch) {
    if (opts.onFallbackStart) opts.onFallbackStart();
    ({ results, aborted } = await geocodeFuzzyFallback(trimmed, opts.shouldAbort));
  }

  // Don't cache an aborted attempt — it stopped early because it became
  // irrelevant, not because Nominatim was actually asked and came up empty.
  // Caching it as [] here would let a later, real search for this exact
  // string be wrongly answered from cache instead of actually trying.
  if (!aborted && !isNearMe) nominatimCache.set(cacheKey, results);
  return results;
}

/** "Home" or "Work" typed as a query resolves straight from the saved quick
 * place (see armQuickPlacePick/setQuickPlace above) instead of being sent to
 * Nominatim, which obviously has no place literally named "Home" or "Work".
 * This is the one place every text-entry path funnels through — the plain
 * search box, the split from/to fields, and each half of an "X to Y"
 * shortcut all call this instead of geocodeSearch directly, so the keyword
 * works consistently everywhere rather than needing to be wired in per
 * call site. Falls through to a normal geocodeSearch for anything else,
 * including when the keyword is typed but nothing's been saved for it yet. */
async function resolveTextOrQuickPlace(text, opts) {
  const keyword = text.trim().toLowerCase();
  if (keyword === 'home' || keyword === 'work') {
    const saved = await getQuickPlace(keyword).catch(() => null);
    if (saved) return [{ label: saved.label, lat: saved.lat, lon: saved.lon }];
  }
  // Same GPS keyword set geocodeNear already recognizes for "X near me" —
  // extending it here means typing/pasting "me"/"my location" into any
  // plain text-entry field (not just the near-search shortcut) resolves to
  // a live GPS fix instead of being sent to Nominatim as literal free text,
  // where no place is ever actually named "my location".
  if (NEAR_ME_KEYWORDS.has(keyword)) {
    return [await resolveCurrentLocationAnchor()]; // throws its own message on failure — same as a genuine geocoding failure
  }
  return geocodeSearch(text, opts);
}

/** Shared by every suggestions/quick-picks dropdown (the plain search box,
 * from/to fields, and every per-stop field) — none of these used to
 * participate in the back-stack at all, so if one was the only thing open,
 * a back press (hardware, gesture, or browser) skipped straight past it
 * and exited/left the app instead of just closing the dropdown, the same
 * "back should undo one visible step at a time" bug already fixed for
 * every actual panel/modal in this app. Tracks its own pushed closeFn on
 * the element itself (`_backLayerCloseFn`) so hideSuggestionList can
 * correctly forgetBackLayerIfTop() it — needed since a plain
 * `pushBackLayer(() => hideSuggestionList(listEl))` would create a fresh,
 * unreferenceable closure every call. */
function showSuggestionList(listEl) {
  if (listEl.classList.contains('hidden')) {
    const closeFn = () => hideSuggestionList(listEl);
    listEl._backLayerCloseFn = closeFn;
    pushBackLayer(closeFn);
  }
  listEl.classList.remove('hidden');
}
function hideSuggestionList(listEl) {
  if (!listEl.classList.contains('hidden') && listEl._backLayerCloseFn) {
    forgetBackLayerIfTop(listEl._backLayerCloseFn);
    listEl._backLayerCloseFn = null;
  }
  listEl.classList.add('hidden');
  listEl.innerHTML = '';
}

/** Shown the moment a search actually fires, so there's visible feedback
 * while Nominatim's match is in flight (typically a couple hundred ms,
 * longer on a self-hosted instance under load, or for a "near X" search
 * which needs two sequential requests — see geocodeNear() — or for the
 * typo-fallback retries below, which can take several seconds since each
 * retry is its own rate-limited request). `text` lets a caller update what
 * this says mid-search instead of leaving a generic "Searching…" up the
 * whole time — see setupAutocomplete's onFallbackStart. */
function showSuggestionLoading(listEl, text = 'Searching…') {
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'loading';
  li.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(text)}</span>`;
  listEl.appendChild(li);
  showSuggestionList(listEl);
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

    // Save-to-favorites star — stopPropagation so tapping it opens the
    // "which list?" prompt without also picking the result as the field's
    // value. See openSaveToListPrompt.
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
    const svBtn = streetViewButton(r.lat, r.lon); // null when Mapillary isn't configured
    if (svBtn) li.appendChild(svBtn);
    li.appendChild(saveBtn);
    listEl.appendChild(li);
  });
  showSuggestionList(listEl);
}

/** `opts.onDirectionsShortcut(fromText, toText, isStale)`, if given, is
 * checked first on every debounce firing — only setupAutocomplete(el.
 * placeInput, ...) passes this, since "X to Y" as a directions shortcut
 * only makes sense typed into the plain single search box, not into a
 * from/to/stop field that's already dedicated to one side of a trip. When
 * it matches and the hook is provided, the normal geocode search for the
 * whole string is skipped entirely — the hook owns showing its own
 * loading/error state either way. */
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
      // A response only answers what the user is currently asking if BOTH
      // still hold once it arrives: no newer keystroke has fired its own
      // search (mySeq === seq), AND the field's live value hasn't moved on
      // from the exact string this request searched for. The seq check
      // alone misses a real case: a mid-word pause (type "Whitefi", pause,
      // then continue to "Whitefield") fires a genuine search for the
      // incomplete "Whitefi", which can legitimately return zero results
      // even though the word the user is still typing exists. If they then
      // keep typing without a further 400ms pause, no NEW debounce fires
      // (so mySeq stays current) while that stale "no results" response is
      // still in flight — the seq guard alone lets it render. Re-checking
      // the live input value at render time catches this.
      const isStale = () => mySeq !== seq || inputEl.value.trim() !== query;

      // A pasted Google Maps link should never fall through to the near/to
      // shortcut regexes below or a wasted Nominatim typo-fallback cascade
      // against what is, to Nominatim, just garbage text.
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
          showStatus(`Couldn't resolve that Google Maps link — ${resolved.error}.`, 'error');
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
          // Only the live-typed field needs this — it's what makes the
          // several-second fallback chain legible instead of looking like
          // the search has silently hung.
          onFallbackStart: () => {
            if (!isStale()) showSuggestionLoading(listEl, `No direct match for "${query}" — refining the search…`);
          },
        });
        if (isStale()) return;
        // Set by geocodeFuzzyFallback() when the query itself drew a blank
        // and a broadened or corrected variant found something instead —
        // tell the user what was actually searched rather than silently
        // swapping it.
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

  // A stop row's own input/suggestions elements are captured in this
  // closure — for the place/from/to fields (which live for the whole app
  // session) that's harmless, but addStopRow() can call setupAutocomplete()
  // repeatedly across a session (add stop, remove it, add another, up to
  // CONFIG.MAX_STOPS times and unboundedly over the session), and a plain
  // permanent document-level listener here would leak one more of these
  // (plus the entire detached DOM subtree it closes over) every single time
  // a stop row is removed. Returning a teardown function lets the caller
  // that actually owns the row's lifecycle (addStopRow's remove handler)
  // clean this up when the row goes away.
  const outsideClickHandler = (e) => {
    if (e.target !== inputEl && !listEl.contains(e.target)) hideSuggestionList(listEl);
  };
  document.addEventListener('click', outsideClickHandler);
  return () => document.removeEventListener('click', outsideClickHandler);
}

/** Renders the EV charging details card below the main place card — only
 * ever populated for a result that came from Open Charge Map (see
 * fetchNearbyChargingStations/normalizeChargingStation); a plain OSM pick
 * has no `evDetails` at all, so this just hides the block. The status line
 * is always framed with recency (see formatRelativeAge) — never as a bare
 * status word — because Open Charge Map's own status field is community-
 * maintained and often stale (see CONFIG.OPENCHARGEMAP_ENABLED); showing
 * it without an age would read as far more current/trustworthy than it is. */
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

/** The full-screen "View full details" page opened from #ev-details-card —
 * shows everything normalizeChargingStation captured from Open Charge Map
 * for the current station (state.to), not just the short summary the
 * inline card above has room for: every connector (not only the first),
 * operator phone, address, and access/general comments. */
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
  // A quick-place (Home/Work) is being set — divert this pick away from the
  // normal "route to it" flow entirely, since the intent here was only to
  // save a location, not plan a trip right now. See armQuickPlacePick.
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

/** "Milky Way Apartments to Trinity World" typed into the plain search box
 * (see TO_QUERY_PATTERN) — geocodes both sides (each through the same
 * geocodeSearch() any other search uses, so "near X"/typo-tolerance/etc.
 * apply to both halves too) and jumps straight into a planned route,
 * rather than making you fill in two separate directions fields for
 * something you already typed as one sentence. Only ever the top result
 * on each side is used, matching how geocodeNear's own anchor lookup
 * already works — no disambiguation UI for either half.
 *
 * If either side can't be found (or the lookup fails outright), that field
 * is just left blank in the directions form instead of aborting the whole
 * thing — the side that WAS found still gets filled in, so there's less
 * left to redo by hand, and a status message says which part needs fixing.
 * The route is only auto-planned when both sides resolved.
 *
 * `isStale` (from setupAutocomplete) is threaded through both lookups and
 * re-checked after each: if the user edits the query mid-lookup, an
 * in-flight fallback chain for the old text aborts instead of wasting
 * requests, and a response that arrives after the fact is simply
 * discarded. */
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
    // Not found and "couldn't even check" are treated the same here —
    // either way this side is left blank rather than aborting the whole
    // shortcut over what the OTHER side might still resolve fine.
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
  // A side that resolved to live GPS gets a clearer label than the raw
  // "me"/"my location" the user typed — same sentinel useCurrentLocationFor
  // already relabels a single field to, just phrased for this combined
  // "X to Y" context instead of standing alone in one field.
  const fromDisplay = fromResults[0]?.label === CURRENT_LOCATION_LABEL ? 'My current GPS location' : fromText;
  const toDisplay = toResults[0]?.label === CURRENT_LOCATION_LABEL ? 'My current GPS location' : toText;
  el.placeInput.value = (fromResults.length || toResults.length) ? `${fromDisplay} to ${toDisplay}` : '';
  // Start from a clean slate rather than relying on goToDirections' own
  // "only touch state.from/to if given a truthy value" behaviour, which
  // would otherwise leave a stale value from an unrelated earlier search
  // sitting in whichever side didn't resolve this time.
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

// [data-category], not the broader .chip — #open-now-chip is a filter
// TOGGLE, not a search trigger, and gets its own listener below instead.
el.categoryChips.querySelectorAll('.chip[data-category]').forEach((btn) => {
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
      const results = applyOpenNowFilter(decorateWithDistance(rawResults, center.lat, center.lng));
      // Picking any one result clears the rest of the candidate markers —
      // once you've chosen, the other options aren't relevant anymore.
      const onPick = (r) => { clearPoiMarkers(); selectPlace(r); };
      showPoiMarkers(results, onPick);
      const emptyMessage = state.filterOpenNow
        ? `No ${label.toLowerCase()} found nearby that are open now. Try turning off "Open now".`
        : `No ${label.toLowerCase()} found nearby. Try panning the map or zooming out.`;
      renderSuggestionResults(el.placeSuggestions, el.placeInput, results, onPick, emptyMessage);
    } catch (err) {
      hideSuggestionList(el.placeSuggestions);
      showStatus(err.message, 'error');
    }
  });
});

if (el.openNowChip) {
  el.openNowChip.addEventListener('click', () => {
    state.filterOpenNow = !state.filterOpenNow;
    el.openNowChip.classList.toggle('active', state.filterOpenNow);
    el.openNowChip.setAttribute('aria-pressed', String(state.filterOpenNow));
    // Affects the NEXT category/along-route search, not results already on
    // screen — simplest behavior, and matches the natural "set the filter,
    // then tap a category" order this row already reads left-to-right in.
    showStatus(`"Open now" filter: ${state.filterOpenNow ? 'on' : 'off'}`, 'info');
  });
}

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
  // Tapping "Add stop" first leaves an empty row waiting to be filled — the
  // whole point of putting these category chips right under it. Without
  // this check, picking one always appended a brand-new row instead,
  // leaving that empty one behind permanently (it's invisible to getStops(),
  // so it wouldn't break routing, but it never goes away on its own and
  // silently eats into CONFIG.MAX_STOPS).
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
    // Mid-drive (picked from the "ahead" search), route from where you
    // actually are, through only the stops not yet visited — exactly like
    // triggerReroute's off-route recalculation. Otherwise (still planning),
    // route from the origin through every stop, as usual.
    const isMidDrive = state.navigating && state.lastFix;
    const fromPoint = isMidDrive ? { lat: state.lastFix.lat, lon: state.lastFix.lng } : state.from;
    // Mid-drive: slice the CURRENT route's own stops list (state.route.stops
    // — see renderRoute), not the original getStops(), since currentLegIndex
    // is relative to whichever subset built the route that's active right
    // now (itself possibly already reduced by an earlier reroute). addStopRow
    // above already appended `picked` as the new last stop in the DOM, so it
    // has to be added back on after slicing rather than read via getStops().
    const stops = isMidDrive ? [...state.route.stops.slice(state.currentLegIndex), picked] : getStops();
    if (!isMidDrive) state.currentLegIndex = 0; // mid-drive: left alone, the next GPS fix recomputes it against the new route
    const { trip } = await requestRoute(fromPoint, state.to, stops, 0, COSTING_BY_MODE[state.travelMode], { avoidTolls: state.avoidTolls, avoidHighways: state.avoidHighways }); // no alternates — adding a stop already commits you to a specific trip
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
  const bottomOffset = window.innerHeight - btnRect.top + 10;
  el.routeChips.style.bottom = `${bottomOffset}px`;
  // A vertical list can be tall enough to run past the top of a short
  // phone screen — cap its height to whatever space is actually left above
  // it (minus a small margin), with a floor so it doesn't collapse to
  // nothing on the shortest screens; the popover scrolls internally (see
  // .route-chips-popover overflow-y) if even that isn't enough room for
  // all 8 categories.
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

/** Shows/hides the along-route search FAB + its floating popover — reachable
 * only once navigation has actually started (see #route-chips-inline for the
 * pre-navigation equivalent). If the popover happens to be open when the
 * feature is hidden out from under it (e.g. "End" while it's open), close it
 * too rather than leaving an orphaned open popover with an invisible trigger
 * button. */
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

/** Shows/hides the live-effort FAB — same show/hide precedent as
 * showRouteSearchFeature/hideRouteSearchFeature above, but walk mode only
 * (there's no live-climb story worth reporting while driving). */
function showEffortFeature() {
  if (state.travelMode !== 'walk') return;
  el.effortBtn.classList.remove('hidden');
  updateEffortBtnLabel();
}
function hideEffortFeature() {
  el.effortBtn.classList.add('hidden');
}

/** Low/Moderate/High read on how hard the walk has been so far — pace
 * (current speed vs. a nominal brisk-walk baseline) combined with grade-
 * adjusted climbing (ascent-per-km covered so far), rather than distance/
 * time alone: a flat 3km stroll and a hilly 3km climb aren't the same
 * effort. Deliberately qualitative, not calories — the app has no user-
 * profile concept to source a body weight from, and a rough Low/Moderate/
 * High read doesn't need one. The per-km ascent bands match
 * elevationDifficultyLabel/checkSteepRouteAdvisory's own thresholds, so
 * all three describe "how hilly" this trip is consistently. */
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

/** Shows/hides the inline "search along the route" chip row under the
 * from/to fields — the pre-navigation equivalent of the FAB+popover above.
 * Visible from a successful drive plan until "Start navigation" is tapped
 * (or the route is canceled/replaced with a transit plan). */
function showRouteChipsInline() {
  el.routeChipsInline.classList.remove('hidden');
}
function hideRouteChipsInline() {
  el.routeChipsInline.classList.add('hidden');
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
    // Slice state.route.stops (the reference frame currentLegIndex is
    // actually relative to), not getStops() — see renderRoute's comment.
    waypoints: [currentPoint, ...state.route.stops.slice(state.currentLegIndex), state.to],
  };
}

/** Shared by both chip rows (the floating popover and the inline row) —
 * they show the same 8 categories with identical search-along-the-route
 * behaviour, just in different containers. `isPopover` is the only thing
 * that differs: the popover needs closing before its results take over the
 * bottom sheet, the inline row has nothing to close. */
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
        );
      } catch (err) {
        hideSuggestionList(el.poiResultsList);
        showStatus(err.message, 'error');
      }
    });
  });
}
wireRouteChipButtons(el.routeChips, { isPopover: true });
wireRouteChipButtons(el.routeChipsInline, { isPopover: false });

/** Switches the search card between the single-search view and the from/to
 * directions editor. Shared by the "Directions" button, the back arrow, and
 * tapping a favorite/recent entry, so there's one place that
 * knows which sibling elements need to hide/show together. Doesn't touch the
 * back-stack itself — callers decide whether entering directions is a new
 * layer (pushBackLayer) or just a mode flip within a layer already tracked
 * some other way (see cancelPlannedRoute, which calls this directly). */
function setPlanningUiMode(mode) {
  const isSimple = mode === 'simple';
  el.searchSimple.classList.toggle('hidden', !isSimple);
  el.searchDirections.classList.toggle('hidden', isSimple);
  if (!isSimple) {
    el.placeCard.classList.add('hidden');
    refreshWeatherBadge(); // place card just went away outside the normal hidePlaceCard() path — re-evaluate so a stale badge doesn't linger
  }
}

/** Jumps straight into directions mode with the given origin/destination
 * already filled in and ready to route — used by favorites and recent trips,
 * where the intent is clearly "take me here now" rather than "look this up". */
function shortLabel(place) {
  return place ? splitPlaceLabel(place.label).primary : '';
}

/** One-line summary shown instead of the full from/to/stops editor once a
 * route is planned and the bottom sheet is expanded (see
 * syncDirectionsCollapse below) — "Walking from X to Y" / "Driving from X
 * to Y via Z, W". Empty string if there's nothing to summarize yet. */
function buildRouteSummarySentence() {
  if (!state.from || !state.to) return '';
  const verb = { drive: 'Driving', walk: 'Walking', transit: 'Taking transit' }[state.travelMode] || 'Route';
  let sentence = `${verb} from ${shortLabel(state.from)} to ${shortLabel(state.to)}`;
  const stops = getStops();
  if (stops.length) sentence += ` via ${stops.map((s) => shortLabel(s)).join(', ')}`;
  return sentence;
}

/** Keeps the search card and the bottom sheet from both fighting over the
 * same screen space: once a route exists and the bottom sheet is expanded
 * (full maneuver list, elevation chart, along-route POI results, etc.), the
 * search card collapses to one tappable summary line instead — tapping it
 * collapses the bottom sheet back down, which (via the observer below)
 * brings the full editor back in response. Driven by a MutationObserver on
 * #bottom-sheet's own class list rather than threading a call through every
 * place that toggles .expanded (there are a dozen, and more may show up
 * later) — whatever changes it, this reacts. */
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
  // Entering directions mode by any path (a favorite, a recent trip, the
  // "X to Y" shortcut) means a Home/Work pick-in-progress is no longer what
  // the user is doing — cancel it rather than leaving it armed to silently
  // hijack whatever place gets selected next.
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
// Favorites & recent trips
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
      onSelect: async () => {
        listEl.classList.add('hidden');
        // A saved "Your location" side is a frozen GPS snapshot from
        // whenever the trip was first planned — re-resolve it to where you
        // actually are now rather than silently replaying stale coordinates.
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

/** Focus handler shared by the search box and the from/to fields: shown only
 * when the field is genuinely empty, so it can never clobber an existing
 * pick or interrupt someone mid-search. `locationOptionSide` ('from' | 'to'
 * | 'search' | null) controls whether a "Use my current location" row is
 * prepended, and which side it applies to when tapped — see
 * useCurrentLocationFor. */
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

/** Fetches a fresh GPS fix into `inputEl`, then hands the resulting place to
 * `apply` — shared by the from-field/to-field directions quick picks and
 * the main search box's own "Use my current location" quick pick (see
 * useCurrentLocationFor below). getCurrentPosition() is what actually
 * triggers the browser/OS location-permission prompt the first time it's
 * called — nothing extra needed here to ask for it. */
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

/** `side` is 'from'/'to' (a directions field — see showQuickPicksFor's
 * locationOptionSide) or 'search' (the plain single search box): pins your
 * current GPS location as the picked place, exactly like tapping any other
 * search result would, instead of filling in a directions field. */
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

/** Recent trips whose origin/destination was "Your location" at save time
 * store a frozen snapshot of GPS coordinates from that moment (there's no
 * live position tracking outside active navigation — see native-location.js
 * — so a plain literal snapshot is all there ever was to save). Reusing the
 * trip re-resolves that side to a fresh fix instead of silently replaying
 * wherever the user happened to be last time. Never rejects: a GPS failure
 * (denied permission, timeout) falls back to the stored snapshot rather
 * than blocking the recent trip from being reused at all. */
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
  // A second finger landing mid-hold (e.g. a pinch-zoom starting after the
  // first finger was already down) fires touchmove continuously, so this is
  // the reliable place to catch it even when startLongPress only ever saw
  // the first touch point.
  if (isTouch && e.originalEvent.touches.length > 1) { cancelLongPress(); return; }
  const dx = e.point.x - longPressStartPoint.x;
  const dy = e.point.y - longPressStartPoint.y;
  if (Math.hypot(dx, dy) > 10) cancelLongPress(); // a real drag/pan, not a held tap
}

/** A long press looks up what's at that point, then hands it straight to
 * usePinnedPlace — which decides what to actually do with it depending on
 * whatever's already in the from/to fields (see there for the exact rules).
 * Drops a marker as a "this is the point you pinned" visual cue either way,
 * clearing itself after a while rather than needing an explicit dismiss. */
async function handleLongPress(lngLat) {
  showStatus('Looking up this location…', 'info', { sticky: true });
  let label = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  try {
    const res = await fetchWithTimeout(`${CONFIG.NOMINATIM_URL}/reverse?format=jsonv2&lat=${lngLat.lat}&lon=${lngLat.lng}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) label = data.display_name;
    }
  } catch (err) {
    // Offline or unreachable: fall back to the raw coordinates label already set above.
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

/** What a dropped pin actually does depends on what's already in the
 * from/to fields — two cases, each matching the one obviously useful thing
 * to do with a place you just pointed at on the map:
 *   - neither set: it's your first pick, so treat it exactly like picking a
 *     plain search result (shows the place card, "Get directions" etc.).
 *   - one or both already set: set it as the destination — the most common
 *     "I just found where I actually need to go" case, with no prompt to
 *     dismiss first. Overwrites an existing destination on purpose. */
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
// Saved places — a real, browsable "Saved" screen (opened via the bookmark
// icon in the search bar) organized into renameable lists, Google-Maps-style.
// Every "save to favorites" entry point in the app (the star on a search
// result, the star on the place card, and the long-press-on-map prompt
// above) funnels through openSaveToListPrompt so saving always means
// "saving to a specific list", not just a flat undifferentiated pile.
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

// ---- "Which list?" prompt: shared by every save action and by moving an
// existing favorite to a different list from the Saved screen. ------------

let saveToListConfirm = null;
let saveToListSelectedId = null;

/** Opens the list-picker for saving/moving `placeLabel`. `preselectedListId`
 * is highlighted first (a favorite's current list when moving it; null when
 * saving something new, which falls back to the first/default list).
 * `onConfirm(listId)` runs only if Save is tapped, never on Cancel. */
async function openSaveToListPrompt(placeLabel, preselectedListId, onConfirm) {
  // The save-star that opens this lives inside a still-open suggestions
  // dropdown — tidy it away so it's not sitting underneath the prompt.
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
  goBackInApp(); // closes the prompt; none of the confirm callbacks below push a back-layer of their own
  if (confirmFn && listId != null) confirmFn(listId);
});

// ---- Create/rename-list prompt: reused for both (the title and prefilled
// value are set by the caller depending on which). -------------------------

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

// ---- The Saved screen itself: an overview of every list, and a per-list
// detail view with rename/delete for the list and move/delete per place. --

let openSavedListId = null; // which list the detail view is currently showing, if any

/** Sets the app up to save the *next* place picked from search as Home or
 * Work, instead of routing to it — see the interception at the top of
 * selectPlace(). Closes the Saved screen and hands focus to the plain
 * search box, same "go do the search now" flow as any other search entry
 * point. */
function armQuickPlacePick(kind) {
  state.pendingQuickPlaceKind = kind;
  closeSavedPanelEntirely();
  showStatus(`Search for ${kind === 'home' ? 'home' : 'your workplace'}, then pick a result to set it.`, 'info', { timeoutMs: 6000 });
  el.placeInput.focus();
  // This mode has no UI of its own beyond the status toast above, but it's
  // real, invisible state that silently hijacks the next place picked from
  // search (see selectPlace) — without a back-stack entry, a back press
  // here fell straight through to whatever's next (or exited/left the app)
  // with zero way to back out of it, and no visible sign it was even still
  // armed.
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
    // A note is currently only ever the original Google Maps link a place
    // was resolved from (see resolveGoogleMapsLink/placeCardSaveBtn) — kept
    // as a direct jump-back for later cross-referencing while adding this
    // place to OSM.
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
/** The detail view's own back-layer close callback: stepping back from a
 * list always lands on the overview, never fully closes the Saved screen
 * (see #saved-close-btn below for that). Refreshes the overview's per-list
 * counts since favorites may have moved/been deleted while inside. */
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
/** Closes the whole Saved screen as a side effect of picking a place to
 * route to, regardless of whether the detail view is open on top of the
 * overview — same two-layers-at-once teardown pattern as
 * hideRouteSearchFeature/closeRouteChipsPopover elsewhere in this file. */
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
  // Always exits the whole screen in one tap, even from inside a list's
  // detail view — same behaviour as Google Maps' Saved screen close button.
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
// Help & documentation — a static, always-available "what does this app do
// and who built the pieces it's made of" screen. Content lives directly in
// index.html as native <details>/<summary> accordion rows (expand in place,
// no intra-panel screens), so there's nothing to render here. Same
// single-level panel pattern as Offline (see el.offlineBtn above):
// pushBackLayer on open, goBackInApp closes it.
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
  // A place resolved from a pasted Google Maps link is, by definition, one
  // OSM/Nominatim didn't have — default it into a dedicated list with the
  // original link kept as a note, so it's easy to come back and add to OSM
  // later. Anything picked the normal way still just goes to the first list.
  const preselectedListId = sourceUrl ? await getOrCreateNamedListId('To add to OSM').catch(() => null) : null;
  openSaveToListPrompt(splitPlaceLabel(label).primary, preselectedListId, async (listId) => {
    try {
      // Same de-dup this file already does for autoBookmarkGoogleMapsLink,
      // just missing here — this button had no existence check at all, so
      // re-tapping Save (easy to do by accident, and there's no "already
      // saved" indicator on the star to discourage it) created a new,
      // byte-identical favorite every time (confirmed live).
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
  el.planBtn.classList.remove('hidden'); // source/destination just swapped — any route already shown is now stale
});

/** Removes every stop row (and its marker) — used whenever a fresh
 * directions request starts (a new search, favorite, or recent trip), so
 * stops from a previous trip don't linger onto an unrelated one. */
function clearStops() {
  // Each row's own teardown (normally released via its remove button, see
  // addStopRow) must also run here — a raw innerHTML='' discards the rows
  // without ever calling it, permanently leaking setupAutocomplete's
  // document-level click listener (and the closed-over, now-detached row)
  // once per stop that ever existed. This is the far more common path in
  // practice — picking a favorite/recent trip, the "X to Y" shortcut, a
  // shared route link, and the place card's Directions button all clear
  // stops this way, not just the per-row ✕ button — so this was a real,
  // easily-triggered, unbounded leak in a PWA people keep open all day.
  el.stopsContainer.querySelectorAll('.stop-unit').forEach((unit) => {
    if (unit._teardownAutocomplete) unit._teardownAutocomplete();
  });
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

  const teardownAutocomplete = setupAutocomplete(input, suggestions, (picked) => {
    input._stopPlace = picked || null;
    updatePlanningMarkers();
  });
  // Stored directly on the row so clearStops() (a totally separate code
  // path from this row's own remove button) can also release it — see the
  // comment there for why that matters.
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
// Only used when USE_SELF_HOSTED_VALHALLA is on — separate from
// valhallaLimiter because a self-hosted instance typically has no shared
// fair-use policy to respect, so it's tuned independently (see config.js).
const selfHostedValhallaLimiter = createLimiter(CONFIG.SELF_HOSTED_VALHALLA_MIN_INTERVAL_MS);

/** Picks which Valhalla instance a request should use, and enforces that
 * instance's rate limiter before returning. A no-op to VALHALLA_URL (today's
 * exact behaviour) whenever USE_SELF_HOSTED_VALHALLA is off. `points` is any
 * array of {lat, lon}-shaped objects; ALL of them must fall inside
 * SELF_HOSTED_VALHALLA_COVERAGE_BBOX for the self-hosted server to be tried,
 * since Valhalla can't route one trip across two separate graphs — a
 * request with even one waypoint outside the self-hosted graph's coverage
 * has no route data for that waypoint at all, so the whole request goes to
 * VALHALLA_URL instead.
 *
 * When self-hosted routing IS attempted, this deliberately returns this
 * deployment's own /api/valhalla-* proxy path rather than a real hostname —
 * the self-hosted server's actual address is a Cloudflare secret
 * (SELF_HOSTED_VALHALLA_URL) the client is never told, see
 * lib/valhalla-proxy.js. `selfHosted: true` tells fetchValhalla to treat a
 * 501 response (nothing configured on this deployment) as a signal to fall
 * back to VALHALLA_URL, instead of surfacing it as a real error. */
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

/** POSTs `body` to Valhalla's `action` endpoint (`route` or `height`),
 * through valhallaTarget's self-hosted/public choice. When the self-hosted
 * proxy comes back 501 (SELF_HOSTED_VALHALLA_URL not set on this
 * deployment), transparently retries against the public server instead of
 * surfacing an error — mirrors fetchNearbyChargingStations' handling of
 * Open Charge Map's missing-key case. Any OTHER failure from an actually
 * self-hosted request (unreachable, timeout, non-501 error) is NOT
 * retried — that's a real problem worth surfacing, not silently masking
 * (confirmed live: a self-hosted instance that's simply down should fail
 * outright, not quietly fall back). */
/** Returns `{ res, selfHosted }` — `selfHosted` reflects where `res` itself
 * actually came from (false again after the 501-fallback below reassigns
 * `res` to the public server), so a caller that needs to know whether it's
 * looking at a self-hosted answer (see fetchElevationProfile's degenerate-
 * elevation retry) doesn't have to re-derive it. */
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
    if (!selfHosted) throw err;
    resolverDebugLog(`Valhalla: could not reach the self-hosted routing proxy (${err.message || err}).`, 'error');
    throw err;
  }
  if (selfHosted && res.status === 501) {
    resolverDebugLog('Valhalla: self-hosted routing is on but SELF_HOSTED_VALHALLA_URL is not set on this deployment — falling back to the public server.', 'warn');
    await valhallaLimiter();
    res = await doFetch(`${CONFIG.VALHALLA_URL}/${action}`);
    selfHosted = false;
  } else if (selfHosted) {
    resolverDebugLog(res.ok ? `Valhalla: routed via the self-hosted server for ${points.length} waypoint(s).` : `Valhalla: self-hosted server returned HTTP ${res.status}.`, res.ok ? 'success' : 'error');
  }
  return { res, selfHosted };
}

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

// Session-only cache keyed by the rounded waypoint list: re-planning the
// exact same trip — tapping "Get directions" twice, or going back into
// directions and re-submitting the same origin/destination/stops — returns
// instantly with no network call. Rounding to ~1m precision means it still hits on
// float-noise-identical coordinates without accidentally caching two
// genuinely different nearby points as "the same" request. Live-position
// reroutes are never cache hits (the coordinates are different every time by
// design), so this only ever saves the redundant-resubmit case, not real trips.
const valhallaCache = new Map();
// Every reroute (live-position waypoints, different every time by design)
// still WRITES a new entry here even though it can never HIT one — over a
// long drive with several reroutes, or a session with many different trips
// planned, this grew without bound for the life of the tab. A plain
// insertion-order FIFO cap is enough here (no need for real LRU): this
// cache only ever saves the redundant-exact-resubmit case, not a
// meaningfully-reused working set worth optimizing eviction order for.
const VALHALLA_CACHE_MAX_ENTRIES = 50;
function capValhallaCache() {
  while (valhallaCache.size > VALHALLA_CACHE_MAX_ENTRIES) {
    valhallaCache.delete(valhallaCache.keys().next().value);
  }
}
function routeCacheKey(from, to, stops, wantAlternates, costing, avoidTolls, avoidHighways) {
  return JSON.stringify([costing, wantAlternates, !!avoidTolls, !!avoidHighways, ...[from, ...stops, to].map((p) => [p.lat.toFixed(5), p.lon.toFixed(5)])]);
}

// Maps state.travelMode to Valhalla's costing model name. Adding a Bicycle
// mode later would just mean one more entry here plus a mode-btn in HTML —
// verified 'bicycle' costing also works against the configured Valhalla server.
const COSTING_BY_MODE = { drive: 'auto', walk: 'pedestrian' };

/** Only 'auto' has use_ferry/use_highways/toll_booth_penalty knobs to tune;
 * pedestrian costing doesn't accept costing_options.pedestrian the same way
 * (verified against the live server), so costing_options is omitted
 * entirely for it — avoidTolls/avoidHighways are silently ignored there.
 * Both avoid knobs are soft penalties, not hard exclusions (same nature as
 * the always-on use_ferry: 0): use_highways near 0 discourages but doesn't
 * guarantee avoiding highways, and toll_booth_penalty at its max (43200s /
 * 12h) strongly discourages tolls without an absolute guarantee either. */
function costingOptionsFor(costing, { avoidTolls, avoidHighways } = {}) {
  if (costing !== 'auto') return undefined;
  return {
    auto: {
      use_ferry: 0,
      ...(avoidHighways ? { use_highways: 0 } : {}),
      ...(avoidTolls ? { toll_booth_penalty: 43200 } : {}),
    },
  };
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
async function requestRoute(from, to, stops = [], wantAlternates = 0, costing = 'auto', avoidOpts = {}) {
  // A congestion-specific detour (avoidOpts.excludePolygon — see
  // estimateDetourRoute) is a one-off tied to wherever traffic happened to
  // be jammed right now; the cache key otherwise ignores it entirely, so
  // serving/storing it here could hand a later, differently-congested
  // request the wrong detour back. Bypass the cache in both directions
  // instead of trying to fold a whole polygon into the key.
  const cacheKey = routeCacheKey(from, to, stops, wantAlternates, costing, avoidOpts.avoidTolls, avoidOpts.avoidHighways);
  const useCache = !avoidOpts.excludePolygon;
  if (useCache && valhallaCache.has(cacheKey)) return valhallaCache.get(cacheKey);

  const waypoints = [from, ...stops, to];
  const body = {
    // heading/heading_tolerance pass through when a location carries them
    // (see triggerReroute) — Valhalla uses this to snap to the road edge
    // facing the direction of travel; without it, a moving vehicle's
    // reroute origin can snap to the wrong-facing edge and Valhalla's first
    // maneuver becomes a U-turn just to correct that, not a real turn.
    locations: waypoints.map((p) => (
      p.heading != null ? { lat: p.lat, lon: p.lon, heading: p.heading, heading_tolerance: p.heading_tolerance } : { lat: p.lat, lon: p.lon }
    )),
    costing,
    units: 'kilometers',
  };
  // Ferries are essentially never wanted for ordinary driving in India. This
  // is a soft penalty, not a hard exclusion, so it won't fix every bad case
  // (a destination with literally no drivable road access in the map data
  // can still resolve to a — possibly longer — ferry route; see
  // checkRoutePlausibility below for catching that instead).
  const costingOptions = costingOptionsFor(costing, avoidOpts);
  if (costingOptions) body.costing_options = costingOptions;
  if (wantAlternates > 0) body.alternates = wantAlternates;
  // A single ring of [lon, lat] pairs (see buildExcludePolygon) — Valhalla
  // drops any edge intersecting it from the graph for this request only,
  // which is the only way to force a path through roads it would otherwise
  // never consider (its own alternates are traffic-blind, see
  // filterMeaningfulAlternates).
  if (avoidOpts.excludePolygon) body.exclude_polygons = [avoidOpts.excludePolygon];
  let res;
  try {
    // text/plain, not application/json: Valhalla parses the body as JSON
    // regardless of the declared content-type (confirmed live), but
    // application/json is NOT one of the three CORS-safelisted content
    // types (text/plain, application/x-www-form-urlencoded,
    // multipart/form-data) — a browser sends a CORS preflight (OPTIONS)
    // for anything else. valhalla_service's own built-in HTTP server
    // doesn't implement OPTIONS at all (confirmed live: HTTP 405), so a
    // self-hosted instance with no reverse proxy in front (nginx, which
    // is what actually makes the public demo server's CORS work) fails
    // outright with a bare "Failed to fetch" the moment this is called
    // cross-origin — same-origin deployments never notice since a
    // preflight is only needed for cross-origin requests in the first
    // place. text/plain sidesteps the problem entirely, for every
    // deployment, not just self-hosted ones. (fetchValhalla applies this
    // uniformly, including to the /api/valhalla-route proxy hop.)
    ({ res } = await fetchValhalla('route', waypoints, body));
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'The routing service is taking too long to respond. Try again in a moment.'
      : 'Could not reach the routing service. Check your connection or the Valhalla server address.');
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
  if (useCache) {
    valhallaCache.set(cacheKey, result);
    capValhallaCache();
  }
  return result;
}

// ============================================================================
// Elevation profile (walk mode only) — Valhalla's /route doesn't return
// elevation, so this is a second, separate call to its /height action after
// a walking route is already planned and drawn. Never blocks route
// planning: the route is fully usable the moment renderRoute finishes, and
// this quietly populates the chart if/when it resolves, or just leaves it
// hidden on any failure — a missing chart is never worth interrupting a
// walking trip over.
// ============================================================================

/** Evenly downsamples a route's [lng,lat] coords to at most maxPoints, so a
 * long walking route doesn't send an oversized /height request body. */
function sampleCoordsForHeight(coords, maxPoints) {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const sampled = [];
  for (let i = 0; i < maxPoints; i++) sampled.push(coords[Math.round(i * step)]);
  return sampled;
}

/** True when every height in `rangeHeight` is identical — the shape a
 * Valhalla server takes when it has no elevation data loaded at all (it
 * doesn't error on /height, it just returns a flat repeated value for
 * every point, indistinguishable at the response level from a route that
 * genuinely is flat). Only meaningful as a signal on a self-hosted
 * answer — see fetchElevationProfile. */
function isDegenerateElevation(rangeHeight) {
  const first = rangeHeight[0][1];
  return rangeHeight.every((p) => p[1] === first);
}

/** Returns Valhalla's range_height pairs: [[cumulativeDistM, heightM], ...].
 * Goes through the same server-selection/rate-limiting as /route (see
 * valhallaTarget) since it hits the same server. Throws on any failure —
 * callers must treat that as "no chart", never a user-facing error.
 *
 * A self-hosted Valhalla whose tiles were built without ever running
 * valhalla_build_elevation against downloaded DEM data (a separate,
 * easy-to-skip step from just building the routing graph) doesn't error on
 * /height — it silently returns a flat value for every point regardless of
 * the real terrain. Confirmed live against a real route with ~30m of
 * elevation change: routing came back correct from the self-hosted server,
 * but its elevation was flat while the exact same coordinates against the
 * public server showed the real profile. So when a self-hosted answer
 * looks degenerate, this quietly retries elevation ONLY against the public
 * server (routing itself stays wherever it already was) rather than
 * showing a misleadingly flat chart for a route that isn't. */
async function fetchElevationProfile(coords) {
  const shape = sampleCoordsForHeight(coords, CONFIG.ELEVATION_MAX_POINTS).map(([lon, lat]) => ({ lat, lon }));
  const { res, selfHosted } = await fetchValhalla('height', shape, { range: true, shape });
  if (!res.ok) throw new Error(`Elevation service returned HTTP ${res.status}.`);
  const data = await res.json();
  if (!data.range_height || !data.range_height.length) throw new Error('No elevation data returned.');
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
    } catch (_) { /* keep the self-hosted (flat) result below rather than losing the chart entirely */ }
  }
  return data.range_height;
}

/** Classic Ramer–Douglas–Peucker polyline simplification: recursively keeps
 * only the point that deviates most from the straight line between the two
 * ends, as long as that deviation exceeds `tolerance`, discarding the rest.
 * Used to reduce ~150 raw elevation samples down to the handful of points
 * where the profile's shape actually changes, for the tappable
 * "significant point" markers — an ordinary local-min/max scan would catch
 * every tiny GPS/DEM wiggle instead of just the real hills. */
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

/** Picks the interior points (excludes the very start/end — those aren't
 * interesting as map-highlight targets) where the chart's shape actually
 * changes, capped to a small count so it doesn't get cluttered with dots.
 * Widens the tolerance a few times if the first pass still returns too
 * many — a noisy near-flat route can otherwise produce a dot at every
 * little wiggle. `pixelPoints` are {x, y, i} in the chart's own 300×64
 * coordinate space (see buildElevationChart) — simplifying in that space
 * (rather than raw distance/height, which have wildly different scales)
 * means "significant" matches what a viewer would actually see as a bend
 * in the line. */
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

/** Quadratic-bezier "midpoint smoothing": using the midpoint of each pair of
 * consecutive points as the curve's anchor, and the shared point between
 * them as the control point, gives a continuously-smooth curve that still
 * tracks the original polyline closely — without pulling in a spline
 * library for one chart. */
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
 * chart's own box) rather than raw viewBox units, since the dot buttons and
 * the guideline are plain positioned HTML, not part of the SVG itself —
 * the SVG's non-uniform preserveAspectRatio="none" scaling (needed so the
 * chart fills the sheet's width at a fixed height) distorts anything drawn
 * inside its viewBox, confirmed earlier with an attempt at SVG <text>
 * labels that came out badly stretched on a wide phone screen. */
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
  // Pre-select the highest point by default — usually the most interesting
  // one, and matches how this looks the moment the chart first appears.
  const defaultActive = points.length ? points.reduce((best, p) => (p.heightM > best.heightM ? p : best), points[0]) : null;

  return { svgHtml, points, defaultActive, totalDist };
}

/** A plain-language read on how hilly the route is, so the chart's shape
 * isn't the only way to tell — meant for someone who's never seen an
 * elevation profile before and just wants to know "will this be a hard
 * walk?" without interpreting a line graph. Thresholds are rough per-km
 * ascent bands, not a rigorous grade calculation. */
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

/** Walks state.route's actual line geometry by distance to find where a
 * tapped chart point really is, and drops/moves a marker there — turf.along
 * on the full-resolution route line means this lands correctly regardless
 * of how heavily the elevation samples themselves were downsampled for the
 * /height request. */
function highlightElevationPointOnMap(distM) {
  if (!state.route || !state.route.lineFeature) return;
  const clamped = Math.min(Math.max(distM, 0), state.route.totalDistM);
  const point = turf.along(state.route.lineFeature, clamped / 1000, { units: 'kilometers' });
  const [lng, lat] = point.geometry.coordinates;
  if (state.elevationHighlightMarker) {
    state.elevationHighlightMarker.setLngLat([lng, lat]);
  } else {
    // setLngLat before addTo, matching every other marker in this file —
    // confirmed live that addTo-then-setLngLat leaves the marker stuck at
    // its (0,0) default position instead of moving to the real coordinate.
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

  // Evenly spaced distance ticks, skipping 0 itself (that's just "Start",
  // not informative) — formatDistance already picks m vs km appropriately.
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
  // This whole chart is built after the route (and the peek height measured
  // for it) already rendered — fetchElevationProfile is a separate, slower
  // network round trip that starts once renderRoute is otherwise done (see
  // updateElevationProfileForRoute). Without re-measuring here, the peek
  // state's max-height stays exactly what it was before this content ever
  // existed, clipping it off entirely (confirmed live: the chart's own
  // title/ascent-descent line was cut off, and the sheet's own overflow:
  // hidden meant there was no way to scroll to see it short of dragging the
  // whole sheet up).
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
  updateSheetPeekHeight(); // shrink the peek state back down now that this content is gone — see renderElevationProfile's comment for why this pairing matters
}

/** {ascentM, descentM} from a rangeHeight array ([[cumulativeDistM, heightM], ...],
 * see fetchElevationProfile) — extracted so the chart, the steep-route
 * advisory, route-option badges, and the trip-summary panel all report the
 * exact same numbers instead of four subtly different reimplementations. */
function computeAscentDescent(rangeHeight) {
  let ascentM = 0;
  let descentM = 0;
  for (let i = 1; i < rangeHeight.length; i++) {
    const diff = rangeHeight[i][1] - rangeHeight[i - 1][1];
    if (diff > 0) ascentM += diff; else descentM += -diff;
  }
  return { ascentM, descentM };
}

/** Merges consecutive rangeHeight samples into runs of sustained climb/
 * descent — {startDistM, endDistM, netHeightM, avgGradePct} — for the voice
 * incline announcements (checkInclineAnnouncement) below. Deliberately
 * separate from the chart's own findSignificantPointIndices/Douglas-Peucker
 * simplification (buildElevationChart): that one simplifies in a distorted
 * 300x64 pixel space purely to find what looks like a "bend" on screen;
 * this one works in real distance/height units to find genuine sustained
 * grade, a different question with a different answer. A run only breaks
 * on an actual direction reversal (small flat wobbles don't end it), and
 * anything shorter than CONFIG.INCLINE_MIN_SEGMENT_M or with negligible net
 * height is dropped — GPS/DEM noise over a couple of samples isn't a real
 * hill worth announcing. */
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
      // A run ends the moment its direction actually changes — including
      // into or out of flat (dir 0), not just up<->down. Confirmed live as
      // a real bug in an earlier version of this function that only ended
      // a run on an up<->down reversal: a real, sustained climb followed
      // by a long flat stretch never triggered a reversal at all, so the
      // whole route (climb + everything flat after it) got folded into one
      // "run", diluting a genuine ~9% grade down to under 2% averaged over
      // the entire trip — well under INCLINE_GRADE_MODERATE_PCT, so the
      // real hill was silently never announced at all.
      flush(i - 1);
      segStart = i - 1;
      segDir = dir;
    }
  }
  flush(rangeHeight.length - 1);
  return segments;
}

/** Fire-and-forget: kicks off /height for the currently-rendered route and
 * populates the chart if/when it resolves. Captures state.route by
 * reference so a stale response (route replaced/canceled while this was in
 * flight) is silently discarded rather than overwriting a newer route's
 * chart or reviving a canceled one's — buildRouteState always returns a
 * fresh object, never mutates in place, so this reference check is reliable. */
function updateElevationProfileForRoute() {
  if (state.travelMode !== 'walk' || !state.route) { hideElevationProfile(); return; }
  const myRoute = state.route;
  fetchElevationProfile(myRoute.coords)
    .then((rangeHeight) => {
      if (state.route !== myRoute || state.travelMode !== 'walk') return; // stale — route changed/canceled meanwhile
      // Persisted on the route itself (rather than just passed into
      // renderElevationProfile as a local) so live navigation — voice
      // incline announcements, the live effort score, the trip-summary
      // panel — can all look this back up long after the chart's own
      // closures over it would otherwise have gone out of scope.
      myRoute.rangeHeight = rangeHeight;
      myRoute.gradeSegments = deriveGradeSegments(rangeHeight);
      Object.assign(myRoute, computeAscentDescent(rangeHeight));
      renderElevationProfile(rangeHeight);
      // Only while still planning — once navigating (e.g. after a mid-walk
      // reroute, which also calls this), there's no realistic way to act on
      // "consider a different route" advice anyway, and it'd just be noise
      // on top of live turn-by-turn guidance.
      if (!state.navigating) checkSteepRouteAdvisory(myRoute.ascentM, myRoute.totalDistM);
    })
    .catch(() => {
      if (state.route === myRoute) hideElevationProfile(); // degrade gracefully — the walking route itself is already fully usable
    });
}

/** Sibling to checkRoutePlausibility, but for elevation rather than routing
 * oddities — this can only run once /height resolves, slightly after the
 * route itself already rendered (ascent isn't known synchronously), so it
 * fires from here rather than alongside the plausibility check. Purely
 * informational, so it never overrides a plausibility warning (a genuine
 * ferry/absurd-detour issue) that might already be showing — just whatever
 * showStatus call happens to land last wins, same as elsewhere in this app. */
function checkSteepRouteAdvisory(ascentM, totalDistM) {
  if (!totalDistM) return;
  const ascentPerKm = ascentM / (totalDistM / 1000);
  // Same threshold elevationDifficultyLabel already uses for its own
  // "Steep in parts" tag, so this advisory's language and the chart's
  // language agree with each other.
  if (ascentPerKm < 20) return;
  showStatus(
    `This route climbs about ${formatDistance(ascentM)} over ${formatDistance(totalDistM)} — steeper than a casual walk. `
    + 'Check the elevation chart below, or see if another route option climbs less.',
    'info',
  );
}

// Route options vs. live in-navigation traffic (see fetchTomTomFlowRatio/
// sampleTrafficAhead above) use different sampling: comparing alternates
// before committing cares about the WHOLE route, not just what's
// immediately ahead, so every sample here contributes (weighted by the
// slice of the route it covers — see weightedTrafficTimeS), rather than
// only the near-term ones mattering most.
const routeTrafficTimeCache = new WeakMap(); // trip object -> resolved { trafficTimeS, samples } — trip objects in state.routeOptions are stable across a reselect (see selectRouteOption), so switching which card is active never re-fetches the same option's traffic twice

// Coarser than TRAFFIC_SAMPLE_POINTS's live-navigation density — this can
// run once per alternate every time route options render (each replan, not
// just every TRAFFIC_CHECK_MIN_INTERVAL_MS/_DISTANCE_M during an active
// drive), so it stays modest to avoid burning through TomTom's free tier
// on route planning alone.
function routeTrafficSampleCount(totalDistM) {
  if (totalDistM < 10000) return 3;
  if (totalDistM < 30000) return 5;
  return 8;
}

/** Segment-weighted total trip time under current traffic — each sample
 * "owns" the same distance slice used elsewhere for this route (half a
 * sample-gap either side, see findWorstCongestedSpan/
 * paintRouteOptionsTrafficOverlay): that slice's share of Valhalla's
 * traffic-blind time, divided by that slice's own ratio, summed across all
 * slices. Deliberately NOT a flat average ratio applied to the whole
 * trip's time — that would let one bad/good sample skew stretches it
 * doesn't actually cover (a 2km jam inflating the estimate for an entire
 * 40km highway trip, say). Any distance no valid sample covers (filtered
 * out for low confidence, or a failed request) keeps its base time
 * unadjusted — no ratio to apply, so no adjustment rather than a guess. */
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

/** Traffic-adjusted total time for a route option — used by
 * refreshRouteOptionsTraffic to compare alternates against each other
 * before committing to one, and by maybeAddTrafficDetourOption to find
 * where along the route it's actually congested. `samples` (each `{ lon,
 * lat, d, ratio }`, `d` = distance in metres from the route start) is
 * every sample that succeeded, in route order — always `[]` when
 * `trafficTimeS` is null. Returns `{ trafficTimeS: null, samples: [] }` if
 * TomTom is off, the trip has no usable length, or every sample failed/was
 * filtered out for low confidence (see fetchTomTomFlowRatio) — callers
 * fall back to Valhalla's own (traffic-blind) time estimate in that case,
 * same as before this existed. */
async function estimateRouteTrafficTime(trip) {
  if (routeTrafficTimeCache.has(trip)) return routeTrafficTimeCache.get(trip);
  const totalDistM = trip.summary && trip.summary.length ? trip.summary.length * 1000 : 0;
  const empty = { trafficTimeS: null, samples: [] };
  if (totalDistM <= 0) return empty;
  const lineFeature = turf.lineString(decodeTripCoords(trip));
  const n = routeTrafficSampleCount(totalDistM);
  const points = Array.from({ length: n }, (_, i) => {
    const d = totalDistM * (i + 0.5) / n; // evenly-spaced midpoints, same spirit as sampleTrafficAhead
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

/** Groups a route's congested samples (ratio below TRAFFIC_HEAVY_THRESHOLD)
 * into contiguous spans along the route, each extended half a sample-gap on
 * either side of its worst point (the gap between evenly-spaced samples —
 * see estimateRouteTrafficTime) so the excluded stretch actually covers the
 * jammed road rather than just a single point on it. Adjacent/overlapping
 * bad samples merge into one span. Returns the single worst span (lowest
 * ratio) since finding and validating a detour is expensive (a whole extra
 * Valhalla + TomTom round-trip — see estimateDetourRoute); returns null if
 * nothing is congested at all. */
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

/** Buffers a slice of `lineFeature` between `startM`/`endM` (metres along
 * it) into the single-ring polygon shape Valhalla's `exclude_polygons`
 * expects: a plain array of [lon, lat] pairs, no nested ring-of-rings
 * wrapper (see requestRoute). turf.buffer normally returns a Polygon for a
 * short line slice; falling back to its first ring covers the rare
 * MultiPolygon case (a self-intersecting buffer on a tight curve) without
 * needing to handle multiple exclude regions. */
function buildExcludePolygon(lineFeature, startM, endM) {
  const slice = turf.lineSliceAlong(lineFeature, Math.max(0, startM), Math.max(startM + 1, endM), { units: 'meters' });
  const buffered = turf.buffer(slice, CONFIG.TRAFFIC_DETOUR_BUFFER_M, { units: 'meters' });
  const { geometry } = buffered;
  return geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
}

/** Forces Valhalla around `span` (see findWorstCongestedSpan) via
 * exclude_polygons and, if that actually produced a meaningfully different
 * route, samples its own traffic and returns `{ trip, trafficTimeS }` —
 * this is the only way to see a side-road path here at all, since
 * Valhalla's plain alternates (filterMeaningfulAlternates) have no notion
 * that live congestion exists and so never route around it specifically.
 * Returns null if the request fails (e.g. no drivable way around it, or
 * the server rejects the polygon), if exclude_polygons made no real
 * difference (no viable parallel road — same near-duplicate check as
 * filterMeaningfulAlternates), or if the detour's own traffic can't be
 * resolved. */
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

const routeDetourCache = new WeakMap(); // trip -> resolved detour candidate ({ trip, trafficTimeS }) or null — same reasoning as routeTrafficTimeCache: avoids re-requesting Valhalla+TomTom every time the cards repaint for the same options

/** After refreshRouteOptionsTraffic resolves the normal traffic-adjusted
 * times, checks whether the currently-fastest option has a congested
 * stretch worth routing around (see findWorstCongestedSpan/
 * estimateDetourRoute) and, if a detour clears
 * TRAFFIC_REROUTE_MIN_IMPROVEMENT, adds it as a genuinely new card tagged
 * "Avoids traffic" (see buildRouteOptionTags/insertDetourOption). Most
 * trips never trigger anything past the congestion check — no span found,
 * or no viable parallel road. Fire-and-forget, same staleness-guard pattern
 * as refreshRouteOptionsTraffic itself. */
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
  // Same "is this actually worth switching for" bar as live traffic
  // rerouting (TRAFFIC_REROUTE_MIN_IMPROVEMENT), just expressed as a
  // fraction of time saved here rather than a ratio-point difference —
  // both exist to keep a marginal gain from surfacing as a whole new option.
  if ((fastestTime - detour.trafficTimeS) / fastestTime < CONFIG.TRAFFIC_REROUTE_MIN_IMPROVEMENT) return;
  insertDetourOption(options, trafficTimes, detour.trip, detour.trafficTimeS);
}

/** Colors every option currently shown — the selected line and the gray
 * alternates alike — by how busy TomTom found it, reusing the exact same
 * route-traffic source/layer (and red/amber/green paint expression) that
 * runTrafficCheckin uses for live-driving dashes. Unlike that near-term,
 * sparse-dash use, this covers each option's ENTIRE length with no gaps:
 * every sample "owns" the stretch of route from the midpoint before it to
 * the midpoint after (same half-a-sample-gap windowing as
 * findWorstCongestedSpan), since with as few as 3 samples for a whole
 * route, isolated 300m ticks would barely be visible and wouldn't answer
 * "where exactly" the way full coverage does. Costs zero extra TomTom
 * calls — `results` is whatever refreshRouteOptionsTraffic/
 * maybeAddTrafficDetourOption already fetched for the ETA numbers. */
function paintRouteOptionsTrafficOverlay(options, results) {
  const features = options.flatMap((trip, i) => {
    const samples = results[i] && results[i].samples;
    if (!samples || !samples.length) return [];
    const totalDistM = trip.summary.length * 1000;
    const gap = totalDistM / routeTrafficSampleCount(totalDistM);
    const lineFeature = turf.lineString(decodeTripCoords(trip));
    return samples.map((s) => {
      const from = Math.max(0, s.d - gap / 2);
      const to = Math.min(totalDistM, s.d + gap / 2);
      const dash = turf.lineSliceAlong(lineFeature, from, to, { units: 'meters' });
      return { type: 'Feature', properties: { ratio: s.ratio }, geometry: dash.geometry };
    });
  });
  map.getSource('route-traffic').setData({ type: 'FeatureCollection', features });
}

/** Splices a validated detour (see maybeAddTrafficDetourOption) into
 * state.routeOptions as a new card and repaints — separate from the normal
 * paintRouteOptionCards(trafficTimes) call in refreshRouteOptionsTraffic
 * since this can resolve well after that (an extra Valhalla + TomTom round
 * trip deep), on its own delay. */
function insertDetourOption(options, trafficTimes, detourTrip, detourTrafficTimeS) {
  if (state.routeOptions !== options) return; // stale — a newer plan/reselect already replaced this array
  state.routeOptions = [...options, detourTrip];
  state.routeOptionDetourTrips.add(detourTrip);
  paintRouteOptionCards([...trafficTimes, detourTrafficTimeS]);
  updateAlternateRouteLines();
  updateSheetPeekHeight();
  // Every trip here has already been through estimateRouteTrafficTime (the
  // originals via refreshRouteOptionsTraffic, the detour itself inside
  // estimateDetourRoute), so this is a pure cache read — no new calls.
  paintRouteOptionsTrafficOverlay(state.routeOptions, state.routeOptions.map((t) => routeTrafficTimeCache.get(t)));
}

/** Kicks off traffic estimation for every current route option and
 * re-paints the cards once it resolves — called fire-and-forget from
 * renderRouteOptions right after the distance-only cards already painted,
 * so live-traffic times/tag show up moments later instead of delaying the
 * cards' first paint on every replan. Guards against a stale result
 * landing after a newer plan/reselect replaced state.routeOptions with a
 * different array while this was in flight. No-ops entirely (never even
 * fetches) outside drive mode or with TomTom off. */
async function refreshRouteOptionsTraffic() {
  if (!tomtomFeaturesEnabled || state.travelMode !== 'drive') return;
  const options = state.routeOptions;
  if (options.length < 1) return;
  const results = await Promise.all(options.map((t) => estimateRouteTrafficTime(t)));
  if (state.routeOptions !== options) return; // stale — a newer plan/reselect already replaced this array
  const trafficTimes = results.map((r) => r.trafficTimeS);
  if (trafficTimes.every((t) => t == null)) return; // no usable data anywhere — leave the distance-only cards as they are
  paintRouteOptionCards(trafficTimes);
  // The extra "~X min in traffic" line changes card height — re-measure the
  // sheet's peek height now, the same fix already applied for the walk-mode
  // elevation chart appearing after the initial measurement (see its own
  // comment in updateSheetPeekHeight's call sites) applied here too.
  updateSheetPeekHeight();
  paintRouteOptionsTrafficOverlay(options, results);
  maybeAddTrafficDetourOption(options, results, trafficTimes); // fire-and-forget: may add one more card, well after this — see its own doc comment
}

/** One label per option in state.routeOptions: "Avoids traffic" for a card
 * added by maybeAddTrafficDetourOption (takes priority over every other
 * tag below — why it exists is the more useful thing to know, even though
 * it's also usually the fastest), else "Fastest"/"Shortest" (won't both
 * appear on the same card unless they're the same option), or a toll
 * callout when the options actually differ on that — no point saying "No
 * tolls" on every card when none of them have tolls anyway. With a single
 * trip there's nothing to compare against, so every tag is blank —
 * "Fastest" on a lone card would be trivially true and misleading, not an
 * actual comparison.
 * `trafficTimes` (same length as `trips`, elements possibly null) — when
 * given, an option's live-traffic-adjusted time (see
 * refreshRouteOptionsTraffic) decides "Fastest" instead of Valhalla's own
 * traffic-blind estimate; an option with no resolved traffic time falls
 * back to its own Valhalla estimate for this comparison only. */
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
  await awaitMapLoad();
  map.getSource('route-alternates').setData({ type: 'FeatureCollection', features });
}

/** Builds/replaces the route-option cards themselves — split out from
 * renderRouteOptions so refreshRouteOptionsTraffic can re-paint just the
 * cards (with live-traffic times/tag) once that resolves, without redoing
 * the map's alternate-line source or the visibility/peek-height work below,
 * which don't change based on traffic data. `trafficTimes` — see
 * buildRouteOptionTags/refreshRouteOptionsTraffic. */
function paintRouteOptionCards(trafficTimes) {
  el.routeOptionsRow.innerHTML = '';
  const tags = buildRouteOptionTags(state.routeOptions, trafficTimes);
  state.routeOptions.forEach((trip, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'route-option-card' + (i === state.selectedRouteIndex ? ' active' : '');
    // Distance, not Valhalla's time estimate, is the headline number here —
    // that estimate is derived from road speed limits/class alone, with no
    // live-traffic signal behind it by default (this app has none
    // configured, by design — see README). A live-traffic-backed estimate
    // (trafficTimes, from TomTom — see refreshRouteOptionsTraffic) is
    // trustworthy enough to show once it's actually resolved for this
    // option; Valhalla's own traffic-blind number never is.
    const trafficTimeS = trafficTimes && trafficTimes[i];
    card.innerHTML = `<div class="route-option-dist">${formatDistance(trip.summary.length * 1000)}</div>
      ${trafficTimeS != null ? `<div class="route-option-time">~${formatDuration(trafficTimeS)} in traffic</div>` : ''}
      ${tags[i] ? `<div class="route-option-tag">${escapeHtml(tags[i])}</div>` : ''}
      ${state.travelMode === 'walk' ? `<div class="route-option-elevation${trip.ascentM != null ? '' : ' hidden'}">${trip.ascentM != null ? `↑${formatDistance(trip.ascentM)}` : ''}</div>` : ''}`;
    card.addEventListener('click', () => selectRouteOption(i));
    el.routeOptionsRow.appendChild(card);
  });
  // Keeps the sheet's top summary line in sync with whichever number the
  // active card is now showing. Without this, the summary (set by
  // renderRouteSummary from Valhalla's traffic-blind estimate, before this
  // ever resolves) would keep showing a different, contradicting time for
  // the exact same selected route once a traffic-adjusted one exists —
  // confusing rather than two intentionally different numbers. Only when
  // it's actually resolved for the active option; otherwise the
  // traffic-blind summary from renderRouteSummary stands, same fallback
  // used everywhere else in this file. Guarded on !state.navigating since
  // updateActiveManeuver owns this line during an active drive instead (see
  // renderRouteSummary's own comment) — this can still run mid-navigation
  // via maybeRerouteForTraffic's own renderRouteOptions() call.
  const activeTrafficTimeS = trafficTimes && trafficTimes[state.selectedRouteIndex];
  const activeTrip = state.routeOptions[state.selectedRouteIndex];
  if (activeTrafficTimeS != null && activeTrip && !state.navigating) {
    el.sheetSummary.textContent = `${formatDistance(activeTrip.summary.length * 1000)} · ~${formatDuration(activeTrafficTimeS)} in traffic`;
  }
}

/** Populates the route-option card(s) and the map's gray alternate lines.
 * Hides both entirely only when there's genuinely no planned route (0
 * options) — a single option still gets its own card even though there's
 * nothing to choose between, because that card is also how a live-traffic
 * ETA gets shown (see refreshRouteOptionsTraffic/buildRouteOptionTags,
 * which already know to skip the "Fastest"/"Shortest" tag with only one
 * trip). Awaits the map's own load before touching its sources — this can
 * run as the very first thing on a fresh page load (clearing stale options
 * before a new plan request), before the map has necessarily finished
 * loading. */
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

/** Kicks off /height for every walk-mode route option that doesn't already
 * carry elevation data, and patches an "↑34m" badge onto each corresponding
 * card once it resolves — lets you see which alternative climbs less
 * before committing to one, not just discover it after. Fire-and-forget,
 * same staleness-guard idea as updateElevationProfileForRoute: captures
 * state.routeOptions by reference, so a stale response from a route
 * re-plan/re-select that happened in the meantime is silently discarded
 * rather than patching the wrong (or since-removed) card. Driving/transit
 * alternatives never show elevation at all today — extending that is out
 * of scope here, same as the main chart being walk-only. */
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
  // Remembers exactly which stops list this trip's maneuvers' legIndex values
  // are relative to — a reroute or mid-drive stop-add only knows the stops
  // still ahead by slicing *this* array, never the original full getStops()
  // list, since a previous reroute may have already been built from a
  // reduced subset of it.
  built.stops = stops;
  state.route = built;
  state.spokenFar = new Set();
  state.spokenNear = new Set();
  state.spokenContinue = new Set();
  state.spokenInclines = new Set();
  state.currentManeuverIdx = 0; // new maneuver array, entirely new startDistM boundaries — see updateActiveManeuver
  state.arrivedAnnounced = false;
  resetTrafficTracking(); // a (re)planned route invalidates any prior traffic sampling/cadence

  await awaitMapLoad();
  map.getSource('route').setData(built.lineFeature);
  clearTraveledRouteSegment(); // a fresh/rerouted trip starts with nothing "already driven" yet

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
  // Re-measure now that the sheet is actually visible — on first render of
  // a trip, renderRouteOptions() (which also calls this) runs BEFORE this
  // line, while the sheet (and everything inside it) still has zero height
  // under display:none, which would otherwise leave the peek height stuck
  // at the 136px floor even when route options are shown.
  updateSheetPeekHeight();

  if (state.travelMode === 'walk') updateElevationProfileForRoute();
  else hideElevationProfile();

  // Persists the route so a killed/reloaded tab mid-drive can restore it
  // without a network round trip. Non-fatal if it fails — the trip keeps
  // working from in-memory state either way, this only affects whether it
  // survives a reload.
  try {
    await saveCurrentTrip({ route: built, from: state.from, to: state.to, stops: getStops(), travelMode: state.travelMode, navigating: state.navigating, flightTracking: state.flightTrackingEnabled });
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
// Transit mode via OpenTripPlanner 2
//
// Entirely config-gated on OTP2_URL, same philosophy as Mapillary: with
// nothing configured, the mode toggle never appears and none of this runs.
// Scope note: this covers planning + distinct rendering + transit-specific
// maneuver text only, not live GPS-guided transit navigation — boarding/
// alighting detection for buses and trains is a materially different
// problem from turn-by-turn road-snapping, so "Start navigation" simply
// isn't offered for a transit itinerary.
// ============================================================================
const TRANSIT_ENABLED = !!CONFIG.OTP2_URL;

const modeButtons = [...el.travelModeToggle.querySelectorAll('.mode-btn')];
const transitModeBtn = modeButtons.find((b) => b.dataset.mode === 'transit');
if (transitModeBtn) transitModeBtn.classList.toggle('hidden', !TRANSIT_ENABLED);
// Drive+Walk need no external service, so the toggle is always at least a
// two-way choice; Transit joins in only once OTP2_URL is configured.
if (modeButtons.filter((b) => !b.classList.contains('hidden')).length > 1) {
  el.travelModeToggle.classList.remove('hidden');
}
// Stops aren't supported by transit routing at all — requestTransitRoute
// only ever takes state.from/state.to (contrast the drive/walk branch,
// which passes getStops()) — so leaving the stops UI visible in transit
// mode used to mean any stops already added just silently vanished from
// the plan the moment Transit actually ran, with zero feedback. Called
// from every place state.travelMode gets set, not just the mode-button
// click handler, so a restored/shared trip in transit mode starts with
// this hidden too.
function updateStopsUiForTravelMode() {
  const isTransit = state.travelMode === 'transit';
  el.stopsContainer.classList.toggle('hidden', isTransit);
  el.addStopBtn.classList.toggle('hidden', isTransit);
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.travelMode = btn.dataset.mode;
    modeButtons.forEach((b) => b.classList.toggle('active', b === btn));
    el.routeAvoidToggle.classList.toggle('hidden', state.travelMode !== 'drive');
    if (state.travelMode === 'transit' && el.stopsContainer.children.length) {
      showStatus("Stops aren't supported for transit directions — showing a direct trip instead.", 'info');
      clearStops();
    }
    updateStopsUiForTravelMode();
    el.planBtn.classList.remove('hidden'); // travel mode changed — any route already shown was planned for the old mode
  });
});

// Avoid tolls/highways: independent toggles (not mutually exclusive like the
// travel-mode buttons above), drive-only — hidden whenever a non-drive mode
// is active (toggled alongside the mode buttons themselves above). Only
// affects auto costing (see costingOptionsFor); harmless to leave the state
// set while walking, since it's simply never read for pedestrian costing.
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

/** OTP2's classic REST trip planner endpoint — stable across OTP1/OTP2,
 * simpler to call than constructing a GraphQL query for this app's needs. */
async function requestTransitRoute(from, to) {
  const url = `${CONFIG.OTP2_URL}/otp/routers/default/plan?fromPlace=${from.lat},${from.lon}`
    + `&toPlace=${to.lat},${to.lon}&mode=TRANSIT,WALK&numItineraries=1`;
  let res;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'The transit routing service is taking too long to respond. Try again in a moment.'
      : 'Could not reach the transit routing service. Check your connection or the OTP2 server address.');
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

  await awaitMapLoad();
  map.getSource('route').setData(emptyFeatureCollection()); // clear any driving route
  map.getSource('transit-route').setData({ type: 'FeatureCollection', features });

  const allCoords = features.flatMap((f) => f.geometry.coordinates);
  const bounds = allCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(allCoords[0], allCoords[0]));
  map.fitBounds(bounds, { padding: 60, duration: 500 });

  renderTransitManeuverList(itinerary.legs);
  const totalDistM = itinerary.legs.reduce((sum, l) => sum + (l.distance || 0), 0);
  el.sheetSummary.textContent = `${formatDistance(totalDistM)} · about ${formatDuration(itinerary.duration)}`;
  el.bottomSheet.classList.remove('hidden');
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
    if (state.travelMode === 'transit') {
      const itinerary = await requestTransitRoute(state.from, state.to);
      await renderTransitRoute(itinerary);
      el.bottomSheet.classList.remove('expanded', 'half');
      el.startNavBtn.classList.add('hidden'); // no live transit navigation — see scope note above
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
      // renderRoute's own peek-height measurement (above) runs before these
      // buttons become visible — a hidden button contributes zero to its
      // parent's height, so re-measuring now (once all of #sheet-actions'
      // real content for this state is actually visible) is what makes the
      // peek height account for the buttons' true height correctly.
      updateSheetPeekHeight();
      showRouteChipsInline(); // not navigating yet — see #route-chips-inline vs the FAB in startNavigation
      const warning = checkRoutePlausibility(trip, state.from, state.to, stops.length > 0);
      if (warning) showStatus(warning, 'error'); else clearStatus();
    }
    // A route is now shown — freeing up screen space and avoiding a
    // redundant extra tap is more useful here than leaving the button
    // sitting there; it reappears the moment the source/destination
    // actually changes (see the from/to/swap/cancel handlers below).
    el.planBtn.classList.add('hidden');
    // Records as soon as a route is successfully found — a "recent search",
    // not a "completed trip" — so it shows up in the from/to fields' quick
    // picks (see showQuickPicksFor) whether or not you ever tap "Start
    // navigation". Covers both drive and transit, and re-planning the same
    // origin/destination just bumps it to the top instead of duplicating
    // (see addRecentTrip). Non-fatal if it fails.
    addRecentTrip({
      originLabel: state.from.label, originLat: state.from.lat, originLon: state.from.lon,
      destLabel: state.to.label, destLat: state.to.lat, destLon: state.to.lon,
    }).catch((err) => {
      showStatus('Could not save this trip to Recent: ' + err.message, 'error');
    });
    // Replaces whatever was on top (the bare directions form, or an earlier
    // planned route being re-submitted) — one back press from a planned
    // route discards the whole route, matching the Cancel button below.
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
let sheetPeekPx = 136; // updated by updateSheetPeekHeight() below — 136 is only the pre-first-measurement fallback, matching style.css's own fallback
function sheetHalfPx() { return window.innerHeight * 0.42; } // keep in sync with .half's 42vh — the middle stop, so a full drag-up doesn't have to mean "barely any map left"
function sheetExpandedPx() { return window.innerHeight * 0.72; } // keep in sync with .expanded's 72vh

// Keeps #map-controls/#map-controls-left clear of the bottom sheet no
// matter its current state — a single hardcoded "raised" offset (the old
// approach) only ever matched the sheet's default peek height, so dragging
// it to the half/expanded stop buried these buttons underneath it (both
// live at the same z-index, and #bottom-sheet comes later in the DOM).
// ResizeObserver reacts to every way the sheet's rendered height can
// change — peek re-measurement, a half/expanded snap, a live drag, or the
// hidden<->visible toggle itself — in one place, rather than threading a
// manual sync call through each of those call sites individually.
const MAP_CONTROLS_CLEARANCE_GAP_PX = 14;
function syncMapControlsClearance() {
  const visible = !el.bottomSheet.classList.contains('hidden');
  const bottom = visible ? Math.ceil(el.bottomSheet.getBoundingClientRect().height) + MAP_CONTROLS_CLEARANCE_GAP_PX : 24;
  el.mapControls.style.bottom = `${bottom}px`;
  el.mapControlsLeft.style.bottom = `${bottom}px`;
}
new ResizeObserver(syncMapControlsClearance).observe(el.bottomSheet);

/** The sheet's default "peek" landing state needs to fit the handle/summary,
 * route options (only present with 2+ meaningfully different routes), the
 * walk-mode elevation chart (only present once its own async /height
 * request resolves — see renderElevationProfile/hideElevationProfile,
 * which both call this again once it does), and the action buttons all at
 * once with no scrolling — a fixed guess clips whichever of those is
 * present but wasn't accounted for, so this measures the real rendered
 * height instead. Call whenever that content's presence or size could have
 * changed (route rendered, alternates shown/hidden). */
function updateSheetPeekHeight() {
  const routeOptionsHeight = el.routeOptionsRow.classList.contains('hidden') ? 0 : el.routeOptionsRow.offsetHeight;
  const elevationHeight = el.elevationProfile.classList.contains('hidden') ? 0 : el.elevationProfile.offsetHeight;
  // #maneuver-list has no .hidden toggle of its own (unlike #poi-results-list)
  // — it stays in normal flow even with zero <li> items, and its own
  // padding-bottom (style.css) still gives it real height even then. Live
  // testing confirmed this: the sum below without this term consistently
  // undercounted the sheet's actual scrollHeight by exactly that padding,
  // clipping the bottom of the peek state by a few pixels.
  sheetPeekPx = Math.max(136, el.sheetHandle.offsetHeight + routeOptionsHeight + elevationHeight + el.sheetActions.offsetHeight + el.maneuverList.offsetHeight);
  // Only actually apply it as the live inline max-height while at rest in
  // the peek state — .half/.expanded's own CSS max-height must stay in
  // charge otherwise, and an active drag is already driving this same
  // inline property itself (see endSheetDrag).
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
  // .sheet-animate (style.css) is what actually makes this change animate —
  // deliberately not a permanent part of #bottom-sheet's own rule, since a
  // transition active at the same time updateSheetPeekHeight writes a plain
  // measurement (route render, resize, ...) is what caused the height to
  // get stuck instead of ever reaching the real target. Only ever present
  // for the duration of a deliberate state change like this one.
  el.bottomSheet.classList.add('sheet-animate');
  el.bottomSheet.classList.toggle('half', targetState === 'half');
  el.bottomSheet.classList.toggle('expanded', targetState === 'expanded');
  // .half/.expanded's own CSS max-height takes over once either class is
  // set (endSheetDrag already cleared any inline override before calling
  // this) — landing back on peek needs its inline height reapplied,
  // since CSS alone only knows the static 136px fallback, not the
  // measured sheetPeekPx.
  if (targetState === 'peek') el.bottomSheet.style.maxHeight = `${sheetPeekPx}px`;
  setTimeout(() => el.bottomSheet.classList.remove('sheet-animate'), 300);
}
// A rotation/viewport resize can change how the route-option cards or
// action buttons wrap onto lines, which changes their real height —
// re-measure rather than let the peek state go stale until the next route.
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
  // Same reason #bottom-sheet.dragging turns its own transition off — the
  // ResizeObserver-driven clearance (syncMapControlsClearance) updates on
  // every pointermove frame, and the eased transition would otherwise lag
  // a beat behind the sheet's actual edge the whole way up/down.
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
    // Barely moved — treat it as a plain tap on the handle: step to the next
    // stop in the ladder (peek → half → expanded → peek), so repeated taps
    // reach all three rather than just bouncing between the two extremes.
    const order = SHEET_STOPS.map((s) => s.state);
    const next = order[(order.indexOf(currentSheetState()) + 1) % order.length];
    setSheetState(next);
    return;
  }
  const dy = sheetDragStartY - e.clientY;
  const finalHeight = Math.min(sheetExpandedPx(), Math.max(sheetPeekPx, sheetDragStartHeight + dy));
  // Snaps to whichever of the three stops the drag ended nearest to, rather
  // than a binary "past the midpoint or not" — dragging up from peek can now
  // land on the half stop instead of always jumping all the way to expanded.
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
  clearTraveledRouteSegment();
  el.routeOptionsRow.classList.add('hidden');

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
// Shareable route links — this app is 100% static hosting (no server of its
// own beyond the geocoding/routing services it points to), so a shared link
// encodes the whole route intent directly in the URL rather than relying on
// any server-side storage. Opening one lands on a pre-filled directions
// form (see applyShareLink) rather than auto-planning, so the recipient
// still gets to see/edit before requesting a route themselves.
// ============================================================================

/** Base64url (RFC 4648 §5) encode/decode of a unicode string — used instead
 * of encodeURIComponent for the share payload because JSON's own structural
 * characters ({ } " : , [ ]) each cost 3 characters once percent-encoded,
 * which dominates the URL length far more than the actual place data does.
 * Base64url's alphabet needs no percent-encoding at all in a query string,
 * so this alone cuts a typical share link by more than half. TextEncoder/
 * TextDecoder round-trip handles place names outside the Latin-1 range
 * (btoa/atob alone only handle single-byte characters). */
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

/** Shrinks a {label, lat, lon} place down to just what's needed to rebuild
 * it: the short primary name (not the full multi-part address Nominatim
 * returns) and coordinates rounded to 5 decimal places (~1.1m — already far
 * finer than routing needs, so this loses nothing that matters). */
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

/** Reverses compactPlace back into the {label, lat, lon} shape the rest of
 * the app already works with (goToDirections, addStopRow, state.from/to) —
 * returns null on anything malformed so a bad link degrades to "ignore it"
 * rather than a half-populated crash. */
function expandPlace(p) {
  if (!p || typeof p.la !== 'number' || typeof p.lo !== 'number' || typeof p.lb !== 'string') return null;
  return { label: p.lb, lat: p.la, lon: p.lo };
}

/** Reads the OS-level "Share" params (see manifest.json's share_target),
 * present when this installed PWA was opened via Android's share sheet —
 * e.g. sharing a place straight from the Google Maps app, instead of
 * copying the link and switching apps yourself. Different apps put the
 * actual content in different fields (Google Maps' Android share puts a
 * place name + link together in `text`), so this just concatenates
 * whatever's present; parseGoogleMapsUrl finds the link inside it either
 * way. Returns null (not a throw) if this wasn't a share-target open. */
function parseShareTargetParam() {
  const params = new URLSearchParams(location.search);
  const combined = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join(' ');
  return combined.trim() || null;
}

/** Resolves shared text exactly like pasting the same text into the search
 * box would (see setupAutocomplete's Google Maps URL branch) — populates
 * the search field with the resolved place and bookmarks it the same way,
 * so sharing a place straight from Google Maps needs no extra steps beyond
 * picking this app from the share sheet. */
async function handleSharedGoogleMapsLink(text) {
  showStatus('Resolving shared Google Maps link…', 'info');
  const resolved = await resolveGoogleMapsLink(text);
  if (resolved.lat != null) {
    el.placeInput.value = resolved.label;
    selectPlace(resolved);
    autoBookmarkGoogleMapsLink(resolved);
  } else {
    showStatus(`That shared link couldn't be resolved — ${resolved.error}.`, 'error');
  }
}

/** Reads and validates the `?share=` query param, if any. Returns null (not
 * a throw) on anything malformed — a bad/corrupted link should fall through
 * to the normal startup flow, never a stuck blank screen. Note: the value is
 * decoded exactly once — URLSearchParams already reverses the single
 * encodeURIComponent applied when the link was built, so JSON.parse runs
 * directly on it; a second decodeURIComponent would corrupt any label that
 * happens to contain a literal '%'. */
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

/** Lands on a pre-filled directions form from a shared link — from/to/stops
 * and travel mode are all populated, but "Get directions" is never clicked
 * automatically, so the recipient can review before requesting a route. */
function applyShareLink(payload) {
  const rawStops = Array.isArray(payload.stops) ? payload.stops : [];
  const trimmed = rawStops.length > CONFIG.MAX_STOPS;
  const stops = rawStops.slice(0, CONFIG.MAX_STOPS);

  let mode = ['drive', 'walk', 'transit'].includes(payload.mode) ? payload.mode : 'drive';
  let modeFellBack = false;
  if (mode === 'transit' && !TRANSIT_ENABLED) { mode = 'drive'; modeFellBack = true; }
  state.travelMode = mode;
  modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  updateStopsUiForTravelMode();

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

// Chromium's speechSynthesis.getVoices() is asynchronous — the list is
// empty until the 'voiceschanged' event fires, sometimes several seconds
// after page load. In a plain browser tab this is harmless (voices are
// almost always ready long before the first prompt), but inside the
// Capacitor Android shell's WebView the same async gap has been observed to
// leave an utterance with no voice resolved AND no error event at all —
// speak() call succeeds, nothing is ever heard, no exception, nothing in
// the console. Calling getVoices() once up front (right away, not waiting
// for navigation to start) and caching whatever 'voiceschanged' eventually
// delivers gives the WebView's TTS bridge the longest possible head start
// before speak() is ever actually called for a real turn-by-turn prompt.
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

// Which voice speak() should prefer, chosen from the Settings dropdown —
// stored by voiceURI (a stable per-voice identifier both the web
// speechSynthesis API and the native TextToSpeech plugin's
// getSupportedVoices() expose), not by index, since a device/browser's
// voice list order isn't guaranteed stable across reloads. Empty/unset
// means "no preference", falling through to speak()'s existing heuristic.
// native-tts.js duplicates this exact key literal — keep both in sync.
const VOICE_URI_STORAGE_KEY = 'preferredVoiceURI';

/** Fills the Settings panel's voice `<select>` with "System default" plus
 * one option per available voice, and selects whichever one is currently
 * preferred (falling back to "System default" if the stored voiceURI no
 * longer matches any available voice — e.g. after an OS voice pack
 * change). Called once voices are known on both platforms, and again
 * whenever the web path's voice list changes (voiceschanged, above). */
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
      // Seen on some OEM builds: the device's TTS engine returns a null
      // voice set instead of an empty one, which the native plugin can only
      // surface as a rejected promise here — there's no voice list to ever
      // populate, so the dropdown would otherwise just sit empty forever.
      // Turn-by-turn voice guidance itself is unaffected (speakNative()
      // doesn't need this list — it just falls back to the device's own
      // default voice); only the ability to pick a different one is
      // unavailable on a device like this, so the whole row is hidden
      // instead of showing a picker with nothing in it.
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

// See CONFIG.VOICE_MIN_GAP_MS for what this pause is for. Resolves it via
// each utterance's REAL completion signal (dispatchSpeak's returned
// promise), not a flat per-dispatch timer — a flat timer shorter than how
// long a real phrase actually takes to speak let a backlog build silently
// across a whole drive: each new line got handed to the TTS engine's own
// queue before the previous one had actually finished, so what you
// eventually heard lagged further and further behind when it was supposed
// to play (confirmed as the cause of turn prompts arriving "at the last
// minute" on a real multi-turn drive). Chaining onto real completion times
// instead means the queue can never fall behind its own dispatch rate.
function voiceGapDelay() {
  return new Promise((resolve) => setTimeout(resolve, CONFIG.VOICE_MIN_GAP_MS));
}

// Every QUEUED voice line chains onto this — starts pre-resolved so the
// very first call dispatches immediately. dispatchSpeak() always resolves
// (never rejects, see below), so one failed utterance can never wedge
// every queued line behind it forever.
let voiceQueueTail = Promise.resolve();

function speak(text, { queue = false } = {}) {
  if (state.voiceMode === 'off') return;
  if (!queue) {
    // A flush always dispatches immediately (it's meant to interrupt right
    // away) — but still resets the queue tail to wait for THIS utterance's
    // real completion (plus the usual gap), so anything queued right
    // behind it still waits its own turn rather than piling on top of it.
    voiceQueueTail = dispatchSpeak(text, queue).then(voiceGapDelay);
    return;
  }
  voiceQueueTail = voiceQueueTail.then(() => dispatchSpeak(text, queue)).then(voiceGapDelay);
}

/** The actual speak-it-now logic, split out from speak() above so the
 * queue-chaining there can wait on it without duplicating it. Returns a
 * promise that resolves once the utterance has genuinely finished speaking
 * (or failed, or was skipped) — never rejects, so speak()'s chain never
 * gets stuck on a bad utterance. */
function dispatchSpeak(text, queue) {
  if (state.voiceMode === 'off') return Promise.resolve(); // may have been turned off while this queued line was waiting its turn

  if (isNativePlatform()) {
    // Confirmed live via the on-screen debug log: 'speechSynthesis' in
    // window is false inside the Capacitor shell's WebView — unlike a
    // normal Chrome tab, Android's embedded WebView has never implemented
    // the Web Speech Synthesis API at all. The web path below is
    // deliberately left untouched and web/PWA-only; the shell always uses
    // real native TTS instead (see native-tts.js).
    resolverDebugLog(`speak() [native]: "${text}"${queue ? ' (queued)' : ''}`);
    // speakNative()'s promise resolves once the device has actually
    // FINISHED speaking this line (the plugin's own onDone callback, fired
    // by Android's UtteranceProgressListener — not merely "started" or
    // "handed to the queue"), so chaining on it is a real completion
    // signal, not a guess.
    return speakNative(text, { queue }).catch((err) => resolverDebugLog(`speak() [native]: threw "${err.message}" for "${text}"`, 'error'));
  }

  if (!('speechSynthesis' in window)) {
    resolverDebugLog('speak(): speechSynthesis not supported on this WebView/browser — voice guidance unavailable.', 'error');
    return Promise.resolve(); // silently unsupported, never crashes navigation
  }
  try {
    // Android has been observed leaving the synthesis queue stuck 'paused'
    // after the WebView is backgrounded (screen lock, app-switch) and
    // foregrounded again — resume() is a no-op when nothing is paused, so
    // this is safe to call unconditionally on every prompt.
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    // Only cancel an utterance that's actually in flight — calling
    // cancel() unconditionally right before speak() has been reported to
    // race the native TTS bridge on some Android WebView versions (the
    // cancel can land after the new utterance is already queued, silently
    // killing it instead of the old one). `queue: true` (turn-guidance
    // call sites — see updateActiveManeuver) skips this entirely, letting
    // speechSynthesis's own native queuing play the in-flight utterance
    // out before starting the new one, so a driver always hears at least
    // one complete instruction rather than having it truncated mid-
    // sentence by the very next prompt (e.g. two closely-spaced turns).
    if (!queue && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Explicitly resolving a voice (rather than leaving utterance.voice
    // unset) is the known fix for WebViews that silently no-op when asked
    // to speak with no voice resolved yet — falls through to whatever
    // getVoices() returned at prime time, first English voice preferred,
    // otherwise just the first available voice. Leaves the browser's own
    // default in place (no functional change) when no voices are known at
    // all, which is the normal case on the web build.
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

/** A short two-tone alert chime for the moment a reroute actually fires —
 * deliberately NOT a voice prompt (a plain earcon, like Google Maps' own
 * "you're off route, recalculating" sound), so it plays regardless of
 * state.voiceMode. Built with the Web Audio API rather than shipping an
 * audio file, consistent with this app having no bundled assets beyond
 * icons. One AudioContext is reused across calls rather than created fresh
 * each time — cheap, and avoids the handful of contexts some browsers cap
 * a page at. Never throws: a blocked/unsupported AudioContext just means
 * navigation continues silently rather than erroring out. */
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

/** Paints the already-driven portion of the route in a dull gray
 * (route-traveled-line, added on top of route-line in the mapLoad setup
 * above) so it visually falls away as you progress, rather than the whole
 * route staying a uniform blue from start to finish. Cleared via
 * clearTraveledRouteSegment whenever a route is (re)planned or navigation
 * ends, so a new trip never starts with a stale dulled segment left over
 * from the previous one. */
function updateTraveledRouteSegment(traveledM) {
  if (!state.route || traveledM <= 0) {
    map.getSource('route-traveled').setData(emptyFeatureCollection());
    return;
  }
  const traveled = turf.lineSliceAlong(state.route.lineFeature, 0, Math.min(traveledM, state.route.totalDistM), { units: 'meters' });
  map.getSource('route-traveled').setData(traveled);
}
function clearTraveledRouteSegment() {
  map.getSource('route-traveled').setData(emptyFeatureCollection());
}

/** Figures out which maneuver is "next" from how far the driver has
 * travelled along the route, updates the banner/list, and fires the voice
 * prompt once within a speed-scaled lead distance of it (see
 * dynamicVoiceLeadM). state.currentManeuverIdx is a forward-only ratchet,
 * not a fresh scan each call — see the hysteresis comment below. */
function updateActiveManeuver(traveledM, lngLat) {
  const maneuvers = state.route.maneuvers;
  // Raw, unfiltered read of "which maneuver does the live position fall
  // under right now" — GPS jitter (commonly ±5-15m fix-to-fix) means this
  // can flicker across a maneuver boundary from noise alone, especially
  // when two maneuvers are close together (a short segment between them).
  // This is deliberately NOT used directly below — see the ratchet.
  let candidateIdx = 0;
  for (let i = 0; i < maneuvers.length; i++) {
    if (maneuvers[i].startDistM <= traveledM) candidateIdx = i;
    else break;
  }
  // Forward-only ratchet: state.currentManeuverIdx only ever advances, and
  // only once traveledM clears the NEXT boundary by a real margin — same
  // hysteresis idea as checkDeviation's DEVIATION_CLEAR_THRESHOLD_M below,
  // applied here instead to stop the nav banner/voice prompts flickering
  // between two maneuvers when GPS noise straddles their shared boundary
  // (confirmed live: this is exactly what caused the reported "next step
  // fluctuating between two different steps" bug).
  //   - candidateIdx <= current: ignore (absorbs backward jitter).
  //   - candidateIdx === current + 1: advance only once traveledM is
  //     meaningfully past that boundary (CONFIG.MANEUVER_ADVANCE_HYSTERESIS_M)
  //     — the single-step case where boundary-straddling jitter matters.
  //   - candidateIdx > current + 1: advance immediately, no margin check —
  //     GPS jitter of a few metres can never cross two whole maneuver
  //     boundaries in one ~1s fix, so this is unambiguous real progress
  //     (e.g. a stale fix after the tab was backgrounded, or several very
  //     short maneuvers driven through between fixes) rather than noise.
  if (candidateIdx === state.currentManeuverIdx + 1) {
    if (traveledM >= maneuvers[candidateIdx].startDistM + CONFIG.MANEUVER_ADVANCE_HYSTERESIS_M) {
      state.currentManeuverIdx = candidateIdx;
    }
  } else if (candidateIdx > state.currentManeuverIdx + 1) {
    state.currentManeuverIdx = candidateIdx;
  }
  const currentIdx = state.currentManeuverIdx;
  // Which origin→stop/stop→stop/stop→destination leg we're currently on. A
  // reroute only needs to route through the stops still ahead — see
  // triggerReroute() — so this has to track live as the trip progresses.
  state.currentLegIndex = maneuvers[currentIdx].legIndex;
  const nextIdx = currentIdx + 1 < maneuvers.length ? currentIdx + 1 : null;
  const remainingM = Math.max(0, state.route.totalDistM - traveledM);

  // Ends the ride once genuinely close to the destination — checked by
  // remaining distance alone, independent of whichever maneuver index
  // traveledM nominally falls under. Valhalla's own cumulative maneuver
  // lengths and turf's measured distance along the same decoded polyline
  // can differ by several metres over a long/winding route, so "currentIdx
  // has reached the last maneuver" and "remainingM is small" don't always
  // line up — gating on nextIdx === null here could mean this never fires
  // at all on some real routes. Same action as tapping "End" yourself.
  //
  // Requires ARRIVAL_CONFIRM_FIXES consecutive fixes in a row within the
  // radius, not just one — see the constant's own comment in config.js for
  // why a single fix isn't trustworthy enough to end navigation over.
  //
  // remainingM alone isn't enough: turf.nearestPointOnLine is a pure 2D
  // planar snap with no elevation/level awareness, and on a driving network
  // (overpass/underpass pairs, cloverleaf ramps, a parallel service road)
  // the route can pass within ARRIVAL_RADIUS_M of itself somewhere far from
  // the actual destination. A couple of ordinary noisy fixes near one of
  // those spots could otherwise satisfy the streak and end the trip early
  // (the puck disappearing mid-drive). Also requiring the live fix to be
  // genuinely close to the destination coordinates itself — not just close
  // in route-progress terms — rules that out.
  const straightLineToDestM = lngLat ? turf.distance(lngLat, [state.to.lon, state.to.lat], { units: 'meters' }) : 0;
  if (!state.arrivedAnnounced && remainingM <= CONFIG.ARRIVAL_RADIUS_M && straightLineToDestM <= CONFIG.ARRIVAL_RADIUS_M * 2) {
    state.arrivalCandidateStreak += 1;
  } else {
    state.arrivalCandidateStreak = 0;
  }
  if (!state.arrivedAnnounced && state.arrivalCandidateStreak >= CONFIG.ARRIVAL_CONFIRM_FIXES) {
    state.arrivedAnnounced = true;
    speak('You have arrived at your destination.');
    // showSummary/arrived: true — with the trip-summary panel currently
    // disabled, endNavigation falls back to a plain arrival toast instead
    // (see its own comment); passing these through keeps that working
    // automatically if the panel is ever re-enabled later.
    endNavigation({ showSummary: true, arrived: true });
    return; // navigation just ended — nothing below is still meaningful
  }

  // "Continue straight for X km" — spoken once, the moment a straight-
  // through maneuver (see CONTINUE_STRAIGHT_TYPES) BECOMES current, not as
  // an approach cue like the turn prompts below. This is also what covers
  // maneuver 0 on a route that starts with a long straight leg: currentIdx
  // is 0 from the very first fix, so it's included here same as any later
  // straight segment — the upcoming-maneuver voice cues below never speak
  // the current maneuver.
  //
  // Only fires at the START of a straight run (currentIdx 0, or the
  // maneuver right before it wasn't itself a straight-through type) — not
  // on every straight-through maneuver in a run, since straightAheadDistanceM
  // already looks ahead through the whole run from here. Without this
  // guard, a stretch Valhalla splits into several consecutive kContinue
  // maneuvers (see straightAheadDistanceM) would otherwise re-announce
  // "Continue straight for X km" at every one of them as currentIdx
  // advances through the run, each time with a shorter remaining distance.
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
    const distToNextM = Math.max(0, maneuvers[nextIdx].startDistM - traveledM);
    highlightManeuver(nextIdx);
    el.navBannerIcon.innerHTML = maneuverIcon(maneuvers[nextIdx].type);
    el.navBannerInstruction.textContent = maneuvers[nextIdx].instruction;
    el.navBannerDistance.textContent = 'in ' + formatDistance(distToNextM);

    // Two-stage voice prompt per maneuver: an early "in X meters, turn
    // right" heads-up while there's still real distance left, then a short
    // plain "turn right" reminder right before it — same two-cue pattern
    // Google Maps uses, rather than one prompt that's either too early or
    // too abrupt on its own. Each stage fires at most once per maneuver
    // (spokenFar/spokenNear), independently of the other. Both thresholds
    // are speed-scaled (dynamicVoiceLeadM), not flat distances — see the
    // CONFIG comment above VOICE_PROMPT_LEAD_TIME_S.
    const farLeadM = dynamicVoiceLeadM(CONFIG.VOICE_PROMPT_LEAD_TIME_S, CONFIG.VOICE_PROMPT_MIN_M, CONFIG.VOICE_PROMPT_MAX_M);
    const nearLeadM = dynamicVoiceLeadM(CONFIG.VOICE_NEAR_LEAD_TIME_S, CONFIG.VOICE_NEAR_MIN_M, CONFIG.VOICE_NEAR_MAX_M);
    // farLeadM >= nearLeadM at every speed (far's lead-time and clamp range
    // are both larger), so this is deliberately NOT gated on
    // `distToNextM > nearLeadM` — a coarse GPS fix (high speed, closely
    // spaced maneuvers, a fix that arrives late) can otherwise carry
    // distToNextM from above farLeadM to at-or-below nearLeadM in a single
    // tick, which used to skip the far cue entirely and leave the terse
    // near cue as the ONLY warning, arriving abruptly close to the turn
    // (confirmed as the cause of "the last callout is very close to the
    // turn"). Firing far purely on `distToNextM <= farLeadM` guarantees at
    // least one advance-warning phrase every time.
    if (distToNextM <= farLeadM && !state.spokenFar.has(nextIdx)) {
      const next = maneuvers[nextIdx];
      if (next.verbalMultiCue && next.verbalPreTransition) {
        // Valhalla already solved "two turns too close together to speak
        // both in full" server-side — verbal_pre_transition_instruction is
        // a complete, self-contained combined phrase covering both
        // maneuvers (see buildRouteState). No "In X meters" prefix: it
        // doesn't compose grammatically with an already-combined sentence,
        // and Valhalla's own phrasing already carries its own framing.
        // Marking spokenNear too means the near-callout below correctly
        // never separately fires for this same maneuver — Valhalla's
        // phrase already covers it.
        speak(next.verbalPreTransition, { queue: true });
        state.spokenNear.add(nextIdx);
      } else if (distToNextM < 10) {
        // formatDistanceForSpeech floors to the nearest 10m, so anything
        // under 10m would otherwise read as "In 0 meters, turn left" — a
        // coarse/late GPS fix can land distToNextM this close on the very
        // first tick that crosses farLeadM (see the skip-collapse comment
        // above). Speak the bare instruction instead, same as the near cue.
        speak(next.instruction, { queue: true });
        state.spokenNear.add(nextIdx);
      } else {
        speak(`In ${formatDistanceForSpeech(distToNextM)}, ${next.instruction}`, { queue: true });
        // Already inside the near window on this same tick (the skip
        // scenario above) — mark it done now so the near block just below
        // doesn't immediately repeat the same instruction a second time
        // with zero gap.
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
    // Past the start of the final maneuver but not yet within
    // ARRIVAL_RADIUS_M (e.g. a final maneuver with real length left) —
    // just the "Arriving" banner; the actual end-of-ride check above
    // handles the moment it's genuinely time to stop.
    highlightManeuver(currentIdx);
    el.navBannerIcon.innerHTML = maneuverIcon(4); // flag
    el.navBannerInstruction.textContent = maneuvers[currentIdx].instruction || 'You have arrived';
    el.navBannerDistance.textContent = 'Arriving';
  }

  checkInclineAnnouncement(traveledM);

  // Live ETA line in the collapsed bottom sheet, replacing the static
  // total-trip summary shown before navigation started.
  let remainingTimeS = state.route.totalDistM > 0
    ? state.route.totalTimeS * (remainingM / state.route.totalDistM)
    : 0;
  // Heavy-traffic adjustment (see maybeCheckTraffic/runTrafficCheckin):
  // only scales the estimate once the averaged ratio is actually below the
  // "heavy" threshold, same condition that shows the indicator itself —
  // otherwise this line stays exactly as before, no traffic chatter.
  let etaSuffix = '';
  if (state.trafficRatio != null && state.trafficRatio < CONFIG.TRAFFIC_HEAVY_THRESHOLD) {
    remainingTimeS = remainingTimeS / state.trafficRatio; // inverse of the ratio — still just an estimate
    etaSuffix = ' (traffic, est.)';
  }
  el.sheetSummary.textContent = `${formatDistance(remainingM)} remaining · about ${formatDuration(remainingTimeS)}${etaSuffix}`;

  // Native Picture-in-Picture mini view (see native-pip.js) — kept in
  // lockstep with the on-screen banner above so it's never stale while
  // it's the only thing visible (app backgrounded). Best-effort: a
  // rejected promise here (not running inside the Android shell) is
  // expected and must never affect navigation itself.
  if (isNativePlatform()) {
    updatePipTurnCard({
      maneuverKind: nextIdx !== null ? maneuverPipIconKey(maneuvers[nextIdx].type) : 'arrive',
      instruction: el.navBannerInstruction.textContent,
      distanceText: el.navBannerDistance.textContent,
      etaText: `${formatDistance(remainingM)} left · ${formatDuration(remainingTimeS)}`,
    }).catch(() => {});
  }
}

/** Speaks a one-time heads-up ("Moderate incline for the next 200 meters")
 * for the next upcoming sustained climb/descent in state.route.gradeSegments
 * — walk mode only, mirroring the turn-by-turn far/near callout pattern
 * right above: a speed-scaled lead distance (dynamicVoiceLeadM) and
 * spoken-once tracking (state.spokenInclines), keyed by each segment's own
 * startDistM rather than an array index — deriveGradeSegments' output is
 * stable for the lifetime of a given state.route, so this is a reliable
 * key. Gentle segments (below INCLINE_GRADE_MODERATE_PCT) are marked
 * spoken without ever actually being announced — not worth mentioning, but
 * still shouldn't be re-evaluated every tick either. */
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
  } else if (offsetM <= CONFIG.DEVIATION_CLEAR_THRESHOLD_M) {
    // Only clear once meaningfully back under the trip threshold (see
    // DEVIATION_CLEAR_THRESHOLD_M) — a bare dip just below it would
    // otherwise flap the timer indefinitely on a road that runs close to
    // the original route without ever accumulating enough continuous
    // deviation to actually reroute.
    state.offRouteSince = null;
  }
}

/** Reroute requests are the one part of live navigation that needs the
 * network (everything else — position snapping, maneuver-advance,
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
    // A heading hint (when we have a real one — see state.lastHeading in
    // onPositionUpdate) tells Valhalla which direction of the road edge to
    // snap the new route's start to, so it doesn't emit a U-turn just to
    // reorient onto an edge facing the wrong way.
    const from = { lat: currentLngLat[1], lon: currentLngLat[0] };
    if (typeof state.lastHeading === 'number' && !Number.isNaN(state.lastHeading)) {
      from.heading = Math.round(state.lastHeading);
      from.heading_tolerance = 45;
    }
    // Only route through stops still ahead — currentLegIndex tracks how many
    // have already been visited, so a stop you've already been to is never
    // routed back through on a reroute. Sliced from state.route.stops (the
    // stops list the CURRENT route's own maneuvers are indexed against), not
    // getStops() — a previous reroute may have already narrowed that list,
    // and currentLegIndex is relative to whatever narrowed list is active
    // now, not the original full set of stops.
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
    // Re-check here, not just before the try above — connectivity can also
    // drop mid-request. But a genuine failure while still online (a real
    // Valhalla error, a timeout, no route found — requestRoute throws a
    // distinct message for each) used to get overwritten with this same
    // "no signal" text regardless, misleading the driver into thinking
    // there's nothing to do but wait for a connection that never actually
    // dropped. pendingRerouteFrom is specifically "retry once the 'online'
    // event fires" (see its own state comment) — not relevant here since
    // there's no offline period to recover from, so it's deliberately left
    // unset; the next off-route dwell cycle naturally gets another attempt.
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

// The instant the browser reports connectivity again, retry a reroute that
// was deferred while offline, rather than waiting for the next off-route
// dwell cycle to notice.
window.addEventListener('online', () => {
  if (state.navigating && state.pendingRerouteFrom && !state.isRerouting) {
    showStatus('Back online — recalculating your route…', 'info', { sticky: true });
    triggerReroute(state.pendingRerouteFrom);
  }
});

/** `coords.speed` is metres/second, `null` when the device/browser doesn't
 * report it (common with poor GPS accuracy) — shown as a dash rather than an
 * error in that case, same "degrade quietly" treatment as everywhere else
 * position data is used. Visibility of #nav-speed itself is controlled by
 * startNavigation/endNavigation, not here, so it doesn't flicker in and out
 * as individual fixes come and go without a speed value. */
function updateSpeedText(speed) {
  el.navSpeed.textContent = typeof speed === 'number' && !Number.isNaN(speed)
    ? `${Math.max(0, Math.round(speed * 3.6))} km/h`
    : '— km/h';
}

function onPositionUpdate(pos) {
  const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
  const lngLat = [lng, lat];
  updateSpeedText(speed);

  // Fix-to-fix distance/elapsed-time vs the previous fix — computed once
  // and shared by both the derived-speed fallback right below and the
  // heading fallback further down, rather than calling turf.distance twice
  // for the same two points.
  let movedM = null;
  let dtS = null;
  if (state.lastFix) {
    movedM = turf.distance([state.lastFix.lng, state.lastFix.lat], lngLat, { units: 'meters' });
    dtS = ((pos.timestamp || Date.now()) - state.lastFix.t) / 1000;
  }
  // Only trusted within a sane small window — a huge gap (e.g. a
  // backgrounded tab resuming minutes later) or a near-zero one (two fixes
  // at effectively the same instant) would make movedM/dtS meaningless, so
  // those fall through to null instead of a derived value.
  const derivedSpeedMps = (dtS != null && dtS >= 0.5 && dtS <= 10) ? movedM / dtS : null;
  // pos.coords.speed is null on a lot of real fixes — a documented, common
  // GPS/device quirk, not a rare edge case — so falling back straight to
  // CONFIG.VOICE_DEFAULT_SPEED_MPS (applied once, at read time, in
  // dynamicVoiceLeadM) on every one of those fixes made voice-guidance
  // timing collapse to that same constant far more often than intended.
  // Deriving speed from real position+time here instead means it keeps
  // tracking actual driving speed on those fixes too.
  state.currentSpeedMps = (typeof speed === 'number' && !Number.isNaN(speed) && speed >= 0) ? speed : derivedSpeedMps;

  // --- Heading: prefer the device's own compass/course-over-ground; fall
  // back to a bearing computed from the last two fixes when unavailable
  // (common on some Android devices/browsers while stationary or slow). ---
  let headingDeg = state.lastHeading;
  if (typeof heading === 'number' && !Number.isNaN(heading)) {
    headingDeg = heading;
  } else if (movedM != null && movedM > 0.5) {
    // Low enough to still track a slow turn (a 2m gate meant the map could
    // stay pointed the pre-turn direction for a couple of fixes right after
    // turning at low speed) while high enough that plain GPS jitter at rest
    // (sub-metre) still doesn't spin the heading around at random.
    headingDeg = (turf.bearing([state.lastFix.lng, state.lastFix.lat], lngLat) + 360) % 360;
  }
  state.lastHeading = headingDeg;
  state.lastFix = { lng, lat, t: pos.timestamp || Date.now() };
  refreshWeatherBadge(); // fire-and-forget; the cache's coarse time bucket is what stops this from refetching on every tick

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
  updateTraveledRouteSegment(traveledM);
  updateLiveAscent(traveledM);

  updateActiveManeuver(traveledM, lngLat);
  checkDeviation(offsetM, lngLat);
  maybeCheckTraffic(traveledM);
  maybeCheckFlights(traveledM, lngLat);
  resaveNavigatingTripThrottled();
}

/** Linear interpolation of height at `distM` along `rangeHeight` (a
 * [[cumulativeDistM, heightM], ...] array — see fetchElevationProfile) —
 * samples are only ~30m apart, coarser than every GPS tick, so this tracks
 * climb smoothly between them rather than only updating in ~30m-wide
 * jumps. Clamps to the first/last sample for a distance outside the
 * sampled range (shouldn't normally happen, but a live fix snapping just
 * past the last sample due to floating-point noise is cheap to guard). */
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

/** Accumulates state.liveAscentM/liveDescentM as the live position advances
 * — the raw ingredients for the "Effort" readout on #effort-btn (see
 * effortLevel; descent isn't part of that score, just carried through to
 * the trip-summary panel) and for that panel's own elevation stats. Walk
 * mode + a route actually carrying elevation data only (state.route.
 * rangeHeight is only ever set once /height resolves — see
 * updateElevationProfileForRoute — so this is naturally a no-op until then,
 * same as the chart itself). */
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

let lastTripResaveAt = 0;
/** Keeps the persisted "currently navigating" trip record (see
 * startNavigation) reflecting the route actually being driven right now —
 * a reroute swaps state.route for a new one mid-drive, so without this the
 * resume-on-reload path could restart navigation on a route that's since
 * been superseded. Throttled to well below GPS fix cadence purely to avoid
 * hammering IndexedDB on every tick; losing a few seconds of "how far
 * along" precision on the rare reload-mid-drive doesn't matter since a
 * fresh GPS fix re-snaps position immediately either way. */
function resaveNavigatingTripThrottled() {
  const now = Date.now();
  if (now - lastTripResaveAt < 15000) return;
  lastTripResaveAt = now;
  saveCurrentTrip({ route: state.route, from: state.from, to: state.to, stops: getStops(), travelMode: state.travelMode, navigating: true, flightTracking: state.flightTrackingEnabled })
    .then(() => {
      // endNavigation()'s own clearCurrentTrip() call and this save each
      // independently open their own IndexedDB connection, with no ordering
      // guarantee between them — if "End" was tapped while this save was
      // still in flight, the delete could easily have already lost the race
      // to this now-stale put. Re-checking state.navigating once the save
      // actually resolves and immediately re-clearing closes that gap
      // regardless of which transaction the browser happened to commit
      // first — otherwise a resurrected "navigating: true" record would
      // silently restart turn-by-turn guidance on a trip the user ended.
      if (!state.navigating) clearCurrentTrip().catch(() => {});
    })
    .catch(() => { /* non-fatal — see startNavigation's own save for the same reasoning */ });
}

function onPositionError(err) {
  // @capacitor-community/background-geolocation's own error shape is
  // {message, code} with a STRING code (e.g. "NOT_AUTHORIZED"), not the
  // browser GeolocationPositionError numeric constants below — so on the
  // Android shell, err.PERMISSION_DENIED/err.TIMEOUT are always undefined
  // and this used to silently fall through to the generic "lost signal"
  // message even when the real cause was the device's Location *service*
  // being off (a different problem than the app's own permission, and one
  // ensureLocationEnabled() in native-location.js now proactively prompts
  // for before a watch even starts — this branch is the fallback for
  // someone declining that prompt, or turning Location off again mid-trip).
  const isLocationServiceDisabled = err.code === 'NOT_AUTHORIZED' && /disabled/i.test(err.message || '');
  if (isLocationServiceDisabled) {
    showStatus('Location is turned off on this device. Turn it on to continue navigation.', 'error');
    endNavigation();
  } else if (err.code === err.PERMISSION_DENIED || err.code === 'NOT_AUTHORIZED') {
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

// ============================================================================
// Screen Wake Lock — keeps the display on while actively navigating, same
// idea as Google Maps/every other turn-by-turn app (nobody wants the phone
// to lock itself mid-drive). Supported in all current major browsers
// (Chrome 84+, Safari 16.4+, Firefox 126+); unsupported browsers just never
// get a lock — this never blocks or breaks navigation either way.
// ============================================================================
let wakeLockSentinel = null;

async function acquireWakeLock(isRetry = false) {
  if (!('wakeLock' in navigator)) return; // unsupported browser — quietly do nothing
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
      // The lock can be revoked by the platform (e.g. a low-battery-mode
      // policy change) while the tab stays visible the whole time — nothing
      // else would ever notice and re-request it in that case, since
      // visibilitychange only fires on an actual hide/show transition.
      if (state.navigating) acquireWakeLock();
    });
  } catch (err) {
    wakeLockSentinel = null;
    // Some Android Chrome versions can spuriously reject a request made
    // right at the instant a tab becomes visible again, before the tab is
    // *quite* fully "active" from the Wake Lock API's own perspective —
    // one retry shortly after covers that without retrying forever if the
    // rejection is for a real, sustained reason (denied, battery saver).
    if (state.navigating && !isRetry) {
      setTimeout(() => { if (state.navigating && !wakeLockSentinel) acquireWakeLock(true); }, 1000);
    }
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => { /* already released or unsupported — fine either way */ });
    wakeLockSentinel = null;
  }
}

// The browser automatically releases the wake lock the instant the tab is
// backgrounded/minimized — re-acquire it the moment it's visible again, but
// only if a drive is still actually in progress.
//
// This same "visible again" moment is also where the live nav puck has been
// observed to come back missing after a minimize/restore on the Android
// shell (reported bug: route line and turn banner both fine, but no puck).
// Two backgrounding paths both end with the WebView's own visibility
// toggling — plain Home-button/app-switch (MainActivity.onPause immediately
// un-pauses the WebView so JS keeps running, but does nothing about the
// WebView's own hidden/visible transition) and native Picture-in-Picture
// (NavPipPlugin/MainActivity.onPictureInPictureModeChanged sets the WebView
// to View.GONE then back to View.VISIBLE, which is exactly the kind of
// hide/show cycle known to leave a WebView's *hardware-composited* layers
// (this marker included — `.maplibregl-marker` is translated via a CSS
// `transform`, which Chromium promotes to its own compositor layer) stale
// or dropped until something explicitly forces a fresh paint. The map's
// own GL canvas repaints fine on its regular render loop, which is why the
// route line and instructions were never affected — this is specific to
// the marker's own compositor layer, not a general render freeze.
// map.resize() re-measures the (possibly stale) container size MapLibre
// last saw, and re-driving the puck through its normal update path with the
// last known fix (rather than waiting for the next real GPS update, which
// could be a while if the vehicle is stationary when the app comes back)
// forces MapLibre to recompute the marker's on-screen transform and
// re-apply it — cheap, idempotent, and exactly what the next real fix would
// have done anyway, just not delayed until one arrives.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (state.navigating && !wakeLockSentinel) acquireWakeLock();
  if (state.navigating && state.puckMarker && state.lastFix) {
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
  // Claimed immediately (before the await below) so a second tap landing
  // while this call is still waiting on the map — the resume-on-reload path
  // can genuinely be slow here, see the comment below — can't re-enter and
  // start a second GPS watch + wake lock that orphans the first one.
  state.navigating = true;
  // The idle "where am I" share (manual locate-button tap, or the silent
  // auto-start on app open) uses a separate watchPosition + marker from
  // real navigation's own tracking — stop it now so there's never two
  // overlapping GPS watches or two markers once the nav puck takes over.
  stopIdleLocationShare();
  // Lets MainActivity's onUserLeaveHint (native Picture-in-Picture mini
  // view — see native-pip.js) know it's now worth auto-entering PiP if the
  // user leaves the app. Native-only, and a rejected promise here (web, or
  // running outside the Android shell) is expected and harmless — never
  // anything navigation itself should fail over.
  if (isNativePlatform()) setPipNavigating(true).catch(() => {});
  // Every source this function touches below (route-alternates, puck) is
  // only ever added inside mapLoad's own .then() — normally guaranteed by
  // the time a real "Start navigation" tap is even possible (renderRoute
  // already awaited this earlier in that flow), but the resume-on-reload
  // path (see the startup IIFE) can reach here as the very first thing to
  // touch the map at all, before that's necessarily settled.
  resolverDebugLog('Awaiting map load…');
  try {
    await awaitMapLoad();
    resolverDebugLog('Map loaded.', 'success');
  } catch (err) {
    resolverDebugLog(`Map load failed: ${err.message}`, 'error');
    state.navigating = false;
    if (isNativePlatform()) setPipNavigating(false).catch(() => {});
    showStatus(err.message, 'error');
    return;
  }

  // state.route/state.to can have been cancelled out from under this call
  // while the await above was pending (e.g. a tap on Cancel) — state.navigating
  // was already claimed synchronously above specifically to block a second
  // concurrent Start tap, but nothing else guards against the route
  // disappearing mid-wait. Bail out cleanly instead of dereferencing a null
  // state.route/state.to below (confirmed live: this used to throw an
  // uncaught TypeError, leaving state.navigating stuck true forever with no
  // GPS watch and a leaked wake lock — every future Start tap then silently
  // no-op'd against the stale "already navigating" guard at the top).
  if (!state.route || !state.to) {
    resolverDebugLog('state.route/state.to disappeared while awaiting map load (route was cancelled) — aborting startNavigation.', 'warn');
    state.navigating = false;
    if (isNativePlatform()) setPipNavigating(false).catch(() => {});
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
    resetFlightTracking();
    state.lastTrafficRerouteAt = null; // a genuinely new trip — not reset by resetTrafficTracking itself, see its own comment
    state.navigationStartedAt = Date.now(); // real wall-clock elapsed time for the trip-summary panel — see endNavigation
    state.liveAscentM = 0; // accumulated live climb so far this trip — see onPositionUpdate/effortLevel
    state.liveDescentM = 0;
    state.lastElevationHeightM = null;
    acquireWakeLock(); // fire-and-forget — see the Screen Wake Lock section above

    // Confirms navigation is actually on, right away — otherwise the very
    // first thing a driver hears is whatever updateActiveManeuver's normal
    // distance-triggered logic happens to fire once the first GPS fix
    // arrives, which can be several seconds of silence, or nothing at all if
    // the first maneuver is a short "continue straight" segment below
    // CONTINUE_STRAIGHT_MIN_LENGTH_M. Never on a resume (page reload
    // mid-drive) — the driver is already moving, "starting navigation" would
    // be actively wrong, and state.currentManeuverIdx has just been reset to
    // 0 above purely so the ratchet in updateActiveManeuver can fast-forward
    // it back to the real position on the next fix, not because navigation
    // is actually restarting from maneuver 0.
    //
    // Reuses the exact same CONTINUE_STRAIGHT_TYPES/spokenContinue mechanism
    // updateActiveManeuver's own continue-straight announcement uses (same
    // length threshold, same phrasing), rather than a second implementation
    // of it — and marks maneuver 0 as already spoken there, so that once the
    // first real fix arrives moments later, the normal trigger doesn't
    // announce the exact same "Continue straight for X" a second time.
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

    // Marks the persisted trip as actively navigating (not just planned), so
    // if Android discards this tab under memory pressure and reloads it, the
    // startup resume path (below) restarts live navigation instead of
    // dropping back to the "tap Start again" planning screen — see
    // onPositionUpdate for the periodic re-save that keeps this current.
    saveCurrentTrip({ route: state.route, from: state.from, to: state.to, stops: getStops(), travelMode: state.travelMode, navigating: true, flightTracking: state.flightTrackingEnabled })
      .catch(() => { /* non-fatal: worst case a reload lands on the planning screen instead of resuming live */ });

    forgetBackLayerIfTop(resetToRouteView); // closing poi-results (if open) by side effect of starting to drive
    resetToRouteView(); // don't start driving mid-way through browsing "restaurants along the route"
    // Once driving, back should warn rather than silently discard the route —
    // Google Maps never lets a stray back press during turn-by-turn exit
    // navigation; only the explicit "End" button does that (see endNavigation).
    replaceTopBackLayer(navigatingBackGuard);
    el.searchCard.classList.add('hidden');
    el.placeCard.classList.add('hidden');
    el.navBanner.classList.remove('hidden');
    el.navSpeed.classList.remove('hidden');
    updateSpeedText(null); // fresh dash until the first fix arrives, rather than a stale reading left over from a previous trip
    refreshWeatherBadge(); // stays hidden until the first fix arrives (state.lastFix is null right after this reset)
    el.bottomSheet.classList.remove('expanded', 'half');
    el.startNavBtn.classList.add('hidden');
    el.cancelRouteBtn.classList.add('hidden');
    // Along-route search stays available while driving (see routeSearchScope) —
    // scoped to what's still ahead of you rather than the whole original route.
    // It moves from the inline row (under the now-hidden search card) to the
    // floating FAB+popover, which is reachable without the search card on screen.
    hideRouteChipsInline();
    showRouteSearchFeature();
    showEffortFeature(); // no-op outside walk mode
    el.routeOptionsRow.classList.add('hidden'); // no more switching routes once you're committed and driving
    map.getSource('route-alternates').setData(emptyFeatureCollection());
    el.endNavBtn.classList.remove('hidden');
    updateLocateBtnState();

    // The live puck takes over as the "where am I" marker — stop the idle
    // (non-navigating) location watch entirely rather than leaving it running
    // redundantly alongside navigation's own watch.
    if (state.originMarker) { state.originMarker.remove(); state.originMarker = null; }
    if (state.myLocationMarker) { state.myLocationMarker.remove(); state.myLocationMarker = null; }
    if (state.idleLocationWatchId != null) { navigator.geolocation.clearWatch(state.idleLocationWatchId); state.idleLocationWatchId = null; disableDeviceOrientation(); }

    showStatus('Getting your location…', 'info');
    resolverDebugLog('Calling startLocationWatch() — on the Android shell this requests the background-geolocation permission and can pause here waiting on that native dialog…');
    try {
      // On a plain web deployment this is navigator.geolocation.watchPosition
      // under the hood. Inside the optional Capacitor Android shell, it
      // instead starts a real Android foreground service via a
      // background-geolocation plugin, whose native callback feeds the exact
      // same onPositionUpdate() below — see native-location.js for why that
      // matters with the screen off.
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
    // Safety net for anything else unexpected between the map-load await
    // and here throwing — without this, state.navigating stays stuck true
    // forever (see the comment above the route/to null-check earlier in
    // this function for the exact failure mode that motivated this).
    resolverDebugLog(`startNavigation() failed: ${err.message}`, 'error');
    state.navigating = false;
    releaseWakeLock();
    if (isNativePlatform()) setPipNavigating(false).catch(() => {});
    showStatus('Could not start navigation: ' + err.message, 'error');
  }
}

/** `showSummary` is false for every "this ended because something went
 * wrong" call site (a location error, a startup failure) — a trip-summary
 * panel popping up right on top of an error toast would be jarring, not
 * useful. Only the two genuinely-intentional stops (arrival, and a manual
 * "End" tap) pass true. `arrived` just picks the panel's own wording. */
function endNavigation({ showSummary = false, arrived = false } = {}) {
  // Captured before any of the cleanup below resets/discards them — the
  // real distance actually covered and real elapsed wall-clock time, not
  // the originally *planned* totals renderRouteSummary below still shows
  // (that call is about restoring the planning screen's own summary line,
  // a separate and already-existing thing).
  const summary = showSummary ? {
    arrived,
    distanceM: state.traveledM || 0,
    elapsedS: state.navigationStartedAt ? (Date.now() - state.navigationStartedAt) / 1000 : 0,
    ascentM: state.travelMode === 'walk' ? state.liveAscentM : null,
    descentM: state.travelMode === 'walk' ? state.liveDescentM : null,
    effort: state.travelMode === 'walk' ? effortLevel() : null,
  } : null;

  // Direct call, not goBackInApp — this is the one explicit action allowed
  // to actually leave navigation; it restores the "route planned, not yet
  // driving" back-layer in its place rather than consuming a real back-press.
  replaceTopBackLayer(cancelPlannedRoute);
  if (state.watchId != null) stopLocationWatch(state.watchId).catch(() => { /* best-effort cleanup */ });
  state.watchId = null;
  state.navigating = false;
  releaseWakeLock();
  if (isNativePlatform()) setPipNavigating(false).catch(() => {}); // see the matching call in startNavigation

  if (state.puckMarker) { state.puckMarker.remove(); state.puckMarker = null; }
  // Stops whatever's still speaking (the arrival/deviation/turn prompt
  // that triggered this call, most often) — same native-vs-web split as
  // the voice-mode toggle above; speechSynthesis.cancel() alone is a
  // silent no-op on the native shell.
  if (isNativePlatform()) stopNative().catch(() => {}); // best-effort — ending navigation shouldn't be blocked by this
  else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  clearTraveledRouteSegment();
  resetTrafficTracking();
  resetFlightTracking();
  state.lastTrafficRerouteAt = null; // not reset by resetTrafficTracking itself, see its own comment

  el.navBanner.classList.add('hidden');
  el.navSpeed.classList.add('hidden');
  refreshWeatherBadge(); // re-evaluate now state.navigating is false — shows a place card's weather if one's still open, else hides
  el.endNavBtn.classList.add('hidden');
  el.startNavBtn.classList.remove('hidden');
  el.cancelRouteBtn.classList.remove('hidden');
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

  // Disabled: end-of-trip summary panel. Flip this back to true to
  // re-enable it — the fallback toast right below then stops firing on its
  // own, so re-enabling never leaves both showing at once.
  const TRIP_SUMMARY_PANEL_ENABLED = false;
  if (summary) {
    if (TRIP_SUMMARY_PANEL_ENABLED) {
      renderTripSummary(summary);
    } else {
      // Without the panel, arrival (and a manual "End") would otherwise
      // give no visual confirmation at all that the trip actually ended —
      // the spoken arrival announcement alone isn't reliable (muted
      // device, hearing impaired, noisy environment, or even cut short by
      // this function's own cancel/stopNative() above, confirmed live: the
      // utterance can get canceled just milliseconds after it starts,
      // before finishing). Same plain toast this app showed before the
      // summary panel existed.
      showStatus(summary.arrived ? 'You have arrived at your destination.' : 'Trip ended.', 'success');
    }
  }
}

/** Populates and opens the trip-summary panel (see endNavigation, the only
 * caller) — reports what actually happened on the trip just ended rather
 * than the originally planned totals. Elevation/effort rows are omitted
 * entirely outside walk mode (ascentM/descentM/effort are null there) or
 * if the route's own elevation data never resolved in time (ascentM stays
 * 0 either way, which just reads as "no climbing" — indistinguishable from
 * a genuinely flat walk, an acceptable ambiguity for a summary screen). */
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

el.startNavBtn.addEventListener('click', startNavigation);
el.endNavBtn.addEventListener('click', () => endNavigation({ showSummary: true }));

// ============================================================================
// PWA installability
// ============================================================================
// Skipped entirely inside the Capacitor Android shell — the app's assets
// are already bundled locally into the APK there, so a service worker's
// caching layer has no offline-support benefit and is pure downside: it's
// exactly what caused a real bug found live on-device (the Android WebView
// keeps Cache Storage/SW registrations across app rebuilds — an installed
// SW from before a code fix kept serving the OLD, pre-fix native-location.js
// out of its own cache, making the fix look like it hadn't taken effect at
// all, even after a clean rebuild). Any SW already registered from before
// this check existed is actively unregistered here so a device that hit
// that exact bug self-heals on the next launch, without needing anyone to
// manually clear the app's storage.
if ('serviceWorker' in navigator) {
  if (isNativePlatform()) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => { /* non-fatal */ });
    if ('caches' in window) {
      // Only the SW's own app-shell cache(s) — offline-tiles/incidental-tiles
      // are app.js's own downloaded-map-data caches, used on native too, and
      // must NOT be swept up here or this would silently delete a user's
      // already-downloaded offline maps.
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
// Startup: offer to resume an in-progress trip if the tab was reloaded or
// restarted mid-drive. Favorites/recents need no startup work of
// their own — they're loaded on demand when a search field is focused.
// ============================================================================

// Ask for GPS and show the live "you are here" dot the moment the app opens,
// rather than waiting for an explicit locate-button tap — silent (see
// startIdleLocationShare) so a first-run permission prompt or a previously-
// denied one doesn't also pop an unprompted status banner. Safe to call
// unconditionally even when the code below is about to auto-resume an
// active in-progress drive: startNavigation() stops this same idle share
// itself the moment it claims state.navigating, so there's never a moment
// with two overlapping watches/markers.
startIdleLocationShare({ silent: true });

const shareTargetText = parseShareTargetParam();
const sharedRoutePayload = shareTargetText ? null : parseShareParam();
if (shareTargetText) {
  // Same replaceState reasoning as the ?share= branch below: strips the
  // share-target params so reloading/going back doesn't keep re-resolving
  // the same shared link.
  history.replaceState(null, '', location.pathname);
  handleSharedGoogleMapsLink(shareTargetText);
} else if (sharedRoutePayload) {
  // Strips ?share=... via replaceState (not pushState) so it doesn't add a
  // closeable layer to the app's own back-stack, and so reloading/going back
  // afterward doesn't keep re-triggering the same shared link. A deliberately
  // opened share link always wins over resuming a stale local trip below.
  history.replaceState(null, '', location.pathname);
  applyShareLink(sharedRoutePayload);
} else {
  (async () => {
    try {
      const saved = await loadCurrentTrip();
      if (saved && saved.route && saved.to) {
        state.route = saved.route;
        state.route.lineFeature = turf.lineString(state.route.coords);
        state.from = saved.from;
        state.to = saved.to;
        state.travelMode = saved.travelMode || 'drive';
        modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === state.travelMode));
        updateStopsUiForTravelMode();
        // Otherwise session-only (see the flight-tracking toggle handler),
        // but a mid-trip reload — e.g. Android discarding a backgrounded
        // tab under memory pressure, same as the resume path just below —
        // shouldn't silently turn a feature off the user already turned on
        // for THIS trip without them doing anything. Harmless to set even
        // when the feature is off on this deployment; the button/handler
        // below just won't exist to read it.
        state.flightTrackingEnabled = !!saved.flightTracking;
        if (CONFIG.FLIGHT_TRACKING_ENABLED) {
          el.flightTrackingBtn.classList.toggle('active', state.flightTrackingEnabled);
          el.flightTrackingBtn.setAttribute('aria-label', `Flight tracking: ${state.flightTrackingEnabled ? 'on' : 'off'}`);
        }

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
          // The tab was actively navigating, not just planned, when this
          // reload happened — most likely Android discarding a backgrounded
          // tab under memory pressure (a real OS constraint no web app can
          // prevent, only work around like this). Resume straight back into
          // live navigation — GPS watch, wake lock, voice guidance — instead
          // of dropping to the "tap Start again" planning screen, which is
          // what used to make it feel like navigation had simply stopped.
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
      // Non-fatal: fall back to a fresh planning screen rather than a stuck
      // page — but silently, this left no trace of why an in-progress trip
      // didn't come back (confirmed live: a slow map load on resume throws
      // exactly this way, with nothing shown to the user beyond "the app
      // just forgot my trip"). A plain-language status at least explains it.
      console.error('Failed to restore in-progress trip:', err);
      showStatus("Couldn't restore your in-progress trip — starting fresh.", 'error');
    }
  })();
}
