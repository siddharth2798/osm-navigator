package com.navigator.app.auto;

import androidx.annotation.Nullable;

/**
 * Plain in-process singleton — the bridge between CarNavPlugin (written to
 * from app.js on every updateActiveManeuver tick) and NavigationScreen (read
 * from whenever it rebuilds its template). Needed because CarAppService has
 * its own lifecycle tied to the car connection, not to MainActivity — unlike
 * PiP (see NavPipPlugin), which can reach into MainActivity directly since
 * PiP genuinely is an Activity-lifecycle feature, a car session can exist
 * whether or not MainActivity/its WebView are even foregrounded. Same
 * process throughout, so a plain static holder is enough — no IPC/AIDL.
 */
final class CarNavState {
  interface Listener {
    void onCarNavStateChanged();
  }

  @Nullable private static volatile Listener listener;
  private static volatile boolean navigating = false;
  private static volatile String maneuverKind = "straight";
  private static volatile String instruction = "";
  private static volatile double stepDistM = 0;
  private static volatile double remainingDistM = 0;
  private static volatile double remainingTimeS = 0;

  private CarNavState() {}

  /** NavigationScreen sets itself as the listener while on screen, so a
   * state push while the host isn't showing the nav screen at all doesn't
   * do pointless work — cleared again in the screen's onScreenFinished-style
   * teardown (see NavigationScreen). Only one listener at a time is ever
   * needed — a single Screen instance per car connection. */
  static void setListener(@Nullable Listener l) {
    listener = l;
  }

  static void setNavigating(boolean active) {
    navigating = active;
    notifyListener();
  }

  static boolean isNavigating() {
    return navigating;
  }

  static void updateTurnCard(String maneuverKind_, String instruction_, double stepDistM_, double remainingDistM_, double remainingTimeS_) {
    maneuverKind = maneuverKind_;
    instruction = instruction_;
    stepDistM = stepDistM_;
    remainingDistM = remainingDistM_;
    remainingTimeS = remainingTimeS_;
    notifyListener();
  }

  static String getManeuverKind() {
    return maneuverKind;
  }

  static String getInstruction() {
    return instruction;
  }

  static double getStepDistM() {
    return stepDistM;
  }

  static double getRemainingDistM() {
    return remainingDistM;
  }

  static double getRemainingTimeS() {
    return remainingTimeS;
  }

  private static void notifyListener() {
    Listener l = listener;
    if (l != null) l.onCarNavStateChanged();
  }
}
