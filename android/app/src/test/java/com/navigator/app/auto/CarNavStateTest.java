package com.navigator.app.auto;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.After;
import org.junit.Test;

/**
 * Unit tests for CarNavState — the plain static singleton bridging
 * CarNavPlugin (phone side, written from app.js) and
 * NavigationScreen/CarSearchScreen/CarDestinationSearchScreen (car side).
 * Pure JVM tests (src/test, not src/androidTest) — this class has no
 * Android-framework dependency beyond @Nullable.
 *
 * CarNavState's fields are static, so state persists across test methods
 * within the same JVM (Gradle doesn't fork a fresh JVM per @Test). Every
 * test below sets up and asserts only the fields it cares about (never
 * relying on some assumed "fresh" initial value), so they're safe regardless
 * of execution order. The @After hook still clears the three listener slots
 * between tests, purely so a bug in one test can't cause a stale listener to
 * fire during another.
 */
public class CarNavStateTest {

  @After
  public void tearDown() {
    CarNavState.setListener(null);
    CarNavState.setActionListener(null);
    CarNavState.setSearchResultsListener(null);
  }

  /** Hand-rolled test doubles — no mocking library in this project's test
   * dependencies yet, and these listener interfaces are small enough (1-6
   * methods, no return values) that Mockito would just be ceremony. */
  private static final class RecordingListener implements CarNavState.Listener {
    int notifyCount = 0;

    @Override
    public void onCarNavStateChanged() {
      notifyCount++;
    }
  }

  private static final class RecordingActionListener implements CarNavState.ActionListener {
    boolean stopRequested = false;
    boolean toggleVoiceRequested = false;
    String searchTag = null;
    Integer selectedSearchResultIndex = null;
    String destinationSearchQuery = null;
    Integer selectedDestinationIndex = null;

    @Override
    public void onStopRequested() {
      stopRequested = true;
    }

    @Override
    public void onToggleVoiceRequested() {
      toggleVoiceRequested = true;
    }

    @Override
    public void onSearchRequested(String tag) {
      searchTag = tag;
    }

    @Override
    public void onSearchResultSelected(int index) {
      selectedSearchResultIndex = index;
    }

    @Override
    public void onDestinationSearchRequested(String query) {
      destinationSearchQuery = query;
    }

    @Override
    public void onDestinationSelected(int index) {
      selectedDestinationIndex = index;
    }
  }

  private static final class RecordingSearchResultsListener
      implements CarNavState.SearchResultsListener {
    int notifyCount = 0;

    @Override
    public void onSearchResultsChanged() {
      notifyCount++;
    }
  }

  // --- voice mode ---

  @Test
  public void setVoiceMode_updatesGetterAndNotifiesListener() {
    RecordingListener listener = new RecordingListener();
    CarNavState.setListener(listener);

    CarNavState.setVoiceMode("alerts");

    assertEquals("alerts", CarNavState.getVoiceMode());
    assertEquals(1, listener.notifyCount);
  }

  // --- navigating / turn card / route / waypoint clearing ---

  @Test
  public void setNavigating_updatesGetterAndNotifiesListener() {
    RecordingListener listener = new RecordingListener();
    CarNavState.setListener(listener);

    CarNavState.setNavigating(true);

    assertTrue(CarNavState.isNavigating());
    assertEquals(1, listener.notifyCount);
  }

  @Test
  public void setNavigating_false_clearsRouteDestinationAndStops() {
    CarNavState.setRoute(new double[][] {{1, 2}, {3, 4}});
    CarNavState.setWaypoints(new double[] {5, 6}, new double[][] {{7, 8}});
    CarNavState.setNavigating(true);

    CarNavState.setNavigating(false);

    assertFalse(CarNavState.isNavigating());
    assertNull(CarNavState.getRouteCoords());
    assertNull(CarNavState.getDestinationCoords());
    assertEquals(0, CarNavState.getStopCoords().length);
  }

  @Test
  public void setNavigating_true_leavesExistingRouteAndWaypointsAlone() {
    double[][] route = {{1, 2}, {3, 4}};
    double[] destination = {5, 6};
    double[][] stops = {{7, 8}};
    CarNavState.setRoute(route);
    CarNavState.setWaypoints(destination, stops);

    CarNavState.setNavigating(true);

    assertArrayEquals(route, CarNavState.getRouteCoords());
    assertArrayEquals(destination, CarNavState.getDestinationCoords(), 0.0);
    assertArrayEquals(stops, CarNavState.getStopCoords());
  }

  @Test
  public void updateTurnCard_updatesAllFieldsAndNotifiesListener() {
    RecordingListener listener = new RecordingListener();
    CarNavState.setListener(listener);

    CarNavState.updateTurnCard("turn-right", "Turn right onto Main St", 50.0, 1200.0, 180.0);

    assertEquals("turn-right", CarNavState.getManeuverKind());
    assertEquals("Turn right onto Main St", CarNavState.getInstruction());
    assertEquals(50.0, CarNavState.getStepDistM(), 0.0);
    assertEquals(1200.0, CarNavState.getRemainingDistM(), 0.0);
    assertEquals(180.0, CarNavState.getRemainingTimeS(), 0.0);
    assertEquals(1, listener.notifyCount);
  }

  @Test
  public void setRoute_updatesGetterAndNotifiesListener() {
    RecordingListener listener = new RecordingListener();
    CarNavState.setListener(listener);
    double[][] route = {{10, 20}, {30, 40}};

    CarNavState.setRoute(route);

    assertArrayEquals(route, CarNavState.getRouteCoords());
    assertEquals(1, listener.notifyCount);
  }

  @Test
  public void setWaypoints_updatesGettersAndNotifiesListener() {
    RecordingListener listener = new RecordingListener();
    CarNavState.setListener(listener);
    double[] destination = {11, 22};
    double[][] stops = {{33, 44}, {55, 66}};

    CarNavState.setWaypoints(destination, stops);

    assertArrayEquals(destination, CarNavState.getDestinationCoords(), 0.0);
    assertArrayEquals(stops, CarNavState.getStopCoords());
    assertEquals(1, listener.notifyCount);
  }

  @Test
  public void setWaypoints_nullDestination_isAllowed() {
    CarNavState.setWaypoints(null, new double[0][2]);

    assertNull(CarNavState.getDestinationCoords());
  }

  @Test
  public void setPosition_updatesGettersAndNotifiesListener() {
    RecordingListener listener = new RecordingListener();
    CarNavState.setListener(listener);

    CarNavState.setPosition(12.34, 56.78, 90.0);

    assertTrue(CarNavState.hasPosition());
    assertEquals(12.34, CarNavState.getPosLng(), 0.0);
    assertEquals(56.78, CarNavState.getPosLat(), 0.0);
    assertEquals(90.0, CarNavState.getPosHeadingDeg(), 0.0);
    assertEquals(1, listener.notifyCount);
  }

  // --- search results three-way state machine (null/null = loading,
  // results = loaded, error = failed) ---

  @Test
  public void requestSearch_resetsToLoadingStateAndForwardsTagToActionListener() {
    // Seed a previously-completed search first, so this actually proves
    // requestSearch() resets it rather than coincidentally starting fresh.
    CarNavState.setSearchResults(
        Arrays.asList(new CarNavState.SearchResult("Cafe", "1.2 km")), null);
    RecordingActionListener actionListener = new RecordingActionListener();
    CarNavState.setActionListener(actionListener);
    RecordingSearchResultsListener resultsListener = new RecordingSearchResultsListener();
    CarNavState.setSearchResultsListener(resultsListener);

    CarNavState.requestSearch("fuel");

    assertNull(CarNavState.getSearchResults());
    assertNull(CarNavState.getSearchError());
    assertEquals(1, resultsListener.notifyCount);
    assertEquals("fuel", actionListener.searchTag);
  }

  @Test
  public void setSearchResults_loaded_setsResultsAndClearsError() {
    RecordingSearchResultsListener resultsListener = new RecordingSearchResultsListener();
    CarNavState.setSearchResultsListener(resultsListener);
    List<CarNavState.SearchResult> results =
        Arrays.asList(new CarNavState.SearchResult("Gas Station", "0.5 km"));

    CarNavState.setSearchResults(results, null);

    assertEquals(results, CarNavState.getSearchResults());
    assertNull(CarNavState.getSearchError());
    assertEquals(1, resultsListener.notifyCount);
  }

  @Test
  public void setSearchResults_error_setsErrorAndClearsResults() {
    RecordingSearchResultsListener resultsListener = new RecordingSearchResultsListener();
    CarNavState.setSearchResultsListener(resultsListener);

    CarNavState.setSearchResults(null, "network error");

    assertNull(CarNavState.getSearchResults());
    assertEquals("network error", CarNavState.getSearchError());
    assertEquals(1, resultsListener.notifyCount);
  }

  @Test
  public void setSearchResults_emptyList_isDistinctFromLoadingOrError() {
    CarNavState.setSearchResults(new ArrayList<CarNavState.SearchResult>(), null);

    assertNotNull(CarNavState.getSearchResults());
    assertTrue(CarNavState.getSearchResults().isEmpty());
    assertNull(CarNavState.getSearchError());
  }

  @Test
  public void clearSearchResults_resetsBothResultsAndError() {
    CarNavState.setSearchResults(null, "some error");
    RecordingSearchResultsListener resultsListener = new RecordingSearchResultsListener();
    CarNavState.setSearchResultsListener(resultsListener);

    CarNavState.clearSearchResults();

    assertNull(CarNavState.getSearchResults());
    assertNull(CarNavState.getSearchError());
    assertEquals(1, resultsListener.notifyCount);
  }

  // --- car-initiated actions (ActionListener) ---

  @Test
  public void requestStop_forwardsToActionListener() {
    RecordingActionListener actionListener = new RecordingActionListener();
    CarNavState.setActionListener(actionListener);

    CarNavState.requestStop();

    assertTrue(actionListener.stopRequested);
  }

  @Test
  public void requestToggleVoice_forwardsToActionListener() {
    RecordingActionListener actionListener = new RecordingActionListener();
    CarNavState.setActionListener(actionListener);

    CarNavState.requestToggleVoice();

    assertTrue(actionListener.toggleVoiceRequested);
  }

  @Test
  public void requestSelectSearchResult_forwardsIndexToActionListener() {
    RecordingActionListener actionListener = new RecordingActionListener();
    CarNavState.setActionListener(actionListener);

    CarNavState.requestSelectSearchResult(3);

    assertEquals(Integer.valueOf(3), actionListener.selectedSearchResultIndex);
  }

  @Test
  public void requestDestinationSearch_forwardsQueryToActionListenerAndResetsResults() {
    CarNavState.setSearchResults(Arrays.asList(new CarNavState.SearchResult("Old", "1 km")), null);
    RecordingActionListener actionListener = new RecordingActionListener();
    CarNavState.setActionListener(actionListener);
    RecordingSearchResultsListener resultsListener = new RecordingSearchResultsListener();
    CarNavState.setSearchResultsListener(resultsListener);

    CarNavState.requestDestinationSearch("coffee");

    assertEquals("coffee", actionListener.destinationSearchQuery);
    assertNull(CarNavState.getSearchResults());
    assertNull(CarNavState.getSearchError());
    assertEquals(1, resultsListener.notifyCount);
  }

  @Test
  public void requestSelectDestination_forwardsIndexToActionListener() {
    RecordingActionListener actionListener = new RecordingActionListener();
    CarNavState.setActionListener(actionListener);

    CarNavState.requestSelectDestination(2);

    assertEquals(Integer.valueOf(2), actionListener.selectedDestinationIndex);
  }

  // --- no listener registered yet: request methods must not throw ---

  @Test
  public void requestStop_withNoActionListener_doesNotThrow() {
    CarNavState.setActionListener(null);
    CarNavState.requestStop();
  }

  @Test
  public void requestToggleVoice_withNoActionListener_doesNotThrow() {
    CarNavState.setActionListener(null);
    CarNavState.requestToggleVoice();
  }

  @Test
  public void requestSearch_withNoActionListener_doesNotThrow() {
    CarNavState.setActionListener(null);
    CarNavState.requestSearch("fuel");
  }

  @Test
  public void requestSelectSearchResult_withNoActionListener_doesNotThrow() {
    CarNavState.setActionListener(null);
    CarNavState.requestSelectSearchResult(0);
  }

  @Test
  public void requestDestinationSearch_withNoActionListener_doesNotThrow() {
    CarNavState.setActionListener(null);
    CarNavState.requestDestinationSearch("query");
  }

  @Test
  public void requestSelectDestination_withNoActionListener_doesNotThrow() {
    CarNavState.setActionListener(null);
    CarNavState.requestSelectDestination(0);
  }

  @Test
  public void setters_withNoNavStateListenerRegistered_doNotThrow() {
    CarNavState.setListener(null);
    CarNavState.setVoiceMode("all");
    CarNavState.setNavigating(false);
    CarNavState.updateTurnCard("straight", "", 0, 0, 0);
    CarNavState.setRoute(null);
    CarNavState.setWaypoints(null, new double[0][2]);
    CarNavState.setPosition(0, 0, 0);
  }

  @Test
  public void setSearchResults_withNoSearchResultsListener_doesNotThrow() {
    CarNavState.setSearchResultsListener(null);
    CarNavState.setSearchResults(null, "err");
  }
}
