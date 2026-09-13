// Native background-location bridge (Capacitor/Android). The only file that
// knows Capacitor exists; falls back to navigator.geolocation.watchPosition
// on plain web. Uses @capacitor-community/background-geolocation's Android
// foreground service because plain watchPosition gets suspended once the
// app is backgrounded or the screen locks.
// Note: this plugin's notification text is set once at watch start and
// can't be updated live (no live "next turn" text in the notification).

import { registerPlugin } from './vendor/capacitor-core.js';

export function isNativePlatform() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/** Prompts Android's "Turn on Location?" dialog if the location service is
 * off, before starting a watch (the background-geolocation plugin can't
 * prompt for this itself). No-op on web or if the plugin is missing. */
export async function ensureLocationEnabled() {
  if (!isNativePlatform()) return { enabled: true };
  try {
    const LocationSettings = registerPlugin('LocationSettings');
    return await LocationSettings.ensureEnabled();
  } catch (err) {
    return { enabled: true }; // plugin missing/errored — fall through to the normal watch error path
  }
}

/** Starts location updates. Returns an opaque handle for stopLocationWatch().
 * `onPosition` gets the same shape navigator.geolocation uses. `notification`
 * sets the Android foreground-service text (ignored on web). */
export async function startLocationWatch(onPosition, onError, geoOptions, notification = {}) {
  if (!isNativePlatform()) {
    const id = navigator.geolocation.watchPosition(onPosition, onError, geoOptions);
    return { isNative: false, id };
  }

  // Check enabled before calling addWatcher(): the plugin has a bug where a
  // disabled-location rejection still starts the foreground service anyway.
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
      distanceFilter: 2, // metres; filters GPS noise before it reaches JS
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
