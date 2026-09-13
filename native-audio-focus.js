// Native audio-ducking bridge (Capacitor/Android): wraps AudioFocusPlugin.java
// to quiet other apps' audio while a turn-by-turn instruction is spoken.
// Ref-counted locally so native requestFocus/abandonFocus only fire at the
// actual 0→1 and 1→0 transitions. See native-tts.js for how calls are paired.
import { CONFIG } from './config.js';
import { registerPlugin } from './vendor/capacitor-core.js';

const AudioFocus = registerPlugin('AudioFocus');

let activeCount = 0;

// Pending debounced abandonFocus() timer, so it can be canceled or flushed.
let releaseTimer = null;

/** Call immediately before starting a spoken instruction. */
export function requestDucking() {
  activeCount += 1;
  if (releaseTimer != null) {
    // Release hasn't reached native yet, so cancel it and reuse the held focus.
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

/** Call once per matching requestDucking() call when that instruction ends.
 * Debounces the actual native release so back-to-back prompts don't cause
 * an audible stutter on some Bluetooth receivers. */
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

/** Cancels any pending release and abandons focus immediately, for when
 * navigation is ending. See stopNative() in native-tts.js. */
export function flushDucking() {
  if (releaseTimer != null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  activeCount = 0;
  console.log(`[audio-focus] ${Date.now()} flush: native abandonFocus() (navigation ending)`);
  return AudioFocus.abandonFocus();
}
