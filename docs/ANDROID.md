# The optional Android shell

The web app also works wrapped in [Capacitor](https://capacitorjs.com/) as a native Android app, specifically for reliable location tracking and voice guidance with the screen off or the app minimized (plain `watchPosition` isn't reliable once Android backgrounds the WebView, and `WebView.onPause()` freezes all JS execution on top of that). Needs Node/npm; the web app itself still doesn't.

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

Also worth knowing: `@capacitor-community/background-geolocation`'s notification text is set once and can't update live afterward — [`@transistorsoft/capacitor-background-geolocation`](https://github.com/transistorsoft/capacitor-background-geolocation) supports that, at the cost of being a commercial plugin.

**Picture-in-Picture on some OEM Android skins (e.g. MIUI/HyperOS) may need a manual permission grant.** These skins gate PiP behind their own per-app permission (Settings → Privacy protection → Special permissions → Picture-in-picture), defaulted off for every non-preinstalled app. If PiP doesn't auto-enter when minimizing during navigation, grant it directly:
```
adb shell appops set com.aeronav.app PICTURE_IN_PICTURE allow
```
`adb logcat -s NavPip` after minimizing shows exactly why it didn't enter, if it's still not working after that.

**`TOMTOM_FEATURES_ENABLED`'s `/api/traffic` and `/api/places` calls are relative, same-origin paths — not yet fixed for the Android shell.** Correct for the web PWA (served from your actual deployment domain), but the packaged Android app isn't served from that domain, so those calls won't resolve there as-is. Fixing it means making the URL absolute (the same `isNativePlatform() ? CONFIG.RESOLVE_MAPS_URL_BASE : ''` pattern already used for the Google Maps link resolver) for native builds specifically — not done yet.
