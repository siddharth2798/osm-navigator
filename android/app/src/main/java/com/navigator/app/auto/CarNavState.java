package com.navigator.app.auto;

import androidx.annotation.Nullable;

import java.util.List;

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

  /** The reverse direction — car screen to phone. CarNavPlugin registers
   * itself once (see its load()) and forwards these into
   * Plugin.notifyListeners() as JS events; NavigationScreen's ActionStrip
   * buttons call requestStop()/requestToggleVoice() when tapped, and
   * CarSearchScreen/CarSearchResultsScreen call the search two. */
  interface ActionListener {
    void onStopRequested();
    void onToggleVoiceRequested();
    void onSearchRequested(String tag);
    void onSearchResultSelected(int index);
    void onDestinationSearchRequested(String query);
    void onDestinationSelected(int index);
  }

  /** CarSearchResultsScreen listens for this while it's on screen — separate
   * from Listener above (which stays dedicated to NavigationScreen's own
   * turn-card/trip updates) so a search screen being open doesn't steal
   * NavigationScreen's listener slot and pause its NavigationManager
   * updates. */
  interface SearchResultsListener {
    void onSearchResultsChanged();
  }

  /** One result row — label + a pre-formatted route-distance string, both
   * computed JS-side (same formatDistance() the phone's own results list
   * uses) so native doesn't need its own copy of that formatting logic. */
  static final class SearchResult {
    final String label;
    final String distanceText;

    SearchResult(String label, String distanceText) {
      this.label = label;
      this.distanceText = distanceText;
    }
  }

  @Nullable private static volatile Listener listener;
  @Nullable private static volatile ActionListener actionListener;
  @Nullable private static volatile SearchResultsListener searchResultsListener;
  private static volatile String voiceMode = "all";
  // null results + null error = still loading; non-null results (possibly
  // empty) = a completed search; non-null error = the search failed.
  @Nullable private static volatile List<SearchResult> searchResults = null;
  @Nullable private static volatile String searchError = null;
  private static volatile boolean navigating = false;
  private static volatile String maneuverKind = "straight";
  private static volatile String instruction = "";
  private static volatile double stepDistM = 0;
  private static volatile double remainingDistM = 0;
  private static volatile double remainingTimeS = 0;
  // Route line for the SurfaceCallback map — [ [lng, lat], ... ], same order
  // as app.js's state.route.coords. Null until the first route is pushed;
  // replaced wholesale (not mutated) on every route/reroute, so a reader
  // grabbing the reference never sees a half-updated array.
  @Nullable private static volatile double[][] routeCoords = null;
  // Same null-until-first-push/wholesale-replace shape as routeCoords.
  @Nullable private static volatile double[] destinationCoords = null;
  private static volatile double[][] stopCoords = new double[0][2];
  private static volatile boolean hasPosition = false;
  private static volatile double posLng = 0;
  private static volatile double posLat = 0;
  private static volatile double posHeadingDeg = 0;

  private CarNavState() {}

  /** NavigationScreen sets itself as the listener while on screen, so a
   * state push while the host isn't showing the nav screen at all doesn't
   * do pointless work — cleared again in the screen's onScreenFinished-style
   * teardown (see NavigationScreen). Only one listener at a time is ever
   * needed — a single Screen instance per car connection. */
  static void setListener(@Nullable Listener l) {
    listener = l;
  }

  /** CarNavPlugin registers this exactly once, in its load() (called once
   * per app process by the Capacitor Bridge) — unlike Listener above, this
   * one has nothing to do with which Screen is currently visible. A car
   * session can connect to CarNavService entirely independently of whether
   * MainActivity has ever run (confirmed live: the host launches this app's
   * process directly for CarNavService, phone UI or not) — until this is
   * non-null, nothing on the phone side (position, route, search) will ever
   * reach the car at all. notifyListener() here (not just in the state
   * setters, as everywhere else in this class) is what lets NavigationScreen
   * notice the bridge just connected and swap its "open on your phone"
   * message for the real map — see isPhoneBridgeConnected(). */
  static void setActionListener(@Nullable ActionListener l) {
    actionListener = l;
    notifyListener();
  }

  static boolean isPhoneBridgeConnected() {
    return actionListener != null;
  }

  static void requestStop() {
    ActionListener l = actionListener;
    if (l != null) l.onStopRequested();
  }

  static void requestToggleVoice() {
    ActionListener l = actionListener;
    if (l != null) l.onToggleVoiceRequested();
  }

  static void setVoiceMode(String mode) {
    voiceMode = mode;
    notifyListener();
  }

  static String getVoiceMode() {
    return voiceMode;
  }

  static void setSearchResultsListener(@Nullable SearchResultsListener l) {
    searchResultsListener = l;
  }

  /** Called by CarSearchResultsScreen when it starts — resets to the
   * loading state and asks app.js to run the search, mirroring exactly what
   * the phone's own along-route-search category chips do. */
  static void requestSearch(String tag) {
    searchResults = null;
    searchError = null;
    notifySearchResultsListener();
    ActionListener l = actionListener;
    if (l != null) l.onSearchRequested(tag);
  }

  static void setSearchResults(@Nullable List<SearchResult> results, @Nullable String error) {
    searchResults = results;
    searchError = error;
    notifySearchResultsListener();
  }

  @Nullable
  static List<SearchResult> getSearchResults() {
    return searchResults;
  }

  @Nullable
  static String getSearchError() {
    return searchError;
  }

  static void requestSelectSearchResult(int index) {
    ActionListener l = actionListener;
    if (l != null) l.onSearchResultSelected(index);
  }

  /** Same request/response shape and the same searchResults/searchError/
   * SearchResultsListener slot as requestSearch() above — CarSearchResultsScreen
   * and CarDestinationSearchScreen are never on screen at the same time (Car
   * App Library shows exactly one Screen at once), so sharing the slot is
   * simpler than a second parallel copy of the same three fields. */
  static void requestDestinationSearch(String query) {
    searchResults = null;
    searchError = null;
    notifySearchResultsListener();
    ActionListener l = actionListener;
    if (l != null) l.onDestinationSearchRequested(query);
  }

  static void requestSelectDestination(int index) {
    ActionListener l = actionListener;
    if (l != null) l.onDestinationSelected(index);
  }

  /** Called when CarDestinationSearchScreen's query becomes too short to
   * search (see its onSearchTextChanged) — clears any previous results
   * without going through the loading state a real search would. */
  static void clearSearchResults() {
    searchResults = null;
    searchError = null;
    notifySearchResultsListener();
  }

  static void setNavigating(boolean active) {
    navigating = active;
    // Clears the just-finished trip's route line so it doesn't linger on
    // the car map forever — confirmed live: without this, setRoute() kept
    // firing with the same stale coordinates after "ended navigation" since
    // nothing ever told the map the route was gone. Position/puck are left
    // alone — same as Google Maps, which keeps showing your dot after a
    // trip ends, just without the route line. Destination/stop pins clear
    // the same way, for the same reason.
    if (!active) {
      routeCoords = null;
      destinationCoords = null;
      stopCoords = new double[0][2];
    }
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

  static void setRoute(double[][] coords) {
    routeCoords = coords;
    notifyListener();
  }

  @Nullable
  static double[][] getRouteCoords() {
    return routeCoords;
  }

  /** Destination/stop pins for the car map — same phone convention (see
   * updatePlanningMarkers in app.js): a red pin for the destination, numbered
   * orange pins for stops in visit order. `destination` is null if there's
   * no destination yet (matches getRouteCoords' null-until-first-push shape). */
  static void setWaypoints(@Nullable double[] destination, double[][] stops) {
    destinationCoords = destination;
    stopCoords = stops;
    notifyListener();
  }

  @Nullable
  static double[] getDestinationCoords() {
    return destinationCoords;
  }

  static double[][] getStopCoords() {
    return stopCoords;
  }

  static void setPosition(double lng, double lat, double headingDeg) {
    posLng = lng;
    posLat = lat;
    posHeadingDeg = headingDeg;
    hasPosition = true;
    notifyListener();
  }

  static boolean hasPosition() {
    return hasPosition;
  }

  static double getPosLng() {
    return posLng;
  }

  static double getPosLat() {
    return posLat;
  }

  static double getPosHeadingDeg() {
    return posHeadingDeg;
  }

  private static void notifyListener() {
    Listener l = listener;
    if (l != null) l.onCarNavStateChanged();
  }

  private static void notifySearchResultsListener() {
    SearchResultsListener l = searchResultsListener;
    if (l != null) l.onSearchResultsChanged();
  }
}
