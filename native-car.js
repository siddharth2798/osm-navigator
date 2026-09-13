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
