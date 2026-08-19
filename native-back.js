// Native (Android shell) hardware/gesture back-button handling — a separate
// path from the browser-back-button handling used everywhere else (see the
// backStack/popstate mechanism in app.js). Confirmed live: Capacitor's own
// BridgeActivity registers no OnBackPressedCallback and dispatches nothing
// to JS for the hardware/gesture back button by default — without this
// plugin, pressing back anywhere in the shell (including on top of an open
// overlay like Help & documentation) falls straight through to Android's
// default "finish the activity" behaviour and exits the app entirely,
// bypassing the app's own back-stack completely.
import { App } from './vendor/capacitor-app.js';

/** Routes the hardware/gesture back button through `goBackInApp` exactly
 * like a browser back button already does — same close-the-top-overlay
 * behaviour app.js's popstate listener gives every other back-stack layer
 * (Help & documentation, saved places, offline maps, Mapillary viewer,
 * etc), instead of introducing a second, parallel back-handling path.
 * Falls through to `App.exitApp()` only once nothing is left open, i.e.
 * only at the same "root" point the browser back button would otherwise
 * leave the page entirely. */
export function initNativeBackButton({ hasOpenLayer, goBack }) {
  App.addListener('backButton', () => {
    if (hasOpenLayer()) goBack();
    else App.exitApp();
  });
}
