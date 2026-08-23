// ============================================================================
// Native audio-ducking bridge (Capacitor / Android shell only).
//
// Mirrors native-pip.js's shape: thin wrappers around a small custom native
// plugin (AudioFocusPlugin.java). Holding transient "duck" audio focus is
// what makes the OS quieten other apps' audio (e.g. music playing over
// Bluetooth, at full volume, right on top of a spoken turn-by-turn
// instruction — confirmed live as unusably loud together) for as long as
// this app holds it; releasing it is what lets that audio back up to full
// volume again. See native-tts.js for how these two calls get paired
// around each spoken instruction, including why a naive 1:1 pairing per
// speak() call isn't safe.
//
// Ref-counted here rather than in the native plugin itself, purely so
// requestFocus/abandonFocus only round-trip to native at the actual 0→1 and
// 1→0 transitions — multiple overlapping "still speaking" callers in
// between just adjust this local count.
// ============================================================================
import { registerPlugin } from './vendor/capacitor-core.js';

const AudioFocus = registerPlugin('AudioFocus');

let activeCount = 0;

/** Call immediately before starting a spoken instruction. */
export function requestDucking() {
  activeCount += 1;
  if (activeCount === 1) return AudioFocus.requestFocus();
  return Promise.resolve();
}

/** Call exactly once per matching requestDucking() call, once that
 * instruction is done (however it ends) — see native-tts.js. Only actually
 * releases focus once every overlapping instruction has finished. */
export function releaseDucking() {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) return AudioFocus.abandonFocus();
  return Promise.resolve();
}
