# Kochi Metro + Kochi Water Metro transit routing

Transit mode routes through Kochi Metro (rail) and Kochi Water Metro (ferry) using real, bundled station/schedule data — no self-hosted service required. This is deliberately Kochi-specific (see `CONFIG.KOCHI_TRANSIT_ENABLED` in `config.js`), not a generic transit backend.

## Why no OpenTripPlanner 2 (OTP2)

The app's transit mode also supports a generic OTP2 backend (`CONFIG.OTP2_URL`) for anyone self-hosting a real trip planner for their own city. Kochi doesn't need one: Kochi Metro is a single line (~25 stations), and Kochi Water Metro is ~10 jetties with a small, mostly star-shaped set of direct routes. Running a JVM trip planner for a network this size is disproportionate — it needs a built graph (memory/CPU-heavy, a real risk on something like a Raspberry Pi), a systemd service, and periodic rebuilds, for a problem that's genuinely just "nearest station, count the stops, roughly when." `app.js`'s `buildKochiItinerary` does that directly, and reuses this app's own Valhalla-backed walk/drive routing for the first/last mile (walk if the nearest station is close, drive if it's far — the same choice Google Maps offers for park-and-ride). OTP2 is only tried as a fallback, for a different city entirely.

## Where the data comes from

### Kochi Metro (`vendor/kochi-metro.json`, via `scripts/build-kochi-metro-data.mjs`)

Kochi Metro Rail Limited (KMRL) publishes a real, official static GTFS feed — has since 2018, India's first transit agency to do so.

- **Source**: `http://kochimetro.org/opendata/KMRLOpenData.zip`
- **Required attribution**: *"Contains data provided by Kochi Metro Rail Limited"*
- **License**: free for commercial and non-commercial use, provided AS-IS, no endorsement claims. KMRL does **not** guarantee updates or notify of changes.
- **Rerun the build script** whenever KMRL republishes (e.g. once they extend the calendar past its current end date — see the caveat below), and commit the regenerated JSON.
- **Calendar staleness, checked and harmless**: the feed's own `feed_info.txt`/`calendar.txt` currently end 2025-12-31. This script only extracts the *recurring schedule pattern* (station order, coordinates, real per-station trip-time offsets, real trip start times for weekday vs. weekend service) — not literal calendar-date validity — so a stale end date doesn't affect what's bundled. It would matter if you were doing calendar-exact service-day validation (a real OTP2/GTFS consumer would), which this deliberately isn't.
- **Weekday/weekend split is NOT Mon-Fri/Sat-Sun**: KMRL's own `calendar.txt` defines service `WK` (Monday-**Saturday**) and `WE` (**Sunday only**). `planKochiMetroRideLeg` in `app.js` checks specifically for Sunday, not "is it the weekend."
- **Single line, no branches** — confirmed at build time (the script throws if a future KMRL feed ever shows more than one route or more than 2 shapes, since the whole "just slice an ordered array" approach in `app.js` depends on that).

### Kochi Water Metro (`vendor/kochi-water-metro.json`, via `scripts/build-water-metro-data.mjs`)

**No GTFS or open-data feed exists for Water Metro anywhere** — checked KMRL's own open-data page, Transitland, and the independent `KochiTransport` OSM-derived dataset, which explicitly excludes Water Metro. Two real, unofficial sources fill the gap instead:

- **Schedule + route graph**: `https://watermetro.co.in/api/schedule?from=<Station>&to=<Station>` — a real, live, unauthenticated JSON endpoint on their own site (discovered via the site's own "Boat schedule" search feature, not documented anywhere). Returns genuine per-sailing departure/arrival times. The build script probes every ordered pair among the 10 known terminal names and keeps only the pairs that return real sailings — this is how the actual route graph (20 direct routes, as of this writing) was discovered, rather than trusted from the site's own minified JS bundle, which turned out to contain an internally inconsistent route list when inspected.
- **Jetty coordinates**: each terminal's own page (`https://watermetro.co.in/terminal/<slug>`) embeds a real "Get Directions" Google Maps link pointing at the exact jetty. The build script fetches each page, follows that link's redirect, and parses the resolved URL's own coordinate encoding — first-party data from the operator, not a geocoding guess (a plain Nominatim text search for these jetties turns up nothing at all — checked).
- **This is undocumented and unofficial** — not a published feed, could change or disappear without notice. The build script is deliberately gentle (sequential requests with a real delay) and is meant to be rerun occasionally by a human, never polled by the deployed app.
- **Willingdon Island has no live schedule data** despite being a listed terminal — every pair involving it returned an empty schedule when probed (checked directly). It's still in the bundled station list (for display/geocoding), just unreachable by `findKochiWaterMetroPath` until the live API shows otherwise. Rerun the build script periodically to pick this up if/when it changes.
- **Transfers**: the graph is small and mostly star-shaped through `HighCourt` — `findKochiWaterMetroPath` tries a direct route, then every possible single transfer point. This isn't general graph search; it doesn't need to be, at this size.
- **The network is genuinely two disconnected clusters, not a bug**: `Kakkanad`/`Vytilla` only connect to each other, with no boat link (direct or via any transfer) to the `HighCourt`-hub cluster (`Fort Kochi`, `Vypin`, `Mattancherry`, `South Chittoor`, `Cheranalloor`, `Eloor`) — confirmed both by directly probing the live API (`Fort Kochi→Kakkanad` returns `[]`) and structurally in the discovered route graph. `findKochiWaterMetroPath` correctly returns no path for any cross-cluster pair; that's accurately reflecting how the service actually operates today, not something to route around.

## Rerunning the build scripts

```
node scripts/build-kochi-metro-data.mjs
node scripts/build-water-metro-data.mjs
```

Both print a summary (station/route counts, any missing coordinates) and overwrite the `vendor/*.json` files directly — review the diff before committing, same as any other data refresh.

## Rendering

No new rendering code beyond `CAR` support for park-and-ride legs — the existing transit map layers already color `FERRY` legs cyan and `RAIL`/`SUBWAY`/`TRAM` legs purple (Kochi Metro's GTFS `route_type` is 1, "Subway/Metro," which falls into that same purple bucket), and `renderTransitManeuverList` already builds "Board X, ride N stops, alight at Y" text generically off any itinerary-shaped object — `buildKochiItinerary`'s output just fits that same shape.

Each ride leg also carries a real `waitS` (seconds until the next actual departure, computed from the bundled schedule — see `planKochiMetroRideLeg`/`planKochiWaterMetroRideLegs`), shown as a "Next departure in N min" line. This field simply doesn't exist on an OTP2 leg, so that rendering path is untouched — no mode check needed, just `leg.waitS != null`.

## Not yet built: live tracking during the ride

Transit mode is still planning/rendering only — no live GPS-guided tracking once you've boarded (see `docs/LIMITATIONS.md`). The building blocks mostly already exist (this app's own puck marker, GPS-fix handling, and `turf.nearestPointOnLine` line-snapping, all reused from drive/walk mode) and a concrete design has been scoped, but it's a real feature addition, not implemented yet.
