# The optional Android shell

The web app also works wrapped in [Capacitor](https://capacitorjs.com/) as a native Android app, for reliable location tracking and voice guidance with the screen off or the app minimized (plain `watchPosition` isn't reliable once Android backgrounds the WebView, and `WebView.onPause()` freezes all JS on top of that). Needs Node/npm; the web app itself still doesn't.

```
npm install                  # @capacitor/core, @capacitor/android, background-geolocation/text-to-speech/app plugins
npm run cap:sync             # copies the web app into www/, syncs the android/ project
npx cap open android         # opens the project in Android Studio
```

**Don't want to build it yourself?** A pre-built APK, always the most recent release: **[download](https://github.com/siddharth2798/osm-navigator/releases/latest/download/osm-navigator.apk)**. It isn't distributed through Google Play, so Android will ask permission to install from this source the first time — only allow that for a source you trust, or build it yourself instead.

**Build requirements** (as checked into `android/`): Android Gradle Plugin `8.13.0` / Gradle `8.14.3`, needing **JDK 21** (`@capacitor/android` 8.x sets Java 21 source/target compatibility) — a recent [Android Studio](https://developer.android.com/studio) bundles a compatible JDK and will prompt to install SDK Platform 36 if needed.

**Permissions**: `@capacitor-community/background-geolocation` declares what it needs in its own manifest, merged in automatically. Android 13+ separately needs the `POST_NOTIFICATIONS` runtime permission for the persistent tracking notification — see the [plugin's README](https://github.com/capacitor-community/background-geolocation#readme).

**Producing a release build**: `npx cap open android` gives a debug build for USB/emulator testing. A signed release APK needs your own keystore — this repo doesn't include one (never commit a keystore). Use Android Studio's **Build → Generate Signed Bundle/APK** wizard, or see [Capacitor's guide](https://capacitorjs.com/docs/android/deploying-to-google-play).

**CI-built APK** (`.github/workflows/daily-release.yml`): builds and attaches `osm-navigator.apk` to a release on every push to `main` — this is what the download link above always points at. Multiple pushes on the same day update that same day's release rather than creating a new one. Signs with the same keystore you'd use locally, read from four repo secrets so the keystore itself is never committed:

```
base64 -i your-release-key.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD --body "..."
gh secret set ANDROID_KEY_ALIAS --body "..."
gh secret set ANDROID_KEY_PASSWORD --body "..."
```

Without these, the release is still created, just without an APK attached.

Also worth knowing: `@capacitor-community/background-geolocation`'s notification text is set once and can't update live afterward. [`@transistorsoft/capacitor-background-geolocation`](https://github.com/transistorsoft/capacitor-background-geolocation) supports that, but is a commercial plugin.

**Picture-in-Picture on some OEM Android skins (e.g. MIUI/HyperOS) may need a manual permission grant.** These skins gate PiP behind their own per-app permission (Settings → Privacy protection → Special permissions → Picture-in-picture), defaulted off for every non-preinstalled app. If PiP doesn't auto-enter when minimizing during navigation, grant it directly:
```
adb shell appops set com.navigator.app PICTURE_IN_PICTURE allow
```
`adb logcat -s NavPip` after minimizing shows exactly why it didn't enter, if it's still not working after that.

**`TOMTOM_FEATURES_ENABLED`'s `/api/traffic` and `/api/places` calls work on the Android shell** — `app.js` uses the same `isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : ''` prefix pattern the Google Maps link resolver already uses, and the routes are wired into `worker.js` (`lib/tomtom-traffic-proxy.js`/`lib/tomtom-places-proxy.js`).

**Android Auto (phone projection, `android-auto` branch, personal/developer use only — not merged to `main`, no Play Store distribution).** A genuinely separate native UI surface (`androidx.car.app`, package `com.navigator.app.auto`) alongside the WebView: `CarNavService` → `CarNavSession` → `NavigationScreen`, fed by `CarNavState` (a plain singleton) which `CarNavPlugin`/`native-car.js` write into from the same `app.js` call sites that already drive the PiP mini-view (`native-pip.js`). All three phases from the original plan are done: live turn-by-turn text/ETA (`NavigationTemplate`/`RoutingInfo`), a real rendered map, and voice guidance (already worked automatically — see below).

The map is a second, offscreen `WebView` loaded with `car-map.html` (a standalone map-only page, no Capacitor bridge, MapLibre vendored locally under `android/app/src/main/assets/vendor/` rather than fetched from a CDN every session), presented onto the Car App's `Surface` via `DisplayManager.createVirtualDisplay()` + `Presentation` — the same technique [CoMaps](https://github.com/comaps/comaps) uses (`android/app/.../car/renderer/SurfaceCallback.java`) for their own native map view, just pointed at a `WebView` instead since MapLibre GL JS isn't a native `View`. Route/position/destination/stops reach it via `WebView.evaluateJavascript()` calls into `car-map.html`'s `setRoute()`/`setPosition()`/`setWaypoints()` — the last one draws the same red-destination/orange-numbered-stop pins as the phone's own `updatePlanningMarkers`. The `WebView` survives transient disconnects (screen lock, DHU restart) — `NavigationScreen.onSurfaceDestroyed` only tears down the `Presentation`/`VirtualDisplay`, not the `WebView` itself, so a reconnect reattaches an already-loaded map instead of reloading cold; it's only actually destroyed when the car session itself ends (`onDestroy`).

Test loop: install the [Desktop Head Unit](https://developer.android.com/training/cars/testing/dhu) from the SDK Manager, enable Developer Mode + "Unknown sources" in the phone's Android Auto app settings, then `desktop-head-unit --usb`. A debug build installs as `com.navigator.app.debug` ("Navigator (Dev)") side-by-side with any existing release build, since a debug-keystore build can't otherwise be installed as an "update" over a differently-signed release one — `.github/workflows/android-auto-release.yml` builds and attaches this debug APK to a pre-release tag on every push to this branch, same day-collapsing convention as `daily-release.yml`. WebView console/JS errors from `car-map.html` forward to logcat under the `NavCarMap` tag — check there first if the map isn't rendering. **DHU's sensor-simulation commands (`location`, `speed`, ...) only work for Android Automotive OS testing** — phone projection (what this is) always uses the real phone's own GPS, so DHU can't inject a fake fix; test movement with a real drive or a mock-location app on the phone instead.

Four manifest entries this surface needs beyond the usual `androidx.car.app.NAVIGATION_TEMPLATES` permission, all found by live crashes, not docs: `<meta-data android:name="androidx.car.app.minCarApiLevel" android:value="2" />` (its absence throws inside `AppInfo.create()` and shows a generic "app encountered an error" screen), `<uses-permission android:name="androidx.car.app.ACCESS_SURFACE" />` (required the instant `AppManager.setSurfaceCallback()` is called, for the map), and voice guidance needed no new permission — `AudioFocusPlugin`'s existing `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` request already routes to the car automatically once connected (confirmed via `CAR.AUDIO.AFM: Received onAudioFocusGrant` in logcat).

**Known DHU limitations, main window only** (confirmed correct via the instrument-cluster window and/or host acceptance logs each time — not app bugs): the top maneuver banner (`RoutingInfo`) doesn't render for phone-projected apps at all; a `CarIcon.Builder.setTint(CarColor.RED)` on an `ActionStrip` icon didn't visibly render red either, despite `setTint` being an unrestricted, version-gate-free API. Both need a real head unit to actually see.

**Car screen buttons:** `NavigationTemplate`'s main `ActionStrip` always has a destination-search icon ("Where to?", `CarDestinationSearchScreen` — plans and starts a new trip via `geocodeSearch()`, same as the phone's search box); while navigating it adds Mute and a *distinct* "search along route" pin icon (`CarSearchScreen` → `CarSearchResultsScreen`, category search near the active route via `categorySearchAlongRoute()` — this used to share the same magnifying-glass icon as destination search, confirmed live as two indistinguishable buttons, now visually separate). No Stop button in the ActionStrip — tried one (see the red-tint limitation above), but decided the host's own destination-chip X, small and gray as it is, is preferable to two ambiguous end-trip controls. `NavigationTemplate`'s separate `setMapActionStrip` gets Pan/Zoom In/Zoom Out/Recenter (CoMaps' own convention), wired to `SurfaceCallback.onScroll`/`onScale` calling `car-map.html`'s `panBy()`/`zoomBy()`. All of these call straight through into the phone's own existing click handlers/search functions via a reverse (car-to-phone) half of the `CarNavState`/`CarNavPlugin` bridge (`CarNavPlugin.load()` registers a `CarNavState.ActionListener`, forwarded through Capacitor's `notifyListeners()`), not separate implementations. The host's own stop signal (`NavigationScreen.onStopNavigation()`) is wired the same way, so a car-initiated stop (not just the destination chip's X) also ends the phone's trip.

**Tests:** `CarNavState` (the plain singleton bridge, the one class in this package with minimal Android-framework dependency) has JVM unit tests at `android/app/src/test/java/com/navigator/app/auto/CarNavStateTest.java` — run with `./gradlew :app:testDebugUnitTest`. The rest of the package (`NavigationScreen`, `CarNavPlugin`, the car `Screen`s) all need a live `CarContext`/Capacitor `Bridge` to construct and aren't unit-tested; verification is live-device testing, per everything above.
