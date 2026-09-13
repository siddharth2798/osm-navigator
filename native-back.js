// Handles the Android hardware/gesture back button, which Capacitor does not
// route to JS by default (it would otherwise just exit the app).
import { App } from './vendor/capacitor-app.js';

/** Routes the hardware/gesture back button through the same close-top-overlay
 * logic as the browser back button (see app.js's popstate listener). */
export function initNativeBackButton({ hasOpenLayer, goBack }) {
  App.addListener('backButton', () => {
    if (hasOpenLayer()) goBack();
    else App.exitApp();
  });
}
