// Native Picture-in-Picture bridge (Capacitor/Android): thin wrappers around
// NavPipPlugin.java. No platform check here — on web these calls just reject
// and callers are expected to .catch() them.
import { registerPlugin } from './vendor/capacitor-core.js';

const NavPip = registerPlugin('NavPip');

/** Tells native whether to auto-enter PiP on minimize. Call with `true`
 * when navigation starts, `false` when it ends. */
export function setNavigating(active) {
  return NavPip.setNavigating({ active });
}

/** Updates the PiP mini view's turn arrow/instruction/distance text. Call
 * whenever the on-screen nav banner updates. */
export function updateTurnCard({ maneuverKind, instruction, distanceText, etaText }) {
  return NavPip.updateTurnCard({ maneuverKind, instruction, distanceText, etaText });
}
