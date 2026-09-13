package com.navigator.app.auto;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Thin bridge for Android Auto's NavigationTemplate — mirrors NavPipPlugin's
 * shape exactly, but writes into CarNavState (a plain singleton) instead of
 * calling into MainActivity directly, since a car session's lifecycle isn't
 * tied to the Activity's. See native-car.js for the JS-side contract.
 */
@CapacitorPlugin(name = "CarNav")
public class CarNavPlugin extends Plugin {
  /** Called once by the Bridge when it instantiates this plugin — the
   * matching half of NavigationScreen's ActionStrip buttons, which call
   * CarNavState.requestStop()/requestToggleVoice() when tapped on the car
   * screen. Registered here rather than per-call since this plugin instance
   * (unlike a car Screen) lives for the whole app process. */
  @Override
  public void load() {
    CarNavState.setActionListener(new CarNavState.ActionListener() {
      @Override
      public void onStopRequested() {
        notifyListeners("stopRequested", new JSObject());
      }

      @Override
      public void onToggleVoiceRequested() {
        notifyListeners("toggleVoiceRequested", new JSObject());
      }
    });
  }

  @PluginMethod
  public void setNavigating(PluginCall call) {
    boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
    CarNavState.setNavigating(active);
    call.resolve();
  }

  @PluginMethod
  public void updateTurnCard(PluginCall call) {
    String maneuverKind = call.getString("maneuverKind", "straight");
    String instruction = call.getString("instruction", "");
    double stepDistM = call.getDouble("stepDistM", 0.0);
    double remainingDistM = call.getDouble("remainingDistM", 0.0);
    double remainingTimeS = call.getDouble("remainingTimeS", 0.0);
    CarNavState.updateTurnCard(maneuverKind, instruction, stepDistM, remainingDistM, remainingTimeS);
    call.resolve();
  }

  /** Route line for the car screen's map — pushed once per route
   * computed/rerouted (see updateRoute in native-car.js), not per tick.
   * `coordinates` is an array of [lng, lat] pairs, same order as the route. */
  @PluginMethod
  public void updateRoute(PluginCall call) {
    JSArray coordinates = call.getArray("coordinates");
    int count = coordinates != null ? coordinates.length() : 0;
    double[][] coords = new double[count][2];
    try {
      for (int i = 0; i < count; i++) {
        JSONArray pair = coordinates.getJSONArray(i);
        coords[i][0] = pair.getDouble(0);
        coords[i][1] = pair.getDouble(1);
      }
    } catch (JSONException e) {
      call.reject("Invalid coordinates", e);
      return;
    }
    CarNavState.setRoute(coords);
    call.resolve();
  }

  @PluginMethod
  public void updatePosition(PluginCall call) {
    double lng = call.getDouble("lng", 0.0);
    double lat = call.getDouble("lat", 0.0);
    double headingDeg = call.getDouble("headingDeg", 0.0);
    CarNavState.setPosition(lng, lat, headingDeg);
    call.resolve();
  }
}
