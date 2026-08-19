package com.navigator.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
}
