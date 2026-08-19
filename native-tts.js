// Native (Android shell) text-to-speech — a separate path from the Web
// Speech API used everywhere else (see speak() in app.js). Confirmed live
// via the on-screen debug log that `'speechSynthesis' in window` is
// `false` inside the Capacitor shell's WebView: unlike a normal Chrome tab,
// Android's embedded WebView has never implemented the Web Speech
// Synthesis API at all — no amount of retrying/priming voices fixes that,
// it's a platform gap, not a timing bug. @capacitor-community/text-to-speech
// wraps Android's real `android.speech.tts.TextToSpeech` engine instead.
import { TextToSpeech } from './vendor/capacitor-text-to-speech.js';

// QueueStrategy.Flush (0) — stop whatever's currently speaking and speak
// this instead, mirroring the web path's `speechSynthesis.cancel()` before
// every prompt so turn instructions never queue up and play late/overlap.
const QUEUE_STRATEGY_FLUSH = 0;

/** Speaks `text` via the native TTS engine. Returns the plugin's promise
 * (rejects on failure) so callers can log/handle errors themselves. */
export function speakNative(text) {
  return TextToSpeech.speak({ text, queueStrategy: QUEUE_STRATEGY_FLUSH });
}
