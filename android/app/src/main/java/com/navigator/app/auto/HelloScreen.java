package com.navigator.app.auto;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Template;

/**
 * Phase 0 placeholder — a static MessageTemplate, which has a simpler
 * permission surface than NavigationTemplate (no NAVIGATION_TEMPLATES-
 * gated APIs), specifically so the DHU test loop (manifest + service +
 * session + a real template rendering on a simulated head unit) can be
 * proven working before any nav-specific requirements are added. Replaced
 * by NavigationScreen in Phase 1.
 */
final class HelloScreen extends Screen {
  HelloScreen(@NonNull CarContext carContext) {
    super(carContext);
  }

  @NonNull
  @Override
  public Template onGetTemplate() {
    return new MessageTemplate.Builder("Start navigation on your phone.")
        .setTitle(getCarContext().getString(com.navigator.app.R.string.app_name))
        .build();
  }
}
