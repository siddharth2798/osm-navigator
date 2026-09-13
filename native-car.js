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
