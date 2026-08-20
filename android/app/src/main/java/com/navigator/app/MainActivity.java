package com.navigator.app;

import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Must run before super.onCreate() — that's where Capacitor's Bridge
    // discovers/initializes plugins.
    registerPlugin(LocationSettingsPlugin.class);
    super.onCreate(savedInstanceState);
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
