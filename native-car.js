// ============================================================================
// Android Auto bridge (Capacitor / Android shell only).
//
// Mirrors native-pip.js's shape, aimed at a second, independent native UI
// surface — the Car App Library's NavigationTemplate, shown on a connected
// Android Auto head unit — rather than the PiP mini-view. See CarNavPlugin.java
// and CarNavState.java. On web, calling either export below just rejects
// (Capacitor's own vendored registerPlugin proxy does this for any
// plugin/method with no web implementation) — callers are expected to
// .catch() it, same as every other native-only call in this codebase.
// ============================================================================
import { registerPlugin } from './vendor/capacitor-core.js';

const CarNav = registerPlugin('CarNav');

/** Tells native whether a car session should show the live NavigationTemplate
 * or the idle placeholder — call with `true` right when navigation starts,
 * `false` when it ends. Same call sites as native-pip.js's setNavigating. */
export function setNavigating(active) {
  return CarNav.setNavigating({ active });
}

/** Pushes the current turn-by-turn state to the car screen — call every time
 * the on-screen nav banner updates (see updateActiveManeuver in app.js), same
 * tick as native-pip.js's updateTurnCard. Unlike the PiP version, this takes
 * raw numbers instead of pre-formatted text: the Car App Library's
 * RoutingInfo/TravelEstimate need a real Distance object natively, not a
 * string, so the meters-to-km/mi formatting decision belongs on the native
 * side (see NavigationScreen.java), not baked into a string here. */
export function updateTurnCard({ maneuverKind, instruction, stepDistM, remainingDistM, remainingTimeS }) {
  return CarNav.updateTurnCard({ maneuverKind, instruction, stepDistM, remainingDistM, remainingTimeS });
}

/** Pushes the full route line to the car screen's map — call once per route
 * computed or rerouted (see renderRoute in app.js), not on every tick.
 * `coordinates` is the same [lng, lat] pair array as state.route.coords. */
export function updateRoute({ coordinates }) {
  return CarNav.updateRoute({ coordinates });
}

/** Pushes destination/stop pins to the car screen's map — same call site and
 * cadence as updateRoute (once per route computed/rerouted). `destination`
 * is {lng, lat} or omitted if there's no destination yet; `stops` is an
 * array of {lng, lat} in visit order, same convention as the phone's own
 * numbered stop pins (see updatePlanningMarkers in app.js). */
export function updateWaypoints({ destination, stops }) {
  return CarNav.updateWaypoints({ destination, stops });
}

/** Pushes the live position + heading to the car screen's map — call at the
 * same cadence onPositionUpdate already runs at (same tick that drives the
 * WebView puck/camera). */
export function updatePosition({ lng, lat, headingDeg }) {
  return CarNav.updatePosition({ lng, lat, headingDeg });
}

/** Fires when the car screen's own Stop button is tapped (see
 * NavigationScreen.buildActionStrip/CarNavPlugin's load()) — the reverse
 * direction from everything above. Callers wire this straight into the
 * phone's own end-nav-btn, not a separate implementation. */
export function onStopRequested(callback) {
  return CarNav.addListener('stopRequested', callback);
}

/** Fires when the car screen's own mute/voice button is tapped — same
 * reverse-direction shape as onStopRequested, wired into voice-mode-btn. */
export function onToggleVoiceRequested(callback) {
  return CarNav.addListener('toggleVoiceRequested', callback);
}

/** Drives the car screen's Mute icon (speaker-with-waves vs. speaker-with-X)
 * — call from renderVoiceModeBtn() so the phone and car icons always change
 * together. `mode` is the same value as state.voiceMode ("all"/"off"). */
export function setVoiceMode(mode) {
  return CarNav.setVoiceMode({ mode });
}

/** Fires when a category is picked on the car's search-along-route screen
 * (CarSearchScreen). `tag` is an OSM tag string, same shape as
 * CHIP_CATEGORY_TAGS' values — pass straight to categorySearchAlongRoute(). */
export function onSearchRequested(callback) {
  return CarNav.addListener('searchRequested', callback);
}

/** Reports search results back to CarSearchResultsScreen. `results` is an
 * array of {label, distanceText} (both pre-formatted JS-side); omit (pass
 * undefined/null) together with `error` to report a failed search instead. */
export function updateSearchResults({ results, error }) {
  return CarNav.updateSearchResults({ results, error });
}

/** Fires when a row is tapped on the car's search results screen — `index`
 * is into the same results array most recently sent via updateSearchResults. */
export function onSearchResultSelected(callback) {
  return CarNav.addListener('searchResultSelected', callback);
}

/** Fires as the driver types into the car's "Where to?" destination search
 * (CarDestinationSearchScreen) — a different feature from onSearchRequested
 * above (that one searches *along an already-active route*; this one plans
 * a brand-new trip). `query` is free text, same shape geocodeSearch()
 * already takes. Results report back via updateSearchResults, same as the
 * along-route search — the two screens are never open at once. */
export function onDestinationSearchRequested(callback) {
  return CarNav.addListener('destinationSearchRequested', callback);
}

/** Fires when a row is tapped on the car's destination search results —
 * `index` is into the same results array most recently sent via
 * updateSearchResults. */
export function onDestinationSelected(callback) {
  return CarNav.addListener('destinationSelected', callback);
}
