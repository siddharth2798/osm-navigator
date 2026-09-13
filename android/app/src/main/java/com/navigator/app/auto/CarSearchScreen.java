package com.navigator.app.auto;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Category picker for "search along route" — same 8 categories, same OSM
 * tags, as the phone's own along-route search popover (see app.js's
 * CHIP_CATEGORY_TAGS), so results always match what the phone would show.
 * Picking a category pushes CarSearchResultsScreen, which runs the actual
 * search via CarNavState/app.js.
 */
final class CarSearchScreen extends Screen {
  // Same tags/order as app.js's CHIP_CATEGORY_TAGS and index.html's category
  // chip row — kept in sync manually, same tradeoff as the maneuver-icon
  // vocabulary elsewhere in this package.
  private static final Map<String, String> CATEGORY_LABELS = buildCategoryLabels();

  CarSearchScreen(@NonNull CarContext carContext) {
    super(carContext);
  }

  @NonNull
  @Override
  public Template onGetTemplate() {
    ItemList.Builder items = new ItemList.Builder();
    for (Map.Entry<String, String> entry : CATEGORY_LABELS.entrySet()) {
      String tag = entry.getKey();
      String label = entry.getValue();
      items.addItem(new Row.Builder()
          .setTitle(label)
          .setBrowsable(true)
          .setOnClickListener(() -> getScreenManager().push(new CarSearchResultsScreen(getCarContext(), tag, label)))
          .build());
    }
    return new ListTemplate.Builder()
        .setTitle("Search along route")
        .setHeaderAction(Action.BACK)
        .setSingleList(items.build())
        .build();
  }

  private static Map<String, String> buildCategoryLabels() {
    Map<String, String> m = new LinkedHashMap<>();
    m.put("amenity=fuel", "Petrol pumps");
    m.put("amenity=charging_station", "EV charging");
    m.put("amenity=pharmacy", "Pharmacies");
    m.put("amenity=atm", "ATMs");
    m.put("amenity=hospital", "Hospitals");
    m.put("amenity=restaurant", "Restaurants");
    m.put("amenity=parking", "Parking");
    m.put("tourism=hotel", "Hotels");
    return m;
  }
}
