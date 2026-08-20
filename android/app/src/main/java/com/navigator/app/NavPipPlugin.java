package com.navigator.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Thin bridge for the Picture-in-Picture mini view shown during navigation —
 * every actual PiP/view decision lives in MainActivity (it owns the window
 * and the PiP lifecycle callbacks); this class just forwards calls from
 * app.js's native-pip.js to it. See native-pip.js for the JS-side contract.
 */
@CapacitorPlugin(name = "NavPip")
public class NavPipPlugin extends Plugin {
  @PluginMethod
  public void setNavigating(PluginCall call) {
    boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
    ((MainActivity) getActivity()).setNavPipNavigating(active);
    call.resolve();
  }

  @PluginMethod
  public void updateTurnCard(PluginCall call) {
    String maneuverKind = call.getString("maneuverKind", "straight");
    String instruction = call.getString("instruction", "");
    String distanceText = call.getString("distanceText", "");
    String etaText = call.getString("etaText", "");
    ((MainActivity) getActivity()).updateNavPipTurnCard(maneuverKind, instruction, distanceText, etaText);
    call.resolve();
  }
}
