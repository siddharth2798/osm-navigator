package com.navigator.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Thin bridge to MainActivity's location-settings resolution — every actual
 * Play Services/Activity-result call lives there (it owns the Activity);
 * this class just forwards from app.js's native-location.js. See
 * MainActivity.ensureLocationEnabled for the real logic and why this is
 * needed on top of @capacitor-community/background-geolocation.
 */
@CapacitorPlugin(name = "LocationSettings")
public class LocationSettingsPlugin extends Plugin {
  @PluginMethod
  public void ensureEnabled(PluginCall call) {
    ((MainActivity) getActivity()).ensureLocationEnabled(call);
  }
}
