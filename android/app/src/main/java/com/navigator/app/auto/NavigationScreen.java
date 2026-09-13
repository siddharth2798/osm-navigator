package com.navigator.app.auto;

import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.Map;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
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
 * CarNavPlugin). No map surface yet — that's Phase 2 (SurfaceCallback).
 *
 * Listens to CarNavState only while actually on screen (LifecycleObserver,
 * matching Screen's own LifecycleOwner) — a car session with this screen
 * backgrounded/torn down shouldn't keep invalidating a template nobody's
 * rendering.
 */
final class NavigationScreen extends Screen implements CarNavState.Listener, DefaultLifecycleObserver, NavigationManagerCallback {
  private static final Map<String, Integer> MANEUVER_TYPES = buildManeuverTypes();

  private final NavigationManager navigationManager;

  NavigationScreen(@NonNull CarContext carContext) {
    super(carContext);
    navigationManager = carContext.getCarService(NavigationManager.class);
    navigationManager.setNavigationManagerCallback(this);
    getLifecycle().addObserver(this);
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
    invalidate();
    if (CarNavState.isNavigating()) {
      navigationManager.updateTrip(buildTrip());
    }
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
