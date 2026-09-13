package com.navigator.app.auto;

import android.app.Presentation;
import android.content.Context;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.Map;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.car.app.AppManager;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.SurfaceCallback;
import androidx.car.app.SurfaceContainer;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.CarIcon;
import androidx.car.app.model.Distance;
import androidx.car.app.model.Template;
import androidx.car.app.navigation.NavigationManager;
import androidx.car.app.navigation.NavigationManagerCallback;
import androidx.car.app.navigation.model.Maneuver;
import androidx.car.app.navigation.model.NavigationTemplate;
import androidx.car.app.navigation.model.RoutingInfo;
import androidx.car.app.navigation.model.Step;
import androidx.car.app.navigation.model.TravelEstimate;
import androidx.car.app.navigation.model.Trip;
import androidx.core.graphics.drawable.IconCompat;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

import com.navigator.app.R;

/**
 * The real Android Auto nav screen — Phase 1: live maneuver text/ETA in a
 * NavigationTemplate, driven by CarNavState (which app.js's
 * updateActiveManeuver pushes into on every tick via native-car.js /
 * CarNavPlugin). Phase 2: a real rendered map — same technique as CoMaps'
 * (github.com/comaps/comaps, android/app/.../car/renderer/SurfaceCallback.java):
 * a DisplayManager.createVirtualDisplay() backed by the Car App's Surface,
 * with a Presentation showing a View on it. CoMaps presents their existing
 * native C++ map View; we don't have one — MapLibre GL JS runs inside a
 * WebView — so this presents a second, offscreen WebView loaded with
 * car-map.html (a standalone map-only page, no Capacitor bridge) instead.
 * Route/position get pushed into it via WebView.evaluateJavascript(), the
 * same shape as the JS→native bridge everywhere else in this package, just
 * running the other direction.
 *
 * Listens to CarNavState only while actually on screen (LifecycleObserver,
 * matching Screen's own LifecycleOwner) — a car session with this screen
 * backgrounded/torn down shouldn't keep invalidating a template nobody's
 * rendering.
 */
final class NavigationScreen extends Screen implements CarNavState.Listener, DefaultLifecycleObserver, NavigationManagerCallback, SurfaceCallback {
  private static final String TAG = "NavCarMap";
  private static final Map<String, Integer> MANEUVER_TYPES = buildManeuverTypes();

  private final NavigationManager navigationManager;
  // CarNavState.notifyListener() can fire from whatever thread triggered
  // it — in practice, Capacitor plugin methods run on their own background
  // "CapacitorPlugins" HandlerThread, not the main thread. NavigationManager
  // asserts main-thread-only internally (confirmed live: crashed with
  // IllegalStateException("Not running on main thread when it is required
  // to") from updateTrip() before this existed) — every call from
  // onCarNavStateChanged needs to be posted here first, not called directly.
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  // NavigationManager tracks its own internal mIsNavigating flag, set only by
  // navigationStarted()/navigationEnded() — updateTrip() throws
  // IllegalStateException("Navigation is not started") if called before
  // navigationStarted() (confirmed live: crashed back-to-back on every
  // CarNavState update once the main-thread fix above stopped masking it).
  // Tracked here, not read off the host, since NavigationManager exposes no
  // getter for it.
  private boolean hostNavigationStarted = false;
  private static final String CAR_MAP_URL = "file:///android_asset/car-map.html";
  // All three set up together in onSurfaceAvailable, torn down together in
  // onSurfaceDestroyed — a car session disconnecting/reconnecting (e.g. the
  // phone screen locking, DHU restarting) tears the Surface down and hands
  // us a new one, so this rebuilds from scratch each time rather than trying
  // to reparent a WebView across Presentations.
  @Nullable private WebView carMapWebView;
  @Nullable private VirtualDisplay virtualDisplay;
  @Nullable private Presentation presentation;

  NavigationScreen(@NonNull CarContext carContext) {
    super(carContext);
    navigationManager = carContext.getCarService(NavigationManager.class);
    navigationManager.setNavigationManagerCallback(this);
    // Requires androidx.car.app.ACCESS_SURFACE (confirmed live: omitting the
    // permission crashes the instant this line runs, with a SecurityException
    // from the host).
    carContext.getCarService(AppManager.class).setSurfaceCallback(this);
    getLifecycle().addObserver(this);
  }

  // SurfaceCallback methods are documented to run on the main thread (same as
  // Screen's own onGetTemplate) — safe to touch the WebView directly here,
  // same assumption CoMaps' own SurfaceCallback makes.
  @Override
  public void onSurfaceAvailable(@NonNull SurfaceContainer sc) {
    CarContext carContext = getCarContext();
    WebView webView = new WebView(carContext); // biggest unproven step here — WebView has never been built with a CarContext before, only Activity contexts
    webView.getSettings().setJavaScriptEnabled(true);
    webView.setBackgroundColor(Color.rgb(0x20, 0x21, 0x24));
    webView.setLayoutParams(new ViewGroup.LayoutParams(sc.getWidth(), sc.getHeight()));
    // Chromium logs console messages to logcat under its own "chromium" tag
    // by default, but only at WARNING+ — this guarantees every level (plain
    // console.log included) shows up under one grep-able tag, and also
    // confirms whether the page's script is running at all.
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onConsoleMessage(ConsoleMessage cm) {
        Log.d(TAG, "console: " + cm.message() + " (" + cm.sourceId() + ":" + cm.lineNumber() + ")");
        return true;
      }
    });
    webView.setWebViewClient(new WebViewClient() {
      @Override
      public void onPageFinished(WebView view, String finishedUrl) {
        Log.d(TAG, "onPageFinished: " + finishedUrl);
      }

      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        Log.e(TAG, "onReceivedError: " + request.getUrl() + " -> " + error.getDescription());
      }
    });
    // Seeds the initial camera/puck when a fix is already known (idle
    // location sharing starts on app open, well before a car session
    // connects, so this is normally true) — avoids the map opening centered
    // on [0, 0] and only then jumping once the first position push arrives.
    String url = CAR_MAP_URL;
    if (CarNavState.hasPosition()) {
      url += "?lng=" + CarNavState.getPosLng() + "&lat=" + CarNavState.getPosLat() + "&heading=" + CarNavState.getPosHeadingDeg();
    }
    Log.d(TAG, "onSurfaceAvailable: loading " + url);
    webView.loadUrl(url);
    carMapWebView = webView;

    DisplayManager displayManager = (DisplayManager) carContext.getSystemService(Context.DISPLAY_SERVICE);
    virtualDisplay = displayManager.createVirtualDisplay(
        "NavigatorCarMap", sc.getWidth(), sc.getHeight(), sc.getDpi(), sc.getSurface(), 0);
    presentation = new Presentation(carContext, virtualDisplay.getDisplay());
    presentation.setContentView(webView);
    presentation.show();

    pushRouteAndPositionToCarMap();
  }

  @Override
  public void onSurfaceDestroyed(@NonNull SurfaceContainer sc) {
    if (presentation != null) {
      presentation.dismiss();
      presentation = null;
    }
    if (virtualDisplay != null) {
      virtualDisplay.release();
      virtualDisplay = null;
    }
    if (carMapWebView != null) {
      carMapWebView.destroy();
      carMapWebView = null;
    }
  }

  /** Pushes the current route/position into car-map.html's setRoute()/
   * setPosition() — plain JS argument literals, not JSON strings, since
   * evaluateJavascript runs real code (see car-map.html's own note on this).
   * Called on every CarNavState change (see onCarNavStateChanged); the page
   * itself buffers calls that arrive before its 'load' event, so there's no
   * ordering dependency on the WebView finishing its first paint. */
  private void pushRouteAndPositionToCarMap() {
    WebView webView = carMapWebView;
    if (webView == null) {
      Log.d(TAG, "pushRouteAndPositionToCarMap: no WebView yet, skipping");
      return;
    }
    double[][] route = CarNavState.getRouteCoords();
    if (route != null && route.length > 1) {
      webView.evaluateJavascript("setRoute(" + routeToJsArrayLiteral(route) + ")", result -> Log.d(TAG, "setRoute() evaluateJavascript result: " + result));
    }
    if (CarNavState.hasPosition()) {
      String call = "setPosition(" + CarNavState.getPosLng() + "," + CarNavState.getPosLat() + "," + CarNavState.getPosHeadingDeg() + ")";
      webView.evaluateJavascript(call, result -> Log.d(TAG, "setPosition() evaluateJavascript result: " + result));
    }
  }

  /** Double.toString() is locale-independent (always '.'), unlike
   * String.format without an explicit Locale — safe to build a JS literal
   * with directly, no locale-comma gotcha. */
  private static String routeToJsArrayLiteral(double[][] route) {
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < route.length; i++) {
      if (i > 0) sb.append(',');
      sb.append('[').append(route[i][0]).append(',').append(route[i][1]).append(']');
    }
    return sb.append(']').toString();
  }

  @Override
  public void onStart(@NonNull LifecycleOwner owner) {
    CarNavState.setListener(this);
    onCarNavStateChanged();
  }

  @Override
  public void onStop(@NonNull LifecycleOwner owner) {
    CarNavState.setListener(null);
  }

  @Override
  public void onCarNavStateChanged() {
    mainHandler.post(() -> {
      invalidate();
      pushRouteAndPositionToCarMap();
      if (CarNavState.isNavigating()) {
        if (!hostNavigationStarted) {
          navigationManager.navigationStarted();
          hostNavigationStarted = true;
        }
        navigationManager.updateTrip(buildTrip());
      } else if (hostNavigationStarted) {
        navigationManager.navigationEnded();
        hostNavigationStarted = false;
      }
    });
  }

  /** Host asked us to stop — distinct from our own ActionStrip Stop button
   * (buildActionStrip), this fires when the *host* decides navigation should
   * end (e.g. a system-level "stop navigation" affordance). Routed through
   * the same CarNavState.requestStop() -> el.endNavBtn.click() path as our
   * own button (Phase 3's "who owns what" question, resolved: the host's
   * stop is real and must reach the phone, or the car would show idle while
   * the phone still thinks it's navigating). */
  @Override
  public void onStopNavigation() {
    CarNavState.requestStop();
  }

  /** Required for DHU's own auto-drive/simulated-route testing feature to
   * work at all — app.js's own route/position state isn't driven by this
   * signal in Phase 1, so no special handling needed beyond existing. */
  @Override
  public void onAutoDriveEnabled() {}

  // The RoutingInfo built here (maneuver/cue/distance) is confirmed reaching
  // the host correctly — verified live via DHU's instrument-cluster window
  // (config: instrumentcluster=true), which displayed the exact maneuver
  // type, cue text, and distance sent below. DHU's *main* window doesn't
  // draw the equivalent top banner for phone-projected apps though — a DHU
  // testing-tool limitation, not something wrong with this template (the
  // same NavigationTemplate's destinationTravelEstimate chip below renders
  // fine on the main window). Needs a real head unit to see the banner
  // on-screen; not a blocker for this phase.
  @NonNull
  @Override
  public Template onGetTemplate() {
    NavigationTemplate.Builder builder = new NavigationTemplate.Builder().setActionStrip(buildActionStrip());

    if (!CarNavState.isNavigating()) {
      return builder.setNavigationInfo(new RoutingInfo.Builder().setLoading(true).build()).build();
    }

    RoutingInfo routingInfo = new RoutingInfo.Builder()
        .setCurrentStep(buildStep(), distanceFromMeters(CarNavState.getStepDistM()))
        .build();
    return builder
        .setNavigationInfo(routingInfo)
        .setDestinationTravelEstimate(buildDestinationEstimate())
        .build();
  }

  /** Mute and Stop only appear while actually navigating — matches the phone
   * UI, where end-nav-btn/voice-mode-btn's own visibility is gated the same
   * way. Both call straight through CarNavState.request*() into the exact
   * same click handlers the phone's own buttons already use (see app.js) —
   * not reimplemented, just triggered from a second place. */
  private ActionStrip buildActionStrip() {
    ActionStrip.Builder builder = new ActionStrip.Builder().addAction(Action.APP_ICON);
    if (CarNavState.isNavigating()) {
      builder.addAction(
          new Action.Builder()
              .setIcon(carIcon(R.drawable.ic_car_mute))
              .setOnClickListener(CarNavState::requestToggleVoice)
              .build());
      builder.addAction(
          new Action.Builder()
              .setIcon(carIcon(R.drawable.ic_car_stop))
              .setOnClickListener(CarNavState::requestStop)
              .build());
    }
    return builder.build();
  }

  private CarIcon carIcon(int drawableResId) {
    return new CarIcon.Builder(IconCompat.createWithResource(getCarContext(), drawableResId)).build();
  }

  private Trip buildTrip() {
    return new Trip.Builder()
        .addStep(buildStep(), buildDestinationEstimate())
        .setLoading(false)
        .build();
  }

  private Step buildStep() {
    return new Step.Builder(CarNavState.getInstruction())
        .setManeuver(buildManeuver())
        .build();
  }

  private Maneuver buildManeuver() {
    Integer type = MANEUVER_TYPES.get(CarNavState.getManeuverKind());
    return new Maneuver.Builder(type != null ? type : Maneuver.TYPE_STRAIGHT).build();
  }

  private TravelEstimate buildDestinationEstimate() {
    long remainingTimeS = Math.round(CarNavState.getRemainingTimeS());
    return new TravelEstimate.Builder(
            distanceFromMeters(CarNavState.getRemainingDistM()),
            ZonedDateTime.now().plusSeconds(remainingTimeS))
        .setRemainingTimeSeconds(remainingTimeS)
        .build();
  }

  /** Same meters/km threshold as lib/format-utils.js's formatDistance — kept
   * in sync manually, since native code can't import that file. */
  private static Distance distanceFromMeters(double meters) {
    if (meters < 950) return Distance.create(meters, Distance.UNIT_METERS);
    return Distance.create(meters / 1000.0, Distance.UNIT_KILOMETERS);
  }

  /** Maps app.js's small fixed maneuverPipIconKey vocabulary (see app.js)
   * onto Car App Library's Maneuver.TYPE_* constants. U-turn/roundabout
   * lose direction/CW-vs-CCW specificity here — same simplification the PiP
   * mini-view's own single icon for each already makes, not a new gap. */
  private static Map<String, Integer> buildManeuverTypes() {
    Map<String, Integer> m = new HashMap<>();
    m.put("straight", Maneuver.TYPE_STRAIGHT);
    m.put("left", Maneuver.TYPE_TURN_NORMAL_LEFT);
    m.put("right", Maneuver.TYPE_TURN_NORMAL_RIGHT);
    m.put("sharp-left", Maneuver.TYPE_TURN_SHARP_LEFT);
    m.put("sharp-right", Maneuver.TYPE_TURN_SHARP_RIGHT);
    m.put("slight-left", Maneuver.TYPE_TURN_SLIGHT_LEFT);
    m.put("slight-right", Maneuver.TYPE_TURN_SLIGHT_RIGHT);
    m.put("uturn", Maneuver.TYPE_U_TURN_LEFT);
    m.put("roundabout", Maneuver.TYPE_ROUNDABOUT_ENTER_AND_EXIT_CW);
    m.put("arrive", Maneuver.TYPE_DESTINATION);
    return m;
  }
}
