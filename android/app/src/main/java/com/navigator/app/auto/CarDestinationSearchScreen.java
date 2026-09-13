package com.navigator.app.auto;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.Row;
import androidx.car.app.model.SearchTemplate;
import androidx.car.app.model.Template;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

import java.util.List;

/**
 * "Where to?" — a free-text destination search, the car-side equivalent of
 * the phone's own search box (see selectPlace/geocodeSearch in app.js), for
 * starting a brand-new trip straight from the car screen (Google
 * Maps/Waze's own Android Auto pattern). A different feature from
 * CarSearchScreen/CarSearchResultsScreen (search *along an already-active
 * route*, for stops) — this one has no route yet and can run whether or not
 * navigation is currently active. Shares CarNavState's search-results
 * plumbing with that other feature (see requestDestinationSearch's own
 * note) since the two screens are never on screen at once.
 */
final class CarDestinationSearchScreen extends Screen
    implements CarNavState.SearchResultsListener, DefaultLifecycleObserver, SearchTemplate.SearchCallback {
  // Below this, searching is more noise than signal (e.g. a single typed
  // letter matching half the map) — matches the general expectation search
  // boxes set everywhere else in this app.
  private static final int MIN_QUERY_LENGTH = 2;

  private String pendingQuery = "";

  CarDestinationSearchScreen(@NonNull CarContext carContext) {
    super(carContext);
    getLifecycle().addObserver(this);
  }

  @Override
  public void onStart(@NonNull LifecycleOwner owner) {
    CarNavState.setSearchResultsListener(this);
  }

  @Override
  public void onStop(@NonNull LifecycleOwner owner) {
    CarNavState.setSearchResultsListener(null);
  }

  @Override
  public void onSearchResultsChanged() {
    invalidate();
  }

  // Fires on every keystroke — app.js debounces the actual network request
  // (see onCarDestinationSearchRequested), so this can call straight through
  // without its own debounce/throttle here.
  @Override
  public void onSearchTextChanged(@NonNull String searchText) {
    pendingQuery = searchText;
    if (searchText.trim().length() < MIN_QUERY_LENGTH) {
      CarNavState.clearSearchResults();
      invalidate();
      return;
    }
    CarNavState.requestDestinationSearch(searchText);
    invalidate(); // shows the loading state immediately, not just once results land
  }

  @Override
  public void onSearchSubmitted(@NonNull String searchText) {
    onSearchTextChanged(searchText);
  }

  @NonNull
  @Override
  public Template onGetTemplate() {
    SearchTemplate.Builder builder = new SearchTemplate.Builder(this)
        .setHeaderAction(Action.BACK)
        .setSearchHint("Search for a destination")
        .setShowKeyboardByDefault(true);

    if (pendingQuery.trim().length() < MIN_QUERY_LENGTH) {
      return builder.build(); // just the search bar, nothing typed yet
    }

    List<CarNavState.SearchResult> results = CarNavState.getSearchResults();
    String error = CarNavState.getSearchError();
    if (results == null && error == null) {
      return builder.setLoading(true).build();
    }

    ItemList.Builder items = new ItemList.Builder();
    if (error != null) {
      items.setNoItemsMessage(error);
    } else if (results.isEmpty()) {
      items.setNoItemsMessage("No results found.");
    } else {
      for (int i = 0; i < results.size(); i++) {
        CarNavState.SearchResult r = results.get(i);
        int index = i; // captured by the lambda below — must be effectively final
        items.addItem(new Row.Builder()
            .setTitle(r.label)
            .addText(r.distanceText)
            .setOnClickListener(() -> {
              CarNavState.requestSelectDestination(index);
              getScreenManager().popToRoot();
            })
            .build());
      }
    }
    return builder.setItemList(items.build()).build();
  }
}
