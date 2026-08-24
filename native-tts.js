// Native (Android shell) text-to-speech — a separate path from the Web
// Speech API used everywhere else (see speak() in app.js). Confirmed live
// via the on-screen debug log that `'speechSynthesis' in window` is
// `false` inside the Capacitor shell's WebView: unlike a normal Chrome tab,
// Android's embedded WebView has never implemented the Web Speech
// Synthesis API at all — no amount of retrying/priming voices fixes that,
// it's a platform gap, not a timing bug. @capacitor-community/text-to-speech
// wraps Android's real `android.speech.tts.TextToSpeech` engine instead.
import { TextToSpeech } from './vendor/capacitor-text-to-speech.js';
import { requestDucking, releaseDucking } from './native-audio-focus.js';

// QueueStrategy.Flush (0) — stop whatever's currently speaking and speak
// this instead, mirroring the web path's `speechSynthesis.cancel()`.
// QueueStrategy.Add (1) — let the in-flight utterance finish first, same
// idea as the web path skipping `cancel()` when `queue: true` (see speak()
// in app.js) — used for back-to-back turn-guidance prompts so the first
// one isn't truncated mid-sentence by the next.
const QUEUE_STRATEGY_FLUSH = 0;
const QUEUE_STRATEGY_ADD = 1;

// Keep this in sync with VOICE_URI_STORAGE_KEY in app.js — this module has
// no import of app.js's constants (it's loaded standalone), so the literal
// key is duplicated deliberately, same pattern as TILE_CACHE_NAME between
// config.js and sw.js.
const VOICE_URI_STORAGE_KEY = 'preferredVoiceURI';

// getSupportedVoices() returns { voices }, each carrying a voiceURI the
// Settings picker in app.js stores by — but TTSOptions.speak() only accepts
// a voice *index* into this exact array, not a URI, so the array itself
// has to be cached and re-searched by URI at speak() time.
let cachedNativeVoices = [];

/** Fetches and caches the device's available TTS voices — called once at
 * startup (see app.js) so both the Settings picker and speakNative() below
 * have a populated list as early as possible, mirroring primeSpeechVoices()
 * on the web path. */
export async function primeNativeVoices() {
  const { voices } = await TextToSpeech.getSupportedVoices();
  cachedNativeVoices = voices || [];
  return cachedNativeVoices;
}

// Every in-flight speak() call's own ducking-release callback, keyed by
// nothing but Set membership — needed because a Flush-strategy call can
// silently strand whatever was still speaking. Confirmed by reading the
// plugin's own Java source (TextToSpeech.java): a Flush calls stop(),
// which does `requests.clear()` with no onDone/onError for whatever
// utterance was mid-flight — that utterance's JS promise then never
// settles at all. Without this, a naive "release ducking when this call's
// own promise settles" would leak one increment per interrupted
// instruction, so ducking would engage once during navigation and then
// never let go for the rest of the session (music would stay quiet even
// after guidance stopped). A Flush releases every currently-pending entry
// here on its own behalf before requesting its own turn, instead.
const pendingReleases = new Set();

/** Speaks `text` via the native TTS engine. Returns the plugin's promise
 * (rejects on failure) so callers can log/handle errors themselves. */
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
  if (voiceIndex !== -1) speakOptions.voice = voiceIndex; // index into getSupportedVoices()'s array — see TTSOptions.voice
  const promise = TextToSpeech.speak(speakOptions);
  // Deliberately not returned — this is a side-effect chain that always
  // releases ducking once this call settles (however it ends), completely
  // independent of whether the caller below ever awaits/catches `promise`
  // itself. The trailing catch just swallows this chain's own copy of a
  // rejection so it can never surface as a second, unrelated unhandled
  // rejection alongside whatever the real caller does with `promise`.
  promise.finally(release).catch(() => {});
  return promise;
}
