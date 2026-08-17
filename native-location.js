// ============================================================================
// Native background-location bridge (Capacitor / Android)
//
// This file is the ONLY place in the app that knows Capacitor exists. In a
// plain browser (the normal GitHub-Pages/Cloudflare-Pages deployment),
// `window.Capacitor` simply doesn't exist — Capacitor's native WebView is
// what injects it — so every function here transparently falls back to
// navigator.geolocation.watchPosition, the same plain-browser codepath used
// everywhere else. app.js's startNavigation()/endNavigation() call
// startLocationWatch()/stopLocationWatch() from here instead of the raw
// geolocation API directly; nothing else in the app's map/routing/voice
// logic needs to know or care which path is active.
//
// WHY THIS EXISTS: the base Capacitor Geolocation plugin (and plain
// watchPosition) is not reliable once Android puts the app in the
// background or the screen locks — Android's power management can suspend
// JS timers and kill GPS callbacks outside of a foreground service.
// @capacitor-community/background-geolocation wraps a real Android
// foreground service (with the persistent notification Android requires for
// it), which is exempt from those restrictions and delivers location fixes
// from native code straight into the JS callback below — bypassing
// watchPosition entirely. Since that callback is the *same* onPositionUpdate
// used everywhere else, maneuver-advance and voice guidance are driven
// directly off the native callback while backgrounded too, not off a
// browser timer — this is the "hook the plugin's callback directly" the
// spec asked for, and it falls out naturally from reusing one function.
//
// NOT VERIFIED ON DEVICE: this environment has no Android SDK/emulator, so
// none of the native-path code below has been run. It's written directly
// against the plugin's documented API (github.com/capacitor-community/
// background-geolocation) and Capacitor's documented no-bundler
// registerPlugin() pattern, but treat it as a first draft to test on a real
// phone, not a verified-working implementation.
//
// KNOWN LIMITATION: this plugin's notification text is set once, when the
// watch starts, and cannot be updated live afterwards (its API has no
// "update" call) — so the persistent Android notification can say
// "Navigating to <destination>" but not a live-updating "next: turn left in
// 200m". Transistor Software's @transistorsoft/capacitor-background-
// geolocation supports live notification updates via setConfig(), at the
// cost of being a commercial/licensed plugin rather than this free one —
// swap to it here if that live-updating notification matters more than
// avoiding a paid dependency.
// ============================================================================

function isNativePlatform() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/** Starts location updates. Returns a handle to pass to stopLocationWatch()
 * — its shape differs by platform, so treat it as opaque. `onPosition` is
 * called with the same {coords:{latitude,longitude,heading,speed,accuracy},
 * timestamp} shape navigator.geolocation already uses, whichever path is
 * active. `notification` ({title, message}) sets the Android foreground-
 * service notification text (native path only; ignored on plain web). */
export async function startLocationWatch(onPosition, onError, geoOptions, notification = {}) {
  if (!isNativePlatform()) {
    const id = navigator.geolocation.watchPosition(onPosition, onError, geoOptions);
    return { isNative: false, id };
  }

  const BackgroundGeolocation = window.Capacitor.registerPlugin('BackgroundGeolocation');
  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: notification.title || 'Navigating',
      backgroundMessage: notification.message || 'Tracking your location for turn-by-turn guidance.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 2, // metres; filters GPS noise at the native layer before it ever reaches JS — low enough that a slow turn still delivers fixes promptly
    },
    (location, error) => {
      if (error) { onError(error); return; }
      onPosition({
        coords: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          heading: location.bearing,
          speed: location.speed,
        },
        timestamp: location.time || Date.now(),
      });
    },
  );
  return { isNative: true, id };
}

export async function stopLocationWatch(handle) {
  if (!handle) return;
  if (!handle.isNative) {
    navigator.geolocation.clearWatch(handle.id);
    return;
  }
  const BackgroundGeolocation = window.Capacitor.registerPlugin('BackgroundGeolocation');
  await BackgroundGeolocation.removeWatcher({ id: handle.id });
}
