package com.navigator.app.auto;

import android.content.pm.ApplicationInfo;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

/**
 * Entry point for Android Auto phone-projection — declared in
 * AndroidManifest.xml with the androidx.car.app.CarAppService intent-filter
 * action and androidx.car.app.category.NAVIGATION category. Everything the
 * car screen shows starts here: the host binds to this service, calls
 * onCreateSession() once per car connection, and the returned Session picks
 * the first Screen (see CarNavSession).
 */
public final class CarNavService extends CarAppService {
  @NonNull
  @Override
  public Session onCreateSession() {
    return new CarNavSession();
  }

  /**
   * Personal/developer-use scope (see the plan doc) — debug builds accept
   * any host so the DHU emulator and a real head unit both just work with
   * zero extra setup. Falls back to the Car App Library's own bundled
   * sample allowlist for a non-debug build, rather than ALLOW_ALL_HOSTS,
   * which Google's own docs warn against shipping.
   */
  @NonNull
  @Override
  public HostValidator createHostValidator() {
    if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
    }
    return new HostValidator.Builder(getApplicationContext())
        .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
        .build();
  }
}
