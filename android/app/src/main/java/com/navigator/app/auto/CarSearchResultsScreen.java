package com.navigator.app.auto;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

import java.util.List;

/**
 * Results for one category, searched along the *current* route — same
 * request/response shape as every other JS bridge in this package.
 * onStart() asks app.js to run the exact same categorySearchAlongRoute() the
 * phone's own popover uses (see CarNavState.requestSearch); results arrive
 * async via CarNavState.setSearchResults(), reflected here through a
 * dedicated SearchResultsListener — kept separate from NavigationScreen's
 * own Listener so a search screen being open doesn't interrupt
 * NavigationScreen's ongoing trip updates. Picking a row runs the exact same
 * addStopFromPoi() the phone uses, via requestSelectSearchResult().
 */
final class CarSearchResultsScreen extends Screen implements CarNavState.SearchResultsListener, DefaultLifecycleObserver {
  private final String tag;
  private final String label;

  CarSearchResultsScreen(@NonNull CarContext carContext, String tag, String label) {
    super(carContext);
    this.tag = tag;
    this.label = label;
    getLifecycle().addObserver(this);
  }

  @Override
  public void onStart(@NonNull LifecycleOwner owner) {
    CarNavState.setSearchResultsListener(this);
    CarNavState.requestSearch(tag);
  }

  @Override
  public void onStop(@NonNull LifecycleOwner owner) {
    CarNavState.setSearchResultsListener(null);
  }

  @Override
  public void onSearchResultsChanged() {
    invalidate();
  }

  @NonNull
  @Override
  public Template onGetTemplate() {
    ListTemplate.Builder builder = new ListTemplate.Builder()
        .setTitle(label)
        .setHeaderAction(Action.BACK);

    List<CarNavState.SearchResult> results = CarNavState.getSearchResults();
    String error = CarNavState.getSearchError();
    if (results == null && error == null) {
      return builder.setLoading(true).build();
    }

    ItemList.Builder items = new ItemList.Builder();
    if (error != null) {
      items.setNoItemsMessage(error);
    } else if (results.isEmpty()) {
      items.setNoItemsMessage("Nothing found along your route.");
    } else {
      for (int i = 0; i < results.size(); i++) {
        CarNavState.SearchResult r = results.get(i);
        int index = i; // captured by the lambda below — must be effectively final
        items.addItem(new Row.Builder()
            .setTitle(r.label)
            .addText(r.distanceText)
            .setOnClickListener(() -> {
              CarNavState.requestSelectSearchResult(index);
              getScreenManager().popToRoot();
            })
            .build());
      }
    }
    return builder.setSingleList(items.build()).build();
  }
}
