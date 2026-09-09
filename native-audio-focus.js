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
import { CONFIG } from './config.js';
import { registerPlugin } from './vendor/capacitor-core.js';

const AudioFocus = registerPlugin('AudioFocus');

let activeCount = 0;

// Debounces the actual native abandonFocus() call — see releaseDucking's
// own comment below for why. Tracked here (not as a plain boolean) so
// requestDucking can cancel a pending one and flushDucking can fire it
// immediately.
let releaseTimer = null;

/** Call immediately before starting a spoken instruction. */
export function requestDucking() {
  activeCount += 1;
  if (releaseTimer != null) {
    // A release was scheduled but hasn't actually reached native yet —
    // focus was never really abandoned, so just cancel it and keep using
    // what's already held instead of round-tripping to native again.
    clearTimeout(releaseTimer);
    releaseTimer = null;
    console.log(`[audio-focus] ${Date.now()} request: reused (pending release canceled)`);
    return Promise.resolve();
  }
  if (activeCount === 1) {
    console.log(`[audio-focus] ${Date.now()} request: native requestFocus()`);
    return AudioFocus.requestFocus();
  }
  return Promise.resolve();
}

/** Call exactly once per matching requestDucking() call, once that
 * instruction is done (however it ends) — see native-tts.js. Only actually
 * schedules a release once every overlapping instruction has finished.
 *
 * Doesn't call AudioFocus.abandonFocus() immediately — it's debounced by
 * CONFIG.VOICE_DUCK_RELEASE_GRACE_MS instead, and canceled if
 * requestDucking() is called again before that timer fires (a closely-
 * following prompt reuses the still-held focus rather than a full
 * release-then-reacquire round trip). Two back-to-back prompts (a far cue
 * immediately followed by a near cue, or two combined maneuvers) would
 * otherwise duck, undock to full volume for the gap between them, then
 * duck again a moment later — some Bluetooth receivers render that
 * flicker as an audible stutter/cutout rather than a single clean duck. */
export function releaseDucking() {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount !== 0) return Promise.resolve();
  console.log(`[audio-focus] ${Date.now()} release: scheduled in ${CONFIG.VOICE_DUCK_RELEASE_GRACE_MS}ms`);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    console.log(`[audio-focus] ${Date.now()} release: native abandonFocus() (grace window elapsed)`);
    AudioFocus.abandonFocus();
  }, CONFIG.VOICE_DUCK_RELEASE_GRACE_MS);
  return Promise.resolve();
}

/** Cancels any pending debounced release and abandons focus immediately —
 * for when navigation is genuinely ending, where the grace window in
 * releaseDucking above would otherwise delay letting go of ducked audio
 * for no reason. See stopNative() in native-tts.js. */
export function flushDucking() {
  if (releaseTimer != null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  activeCount = 0;
  console.log(`[audio-focus] ${Date.now()} flush: native abandonFocus() (navigation ending)`);
  return AudioFocus.abandonFocus();
}
