// Minimal vendored wrapper for @capacitor/app — same vendoring rationale as
// vendor/capacitor-core.js: this project has no bundler, so a bare
// `import ... from '@capacitor/app'` specifier can't resolve in a plain
// browser/WebView.
//
// Deliberately registered with NO 'web' implementation, same reasoning as
// vendor/capacitor-text-to-speech.js: this app never calls this plugin
// outside isNativePlatform() (see native-back.js) — the plain web/PWA build
// already has its own hardware-back-button-free navigation (browser back
// button already drives the existing popstate-based back-stack in app.js
// directly), so there's nothing here for a web fallback to do.
import { registerPlugin } from './capacitor-core.js';

export const App = registerPlugin('App');
