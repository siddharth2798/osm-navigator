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
// registerPlugin() is imported from vendor/capacitor-core.js, not read off
// window.Capacitor — the native Android side only injects a minimal stub
// (isNativePlatform/getPlatform), NOT the full @capacitor/core JS runtime
// that actually defines registerPlugin. This app has no build step, so
// nothing else ever pulls that runtime in either; importing the vendored
// copy is what makes window.Capacitor.registerPlugin (and this import)
// actually work at all. Confirmed live: without it, startLocationWatch()
// failed with "window.Capacitor.registerPlugin is not a function" on a
// real Android build.
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

import { registerPlugin } from './vendor/capacitor-core.js';

export function isNativePlatform() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/** Granting the ACCESS_FINE_LOCATION *permission* (handled entirely by
 * @capacitor-community/background-geolocation below) is a separate thing
 * from the device's Location *service* actually being switched on — that
 * plugin detects a disabled service and rejects the watch outright, but has
 * no way to prompt the user to fix it (confirmed by reading its source: no
 * SettingsClient/ResolvableApiException handling anywhere in it). This is a
 * small custom native plugin (see LocationSettingsPlugin.java,
 * MainActivity.ensureLocationEnabled) using Play Services' SettingsClient —
 * the standard API for this — to show Android's own "Turn on Location?"
 * system dialog when the service is off, *before* ever starting a watch
 * that would otherwise just silently fail. No-ops (resolves as already
 * enabled) on plain web or if the plugin isn't present (e.g. this device
 * has no Google Play Services) — callers should still handle a watch error
 * afterwards regardless, this is a proactive nudge, not a guarantee. */
export async function ensureLocationEnabled() {
  if (!isNativePlatform()) return { enabled: true };
  try {
    const LocationSettings = registerPlugin('LocationSettings');
    return await LocationSettings.ensureEnabled();
  } catch (err) {
    return { enabled: true }; // plugin missing/errored — let the normal watch error path handle it
  }
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

  // Must actually check the result, not just await it: @capacitor-community/
  // background-geolocation's own addWatcher() has a real bug (confirmed by
  // reading its source) where both its permission-denied AND its
  // location-service-disabled rejection branches are missing a `return` —
  // execution falls through and starts a real Android foreground service
  // (complete with a persistent notification) regardless, which then has no
  // JS-side handle to ever clean up since this call already threw before
  // state.watchId could be assigned. Throwing here instead of calling
  // addWatcher() at all when the user declined the "Turn on Location?"
  // dialog avoids ever reaching that plugin bug in the first place.
  const { enabled } = await ensureLocationEnabled();
  if (!enabled) {
    throw new Error('Location is turned off on this device. Turn it on to use turn-by-turn navigation.');
  }
  const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
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
  const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
  await BackgroundGeolocation.removeWatcher({ id: handle.id });
}
