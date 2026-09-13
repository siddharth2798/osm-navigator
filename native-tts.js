// Native (Android shell) text-to-speech — a separate path from the Web Speech
// API used elsewhere (see speak() in app.js), since Android's WebView has no
// Web Speech Synthesis support. Wraps Android's real TextToSpeech engine via
// @capacitor-community/text-to-speech.
import { TextToSpeech } from './vendor/capacitor-text-to-speech.js';
import { requestDucking, releaseDucking, flushDucking } from './native-audio-focus.js';

// Flush (0): stop current speech and speak this instead. Add (1): let the
// in-flight utterance finish first (used for back-to-back prompts).
const QUEUE_STRATEGY_FLUSH = 0;
const QUEUE_STRATEGY_ADD = 1;

// Must match VOICE_URI_STORAGE_KEY in app.js (duplicated since this module
// is loaded standalone, with no import of app.js's constants).
const VOICE_URI_STORAGE_KEY = 'preferredVoiceURI';

// speak() needs a voice index into this array, not a URI, so it's cached
// here and searched by URI at speak() time.
let cachedNativeVoices = [];

/** Fetches and caches the device's available TTS voices. Call once at startup. */
export async function primeNativeVoices() {
  const { voices } = await TextToSpeech.getSupportedVoices();
  cachedNativeVoices = voices || [];
  return cachedNativeVoices;
}

// Ducking-release callbacks for in-flight speak() calls. A Flush call's
// stop() never settles the promise of whatever it interrupted, so a Flush
// releases every pending entry here itself to avoid leaking ducking requests.
const pendingReleases = new Set();

/** Speaks `text` via the native TTS engine. Returns the plugin's promise. */
export function speakNative(text, { queue = false } = {}) {
  if (!queue) {
    pendingReleases.forEach((release) => release());
    pendingReleases.clear();
  }
  requestDucking();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    pendingReleases.delete(release);
    releaseDucking();
  };
  pendingReleases.add(release);
  const speakOptions = { text, queueStrategy: queue ? QUEUE_STRATEGY_ADD : QUEUE_STRATEGY_FLUSH };
  const preferredURI = localStorage.getItem(VOICE_URI_STORAGE_KEY);
  const voiceIndex = preferredURI ? cachedNativeVoices.findIndex((v) => v.voiceURI === preferredURI) : -1;
  if (voiceIndex !== -1) speakOptions.voice = voiceIndex; // index into getSupportedVoices()'s array
  const promise = TextToSpeech.speak(speakOptions);
  // Separate chain (not returned) so ducking always releases regardless of
  // whether the caller awaits/catches `promise` itself.
  promise.finally(release).catch(() => {});
  return promise;
}

/** Stops the native TTS engine and clears its queue — the native counterpart
 * to window.speechSynthesis.cancel(). Also releases all pending ducking
 * requests, since stop() never settles their promises on its own. */
export async function stopNative() {
  try {
    await TextToSpeech.stop();
  } finally {
    pendingReleases.forEach((release) => release());
    pendingReleases.clear();
    flushDucking(); // skip releaseDucking's debounce grace window; navigation is ending
  }
}
