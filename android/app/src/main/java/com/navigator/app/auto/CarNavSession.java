package com.navigator.app.auto;

import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.car.app.Screen;
import androidx.car.app.Session;

/**
 * One Session per car connection (its lifecycle is tied to the car being
 * connected, not to MainActivity/the WebView — a car session can exist
 * whether or not the phone app is foregrounded).
 */
public final class CarNavSession extends Session {
  @NonNull
  @Override
  public Screen onCreateScreen(@NonNull Intent intent) {
    return new NavigationScreen(getCarContext());
  }
}
