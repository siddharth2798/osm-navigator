package com.navigator.app;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.IntentSender;
import android.content.res.Configuration;
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

  /** Auto-enters PiP the moment the user leaves this Activity (Home button,
   * app switch, another app coming to front) while actively navigating —
   * reliable back to very old API levels, unlike the newer Android 12
   * auto-enter API, so this works across the project's full
   * minSdkVersion 24 range. PiP itself (enterPictureInPictureMode) is
   * API 26+; below that this is a no-op and the app just backgrounds
   * normally (still with working voice guidance, via the onPause fix
   * above — PiP is a bonus on top of that, not a requirement for it). */
  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    if (!navigating) return;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      android.util.Log.i("NavPip", "onUserLeaveHint while navigating, but SDK " + Build.VERSION.SDK_INT + " < 26 (PiP unsupported) — backgrounding normally.");
      return;
    }
    // enterPictureInPictureMode can return false (no exception) when the
    // OS/OEM declines to actually enter PiP even though the manifest and
    // this call are both correct — e.g. MIUI gates PiP behind its own
    // separate per-app "Picture-in-picture"/"Display pop-up windows while
    // running in the background" permission (Settings > Apps > this app >
    // Other permissions), independent of the standard Android
    // android:supportsPictureInPicture manifest flag. Logged rather than
    // silently ignored so a real on-device failure is diagnosable via
    // `adb logcat -s NavPip` instead of just "PiP didn't happen, no idea why".
    try {
      boolean entered = enterPictureInPictureMode(pipParams());
      android.util.Log.i("NavPip", entered
        ? "enterPictureInPictureMode succeeded."
        : "enterPictureInPictureMode returned false — likely blocked by device policy or an OEM-specific PiP permission (see Settings > Apps > this app > Other permissions on MIUI).");
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
    return new PictureInPictureParams.Builder()
      .setAspectRatio(new Rational(3, 2))
      .build();
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
