package com.navigator.app.auto;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Handler;
import android.os.Looper;

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
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

/**
 * The real Android Auto nav screen — Phase 1: live maneuver text/ETA in a
 * NavigationTemplate, driven by CarNavState (which app.js's
 * updateActiveManeuver pushes into on every tick via native-car.js /
 * CarNavPlugin). Phase 2: a hand-rolled Canvas map — route line + a
 * heading-up position puck, no basemap tiles — drawn straight onto the
 * Surface (androidx.car.app.ACCESS_SURFACE) on every route/position push.
 * No real zoom/projection library involved: a fixed local equirectangular
 * approximation good enough at city-block scale (see redrawMap below).
 *
 * Listens to CarNavState only while actually on screen (LifecycleObserver,
 * matching Screen's own LifecycleOwner) — a car session with this screen
 * backgrounded/torn down shouldn't keep invalidating a template nobody's
 * rendering.
 */
final class NavigationScreen extends Screen implements CarNavState.Listener, DefaultLifecycleObserver, NavigationManagerCallback, SurfaceCallback {
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
  // Set in onSurfaceAvailable, cleared in onSurfaceDestroyed — redrawMap is a
  // no-op without it (e.g. the brief window before the host hands us a
  // Surface at all, or after it's torn one down on disconnect).
  @Nullable private SurfaceContainer surfaceContainer;

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

  @Override
  public void onSurfaceAvailable(@NonNull SurfaceContainer surfaceContainer) {
    this.surfaceContainer = surfaceContainer;
    redrawMap();
  }

  @Override
  public void onSurfaceDestroyed(@NonNull SurfaceContainer surfaceContainer) {
    this.surfaceContainer = null;
  }

  /** Fixed MVP scale — no real zoom yet, just enough to make the road ahead
   * legible at typical city-driving speed. */
  private static final double METERS_PER_PIXEL = 0.5;
  /** Puck sits near the bottom of the screen so more of the road ahead is
   * visible than behind — same convention every turn-by-turn app uses. */
  private static final float PUCK_ANCHOR_Y_FRACTION = 0.8f;

  /** Redraws the Surface from scratch: dark background, then (only while
   * navigating with both a route and a live fix) the route line and puck,
   * heading-up and centered on the current position. Called on every
   * CarNavState change (see onCarNavStateChanged) — route/position pushes
   * arrive far less often than turn-card ticks, so this just repaints the
   * same picture most of the time; cheap enough not to bother distinguishing. */
  private void redrawMap() {
    SurfaceContainer sc = surfaceContainer;
    if (sc == null) return;
    Canvas canvas = sc.getSurface().lockCanvas(null);
    if (canvas == null) return;
    try {
      canvas.drawColor(Color.rgb(0x20, 0x21, 0x24));
      double[][] route = CarNavState.getRouteCoords();
      if (CarNavState.isNavigating() && CarNavState.hasPosition() && route != null && route.length > 1) {
        drawRoute(canvas, sc.getWidth(), sc.getHeight(), route);
        drawPuck(canvas, sc.getWidth(), sc.getHeight());
      }
    } finally {
      sc.getSurface().unlockCanvasAndPost(canvas);
    }
  }

  /** Projects the route's [lng, lat] pairs into screen space: a local
   * equirectangular approximation (flat-earth meters relative to the current
   * fix — fine at the few-hundred-meter scale a car screen shows, no need
   * for a real map projection), then rotated so the direction of travel
   * points up the screen (heading-up, matching every real driving nav UI). */
  private void drawRoute(Canvas canvas, int width, int height, double[][] route) {
    double posLng = CarNavState.getPosLng();
    double posLat = CarNavState.getPosLat();
    double headingRad = Math.toRadians(CarNavState.getPosHeadingDeg());
    double cosT = Math.cos(headingRad);
    double sinT = Math.sin(headingRad);
    double metersPerDegLat = 111_320.0;
    double metersPerDegLng = 111_320.0 * Math.cos(Math.toRadians(posLat));
    float centerX = width / 2f;
    float centerY = height * PUCK_ANCHOR_Y_FRACTION;

    Path path = new Path();
    boolean first = true;
    for (double[] pt : route) {
      double dxM = (pt[0] - posLng) * metersPerDegLng; // east-positive
      double dyM = (pt[1] - posLat) * metersPerDegLat; // north-positive
      // Rotate the east/north vector by -heading so "the direction we're
      // driving" maps to "up the screen", then flip north to screen-y (which
      // increases downward).
      double screenEastM = dxM * cosT - dyM * sinT;
      double screenNorthM = dxM * sinT + dyM * cosT;
      float x = (float) (centerX + screenEastM / METERS_PER_PIXEL);
      float y = (float) (centerY - screenNorthM / METERS_PER_PIXEL);
      if (first) {
        path.moveTo(x, y);
        first = false;
      } else {
        path.lineTo(x, y);
      }
    }
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setStyle(Paint.Style.STROKE);
    paint.setStrokeWidth(14f);
    paint.setStrokeCap(Paint.Cap.ROUND);
    paint.setStrokeJoin(Paint.Join.ROUND);
    paint.setColor(Color.rgb(0x4a, 0x9e, 0xff));
    canvas.drawPath(path, paint);
  }

  /** Fixed at the same screen anchor drawRoute projects everything else
   * relative to, always pointing straight up — heading-up rendering means
   * the puck's own rotation is constant, only the world around it turns. */
  private void drawPuck(Canvas canvas, int width, int height) {
    float centerX = width / 2f;
    float centerY = height * PUCK_ANCHOR_Y_FRACTION;
    float r = 22f;
    Path arrow = new Path();
    arrow.moveTo(centerX, centerY - r);
    arrow.lineTo(centerX - r * 0.7f, centerY + r * 0.6f);
    arrow.lineTo(centerX, centerY + r * 0.2f);
    arrow.lineTo(centerX + r * 0.7f, centerY + r * 0.6f);
    arrow.close();
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setStyle(Paint.Style.FILL);
    paint.setColor(Color.WHITE);
    canvas.drawPath(arrow, paint);
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
      redrawMap();
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

  /** Host asked us to stop (e.g. a "stop routing" affordance on the car's
   * own UI) — the phone's own app.js state stays the actual source of
   * truth for whether navigation is running in Phase 1; deciding whether a
   * car-initiated stop should also end the phone's trip is a Phase 3
   * question (same "who owns what" territory as voice-guidance ownership). */
  @Override
  public void onStopNavigation() {}

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
    NavigationTemplate.Builder builder = new NavigationTemplate.Builder()
        .setActionStrip(new ActionStrip.Builder().addAction(Action.APP_ICON).build());

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
