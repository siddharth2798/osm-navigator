package com.navigator.app.auto;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

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

      @Override
      public void onSearchRequested(String tag) {
        JSObject data = new JSObject();
        data.put("tag", tag);
        notifyListeners("searchRequested", data);
      }

      @Override
      public void onSearchResultSelected(int index) {
        JSObject data = new JSObject();
        data.put("index", index);
        notifyListeners("searchResultSelected", data);
      }

      @Override
      public void onDestinationSearchRequested(String query) {
        JSObject data = new JSObject();
        data.put("query", query);
        notifyListeners("destinationSearchRequested", data);
      }

      @Override
      public void onDestinationSelected(int index) {
        JSObject data = new JSObject();
        data.put("index", index);
        notifyListeners("destinationSelected", data);
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

  /** Drives the car screen's Mute icon — call from renderVoiceModeBtn() so
   * the two icons (phone + car) always change together. `mode` matches
   * app.js's VOICE_MODE_ORDER values ("all"/"off"). */
  @PluginMethod
  public void setVoiceMode(PluginCall call) {
    String mode = call.getString("mode", "all");
    CarNavState.setVoiceMode(mode);
    call.resolve();
  }

  /** Results for CarSearchResultsScreen's in-flight request (see
   * CarNavState.requestSearch/onSearchRequested) — `results` is an array of
   * {label, distanceText}, both already formatted JS-side. Omitting
   * `results` (passing null) together with `error` reports a failed search;
   * an empty `results` array reports a completed search with no matches. */
  @PluginMethod
  public void updateSearchResults(PluginCall call) {
    JSArray resultsArr = call.getArray("results");
    String error = call.getString("error", null);
    List<CarNavState.SearchResult> results = null;
    if (resultsArr != null) {
      results = new ArrayList<>();
      try {
        for (int i = 0; i < resultsArr.length(); i++) {
          JSONObject r = resultsArr.getJSONObject(i);
          results.add(new CarNavState.SearchResult(r.getString("label"), r.optString("distanceText", "")));
        }
      } catch (JSONException e) {
        call.reject("Invalid results", e);
        return;
      }
    }
    CarNavState.setSearchResults(results, error);
    call.resolve();
  }

  /** Destination/stop pins for the car map — pushed alongside updateRoute
   * (same call site in renderRoute), not per tick. `destination` is
   * {lng, lat} or omitted/null if there's no destination yet; `stops` is an
   * array of {lng, lat} in visit order (1-indexed numbering happens
   * car-map.html-side, matching the phone's own numbered stop pins). */
  @PluginMethod
  public void updateWaypoints(PluginCall call) {
    JSObject destObj = call.getObject("destination", null);
    // JSObject inherits org.json.JSONObject.getDouble(), which throws if the
    // key is missing rather than returning null — optDouble()+has() avoids
    // that without a try/catch for what's really just an absent destination.
    double[] destination = (destObj != null && destObj.has("lng") && destObj.has("lat"))
        ? new double[] { destObj.optDouble("lng"), destObj.optDouble("lat") }
        : null;
    JSArray stopsArr = call.getArray("stops");
    int count = stopsArr != null ? stopsArr.length() : 0;
    double[][] stops = new double[count][2];
    try {
      for (int i = 0; i < count; i++) {
        JSONObject s = stopsArr.getJSONObject(i);
        stops[i][0] = s.getDouble("lng");
        stops[i][1] = s.getDouble("lat");
      }
    } catch (JSONException e) {
      call.reject("Invalid stops", e);
      return;
    }
    CarNavState.setWaypoints(destination, stops);
    call.resolve();
  }
}
