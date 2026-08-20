// ============================================================================
// Native Picture-in-Picture mini-view bridge (Capacitor / Android shell only).
//
// Mirrors native-tts.js's shape: thin wrappers around a small custom native
// plugin (NavPipPlugin.java), with no platform check of its own — callers
// in app.js already know whether they're running natively (see
// isNativePlatform in native-location.js) before ever importing/calling
// this. On web, calling either export below just rejects (Capacitor's own
// vendored registerPlugin proxy does this for any plugin/method with no web
// implementation) — callers are expected to .catch() it, same as every
// other native-only call in this codebase.
// ============================================================================
import { registerPlugin } from './vendor/capacitor-core.js';

const NavPip = registerPlugin('NavPip');

/** Tells native whether entering PiP on minimize currently makes sense —
 * call with `true` right when navigation starts, `false` when it ends.
 * MainActivity's onUserLeaveHint only auto-enters PiP while this is true. */
export function setNavigating(active) {
  return NavPip.setNavigating({ active });
}

/** Pushes the current turn-by-turn state to the native PiP mini view's
 * arrow/instruction/distance text — call every time the on-screen nav
 * banner updates (see updateActiveManeuver in app.js), so the mini view
 * shown while backgrounded is never stale. `maneuverKind` is a small fixed
 * icon-key string (see maneuverPipIconKey in app.js) rather than a raw
 * Valhalla maneuver type number, so native just does a simple lookup
 * against its own arrow drawables instead of needing to know Valhalla's
 * numbering at all. */
export function updateTurnCard({ maneuverKind, instruction, distanceText, etaText }) {
  return NavPip.updateTurnCard({ maneuverKind, instruction, distanceText, etaText });
}
