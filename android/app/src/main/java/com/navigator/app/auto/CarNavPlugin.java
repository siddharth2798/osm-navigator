package com.navigator.app.auto;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Thin bridge for Android Auto's NavigationTemplate — mirrors NavPipPlugin's
 * shape exactly, but writes into CarNavState (a plain singleton) instead of
 * calling into MainActivity directly, since a car session's lifecycle isn't
 * tied to the Activity's. See native-car.js for the JS-side contract.
 */
@CapacitorPlugin(name = "CarNav")
public class CarNavPlugin extends Plugin {
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
}
