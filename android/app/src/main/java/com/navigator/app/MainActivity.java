package com.navigator.app;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;

public class MainActivity extends BridgeActivity {
  private View pipTurnCardView;
  private ImageView pipArrow;
  private TextView pipInstruction;
  private TextView pipDistanceEta;
  private volatile boolean navigating = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Must run before super.onCreate() — that's where Capacitor's Bridge
    // discovers/initializes plugins.
    registerPlugin(LocationSettingsPlugin.class);
    registerPlugin(NavPipPlugin.class);
    registerPlugin(AudioFocusPlugin.class);
    super.onCreate(savedInstanceState);

    // Inflated once, kept hidden (GONE) until PiP actually starts — see
    // onPictureInPictureModeChanged, which swaps this in for the WebView.
    // Added to the Activity's own root content container (android.R.id.content,
    // the FrameLayout every Activity's setContentView() result lives inside)
    // as a sibling of whatever Capacitor's activity_main.xml put there, so
    // it's unaffected by anything the WebView/bridge does to its own view.
    pipTurnCardView = LayoutInflater.from(this).inflate(R.layout.pip_turn_card, null);
    pipArrow = pipTurnCardView.findViewById(R.id.pip_arrow);
    pipInstruction = pipTurnCardView.findViewById(R.id.pip_instruction);
    pipDistanceEta = pipTurnCardView.findViewById(R.id.pip_distance_eta);
    pipTurnCardView.setVisibility(View.GONE);
    ((ViewGroup) findViewById(android.R.id.content)).addView(
      pipTurnCardView,
      new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    );

    // Registers initial (not-navigating) params right away rather than
    // waiting for the first onUserLeaveHint — Android 12+'s auto-enter path
    // (see pipParams()) needs setPictureInPictureParams() called ahead of
    // time to have anything to act on when the user actually leaves, not
    // just inside onUserLeaveHint itself.
    updatePipParams();

    handleShareIntent(getIntent());
  }

  // ---- Incoming "Share" intents (e.g. sharing a place from Google Maps) ----
  // android:launchMode="singleTask" (see AndroidManifest.xml) means a share
  // arriving while this Activity is already running comes through here
  // instead of a fresh onCreate — both paths funnel into the same
  // handleShareIntent below. setIntent() keeps getIntent() consistent with
  // what actually launched/resumed this Activity, matching the platform's
  // own documented convention for singleTask activities.
  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleShareIntent(intent);
  }

  /** Turns an incoming ACTION_SEND text/plain Intent (see AndroidManifest.xml's
   * second intent-filter) into the exact same `?text=&title=` URL shape
   * app.js's parseShareTargetParam() already reads for the PWA's own Web
   * Share Target (manifest.json's share_target) — one JS-side code path
   * resolves a shared Google Maps link either way, native shell or plain
   * browser install. Reloads the WebView to that URL rather than trying to
   * hand the text to an already-running page live, so a share behaves
   * identically whether the app was already open or not — the PWA path is
   * itself always a fresh navigation, never a live hand-off, so this just
   * matches it instead of adding a second, native-only delivery mechanism. */
  // A real shared Google Maps link is at most a few hundred characters —
  // this is just a sanity ceiling against whatever arbitrary text another
  // app's Share sheet hands over, not a limit that legitimate shares ever
  // approach.
  private static final int MAX_SHARE_TEXT_LENGTH = 4096;

  private void handleShareIntent(Intent intent) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
    if (!"text/plain".equals(intent.getType())) return;
    String text = intent.getStringExtra(Intent.EXTRA_TEXT);
    if (text == null || text.trim().isEmpty()) return;
    if (text.length() > MAX_SHARE_TEXT_LENGTH) text = text.substring(0, MAX_SHARE_TEXT_LENGTH);
    String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
    if (title != null && title.length() > MAX_SHARE_TEXT_LENGTH) title = title.substring(0, MAX_SHARE_TEXT_LENGTH);
    Uri.Builder url = Uri.parse("https://localhost/index.html").buildUpon().appendQueryParameter("text", text);
    if (title != null && !title.trim().isEmpty()) url.appendQueryParameter("title", title);
    String finalUrl = url.build().toString();
    // Posted rather than called directly — on the cold-start path (from
    // onCreate, right after super.onCreate() above) Capacitor's bridge/
    // WebView has only just begun its own initial load; queuing this on
    // the WebView's own message loop lets that load actually start first; a
    // second load then straight away replaces it with the share's URL,
    // rather than risking a null WebView caught mid-initialization.
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(finalUrl));
    }
  }

  // Capacitor's BridgeActivity.onPause() pauses its WebView, and
  // WebView.onPause() freezes ALL JS timers and JS callback delivery for
  // that WebView (documented Android behavior) — so the moment this app is
  // minimized or the screen locks, the onPositionUpdate -> updateActiveManeuver
  // -> speak() chain in app.js stops running, even though
  // @capacitor-community/background-geolocation's own foreground service
  // (see native-location.js) keeps delivering real GPS fixes from native
  // code the whole time. Immediately un-pausing the WebView here stops it
  // from independently freezing on top of a process that's already being
  // kept alive by that foreground service during navigation — this doesn't
  // fight Android's real process/Doze management, it just stops our own
  // WebView from adding an extra freeze of its own. Voice guidance and
  // navigation keep working in the background as a result.
  @Override
  public void onPause() {
    super.onPause();
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().onResume();
    }
  }

  // ---- Location-settings resolution (see LocationSettingsPlugin.java) ----
  // Granting the ACCESS_FINE_LOCATION *permission* (handled entirely by
  // @capacitor-community/background-geolocation) is a separate thing from
  // the device's Location *service* actually being switched on — that
  // plugin detects a disabled service and rejects the call, but has no way
  // to prompt the user to fix it. This uses Play Services' SettingsClient,
  // the standard API for that: checkLocationSettings() either confirms
  // it's already on, or fails with a ResolvableApiException carrying a
  // system "Turn on Location?" dialog to launch. play-services-location is
  // already on the classpath transitively via the background-geolocation
  // plugin's own build.gradle, so this needs no new Gradle dependency.
  private static final int LOCATION_SETTINGS_REQUEST_CODE = 4201;
  private PluginCall pendingLocationSettingsCall;

  void ensureLocationEnabled(PluginCall call) {
    LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000).build();
    LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
      .addLocationRequest(locationRequest)
      .build();

    LocationServices.getSettingsClient(this)
      .checkLocationSettings(settingsRequest)
      .addOnSuccessListener(this, response -> {
        JSObject result = new JSObject();
        result.put("enabled", true);
        call.resolve(result);
      })
      .addOnFailureListener(this, exception -> {
        if (exception instanceof ResolvableApiException) {
          try {
            pendingLocationSettingsCall = call;
            ((ResolvableApiException) exception).startResolutionForResult(this, LOCATION_SETTINGS_REQUEST_CODE);
          } catch (IntentSender.SendIntentException sendEx) {
            JSObject result = new JSObject();
            result.put("enabled", false);
            call.resolve(result);
          }
        } else {
          // No Play Services on this device, or otherwise unresolvable —
          // nothing more this can do; the caller falls back to its own
          // "location services are off" messaging.
          JSObject result = new JSObject();
          result.put("enabled", false);
          call.resolve(result);
        }
      });
  }

  // ---- Picture-in-Picture (see NavPipPlugin.java) ----

  /** Called by NavPipPlugin (see native-pip.js's setNavigating) whenever
   * app.js's startNavigation()/endNavigation() run. onUserLeaveHint only
   * tries to auto-enter PiP while this is true, so leaving the app during
   * ordinary planning/browsing behaves exactly as it always has — no PiP
   * popup for a plain "switched to another app while looking at a map". */
  void setNavPipNavigating(boolean active) {
    navigating = active;
    // Refreshes setAutoEnterEnabled (API 31+, see pipParams()) so leaving
    // the app while NOT navigating never auto-enters PiP, and leaving it
    // WHILE navigating does — without this, params set once at onCreate()
    // would only ever reflect navigating=false.
    updatePipParams();
  }

  /** Pushes the current pipParams() to the OS. Safe to call at any point in
   * the Activity lifecycle from API 26 on (setPictureInPictureParams exists
   * from the same level enterPictureInPictureMode does); no-ops below that,
   * same as onUserLeaveHint's own guard. */
  private void updatePipParams() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      setPictureInPictureParams(pipParams());
    }
  }

  /** Called by NavPipPlugin (see native-pip.js's updateTurnCard) every time
   * app.js's on-screen nav banner updates — keeps the native mini view
   * from ever showing stale turn-by-turn info while it's the only thing on
   * screen (app backgrounded). Capacitor plugin methods don't guarantee
   * the UI thread, so this dispatches explicitly. */
  void updateNavPipTurnCard(String maneuverKind, String instruction, String distanceText, String etaText) {
    runOnUiThread(() -> {
      pipArrow.setImageResource(pipArrowDrawableFor(maneuverKind));
      pipArrow.setRotation(pipArrowRotationFor(maneuverKind));
      pipInstruction.setText(instruction);
      String distanceEta = etaText == null || etaText.isEmpty() ? distanceText : distanceText + " · " + etaText;
      pipDistanceEta.setText(distanceEta);
    });
  }

  // maneuverKind is the small fixed icon-key string maneuverPipIconKey()
  // produces in app.js — kept as plain strings rather than an enum/shared
  // constant so this file and app.js don't need to import from each other;
  // the string literals are the actual contract between them, documented
  // in both places.
  private int pipArrowDrawableFor(String maneuverKind) {
    switch (maneuverKind) {
      case "uturn": return R.drawable.ic_pip_uturn;
      case "roundabout": return R.drawable.ic_pip_roundabout;
      case "arrive": return R.drawable.ic_pip_flag;
      default: return R.drawable.ic_pip_arrow; // straight/left/right/slight-*/sharp-* — same arrow, rotated below
    }
  }

  private float pipArrowRotationFor(String maneuverKind) {
    switch (maneuverKind) {
      case "slight-right": return 30f;
      case "right": return 90f;
      case "sharp-right": return 120f;
      case "slight-left": return -30f;
      case "left": return -90f;
      case "sharp-left": return -120f;
      default: return 0f; // straight, uturn, roundabout, arrive — their own drawables are already oriented correctly
    }
  }

  /** Manual fallback for auto-enter PiP the moment the user leaves this
   * Activity (Home button, app switch, another app coming to front) while
   * actively navigating. On API 31+, pipParams() already sets
   * setAutoEnterEnabled(true) while navigating, so the OS is expected to
   * enter PiP itself before this even runs — the isInPictureInPictureMode()
   * check below skips the redundant manual call in that case. Below API 31
   * (and as a safety net if auto-enter didn't fire for some reason), this
   * manual enterPictureInPictureMode() call is what actually does it —
   * reliable back to API 26, the oldest level PiP itself supports; below
   * that this is a no-op and the app just backgrounds normally (still with
   * working voice guidance, via the onPause fix above — PiP is a bonus on
   * top of that, not a requirement for it). */
  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    if (!navigating) return;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      android.util.Log.i("NavPip", "onUserLeaveHint while navigating, but SDK " + Build.VERSION.SDK_INT + " < 26 (PiP unsupported) — backgrounding normally.");
      return;
    }
    if (isInPictureInPictureMode()) {
      android.util.Log.i("NavPip", "Already in PiP (API 31+ auto-enter already handled it) — skipping the manual call.");
      return;
    }
    // Android explicitly allows PiP to be disabled entirely on some
    // devices (e.g. low-RAM configurations) via this system feature flag —
    // distinguishing that from an OS/OEM permission decline below, since
    // they'd otherwise look identical (both just "PiP never appears").
    if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
      android.util.Log.i("NavPip", "This device does not declare FEATURE_PICTURE_IN_PICTURE — PiP is unsupported here entirely, not just blocked.");
      return;
    }
    // enterPictureInPictureMode can return false (no exception) when the
    // OS/OEM declines to actually enter PiP even though the manifest and
    // this call are both correct — e.g. MIUI gates PiP behind its own
    // separate per-app "Picture-in-picture" permission (Settings > Privacy
    // protection > Special permissions > Picture-in-picture), independent
    // of the standard Android android:supportsPictureInPicture manifest
    // flag. Logged rather than silently ignored so a real on-device
    // failure is diagnosable via `adb logcat -s NavPip` instead of just
    // "PiP didn't happen, no idea why".
    try {
      boolean entered = enterPictureInPictureMode(pipParams());
      android.util.Log.i("NavPip", entered
        ? "enterPictureInPictureMode succeeded."
        : "enterPictureInPictureMode returned false — likely blocked by device policy or an OEM-specific PiP permission (see Settings > Privacy protection > Special permissions > Picture-in-picture on MIUI).");
    } catch (Exception e) {
      android.util.Log.e("NavPip", "enterPictureInPictureMode threw", e);
    }
  }

  @Override
  public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
    // Swaps which view is visible rather than anything more involved — the
    // WebView's full interactive UI makes no sense shrunk into a small,
    // barely-touchable PiP window, so PiP shows this simplified native
    // turn-card instead; normal size shows the real app again exactly as
    // it was.
    View webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView != null) webView.setVisibility(isInPictureInPictureMode ? View.GONE : View.VISIBLE);
    pipTurnCardView.setVisibility(isInPictureInPictureMode ? View.VISIBLE : View.GONE);
  }

  private PictureInPictureParams pipParams() {
    PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
      .setAspectRatio(new Rational(3, 2));
    // API 31+ (Android 12): declares up front whether this Activity should
    // auto-enter PiP when the user leaves, instead of solely reacting in
    // onUserLeaveHint — the OS then owns the exact transition timing itself
    // (avoiding the "activity wasn't RESUMED at the instant we tried to
    // call enterPictureInPictureMode" class of failure that the older,
    // manual-only approach is prone to). Tied to `navigating` so leaving
    // the app while NOT mid-trip still never triggers PiP.
    // setSeamlessResizeEnabled(true) is recommended for non-video content
    // like this app's map view, per Android's own PiP guide.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(navigating);
      builder.setSeamlessResizeEnabled(true);
    }
    return builder.build();
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == LOCATION_SETTINGS_REQUEST_CODE && pendingLocationSettingsCall != null) {
      JSObject result = new JSObject();
      result.put("enabled", resultCode == RESULT_OK);
      pendingLocationSettingsCall.resolve(result);
      pendingLocationSettingsCall = null;
    }
  }
}
