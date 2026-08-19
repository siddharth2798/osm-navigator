// Minimal vendored wrapper for @capacitor-community/text-to-speech — same
// vendoring rationale as vendor/capacitor-core.js: this project has no
// bundler, so a bare `import ... from '@capacitor-community/text-to-speech'`
// specifier can't resolve in a plain browser/WebView.
//
// Deliberately registered with NO 'web' implementation. This app never
// calls this plugin outside isNativePlatform() — on the plain web/PWA
// build, voice guidance keeps using the browser's own Web Speech API
// directly (see speak() in app.js), so there's nothing here for a web
// fallback to do. Confirmed via reading vendor/capacitor-core.js's
// registerPlugin: when a native plugin header exists (i.e. running inside
// the Capacitor shell, after `cap sync` has linked this plugin's Android
// module), method calls route straight to the native bridge regardless of
// whether a 'web' implementation was supplied — so omitting it here is
// safe, not just untested.
import { registerPlugin } from './capacitor-core.js';

export const TextToSpeech = registerPlugin('TextToSpeech');
