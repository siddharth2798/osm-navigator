# Kochi Metro + Kochi Water Metro transit routing

Transit mode routes through Kochi Metro (rail), Kochi Water Metro (ferry), and KMRL's "Metro Connect" feeder buses, using bundled station/schedule data — no self-hosted service required. This is Kochi-specific (`CONFIG.KOCHI_TRANSIT_ENABLED` in `config.js`), not a generic transit backend.

The wider Kochi-area KSRTC/private bus network isn't covered. A GTFS feed exists for it (Jungle-Bus/`KochiTransport`, 461 routes), but it's too large a trip-planning problem for this app's per-network leg-builder. Only feeder routes that connect directly to a metro station are in scope.

## Why no OpenTripPlanner 2 (OTP2)

The app also supports a generic OTP2 backend (`CONFIG.OTP2_URL`) for self-hosting a trip planner for another city. Kochi doesn't need one — the network is small (one metro line, ~10 water-metro jetties), so `app.js`'s `buildKochiItineraries` computes itineraries directly instead of running a JVM trip planner, and reuses this app's own Valhalla-backed walk/drive routing for the first/last mile (walk if the nearest station is close, drive if far). OTP2 is only tried as a fallback, for a different city.

## Where the data comes from

### Kochi Metro (`vendor/kochi-metro.json`, via `scripts/build-kochi-metro-data.mjs`)

KMRL publishes an official static GTFS feed.

- **Source**: `http://kochimetro.org/opendata/KMRLOpenData.zip`
- **Required attribution**: *"Contains data provided by Kochi Metro Rail Limited"*
- **License**: free for commercial and non-commercial use, AS-IS, no endorsement claims. KMRL doesn't guarantee updates or notify of changes.
- **Rerun the build script** whenever KMRL republishes, and commit the regenerated JSON.
- **Calendar staleness is harmless**: `calendar.txt` currently ends 2025-12-31, but the script only extracts the recurring schedule pattern (station order, coordinates, trip-time offsets) — not calendar-date validity.
- **Weekday/weekend split is NOT Mon-Fri/Sat-Sun**: KMRL's `calendar.txt` defines `WK` (Monday–**Saturday**) and `WE` (**Sunday only**). `planKochiMetroRideLeg` checks specifically for Sunday.
- **Single line, no branches** — the build script throws if a future feed ever shows more than one route, since `app.js` assumes a single ordered station array.

### Kochi Water Metro (`vendor/kochi-water-metro.json`, via `scripts/build-water-metro-data.mjs`)

No GTFS or open-data feed exists for Water Metro. Two unofficial sources fill the gap:

- **Schedule + route graph**: `https://watermetro.co.in/api/schedule?from=<Station>&to=<Station>`, a live unauthenticated JSON endpoint (undocumented). The build script probes every pair among the 10 known terminals and keeps pairs that return real sailings (20 direct routes as of this writing).
- **Jetty coordinates**: each terminal's page (`https://watermetro.co.in/terminal/<slug>`) embeds a "Get Directions" Google Maps link. The build script follows it and parses the resolved coordinates.
- **Undocumented and unofficial** — could change or disappear without notice. The build script is deliberately gentle (sequential requests, a delay) and meant to be rerun occasionally by hand.
- **Willingdon Island has no live schedule data** despite being a listed terminal. It stays in the station list for display/geocoding, but `findKochiWaterMetroPath` can't route through it until the live API shows a sailing.
- **Transfers**: the graph is small and mostly star-shaped through `HighCourt` — `findKochiWaterMetroPath` tries a direct route, then every single transfer point.
- **The network is genuinely two disconnected clusters, not a bug**: `Kakkanad`/`Vytilla` only connect to each other, with no boat link to the `HighCourt`-hub cluster (`Fort Kochi`, `Vypin`, `Mattancherry`, `South Chittoor`, `Cheranalloor`, `Eloor`). `findKochiWaterMetroPath` correctly returns no path across clusters. The one combined Metro+Water-Metro itinerary today transfers through Vyttila/Vytilla because it's the only metro-station/jetty pair within `CONFIG.KOCHI_TRANSFER_MAX_M` (`findKochiTransferPoints`) — not hardcoded by name, so a future data refresh could surface other transfer points automatically.

### Kochi Metro feeder buses (`vendor/kochi-feeder-bus.json`, hand-authored)

No GTFS, API, or open-data feed exists for these. The only public source is `https://kochimetro.org/feeder-service-time-table/`, as timetable **images**, not structured data. The JSON is transcribed by hand — there's no build script, so staleness can only be caught by re-checking the images periodically.

- **Scope**: only the ~6 routes running directly to/from a metro station (Aluva, Kalamassery, Thripunithura) are bundled — Aluva↔CIAL Airport, Aluva↔Rajagiri Hospital, Kalamassery↔Medical College, Kalamassery↔CUSAT (via Rajagiri), Kalamassery↔Infopark (via Civil Station and the Kakkanad Water Metro jetty), Thripunithura↔Infopark (not on Sundays).
- **An older "Pavan Doot" Aluva↔CIAL timetable image also exists** on the same page, with different times and no fare — excluded as a likely superseded service. Worth checking if the bundled Aluva↔CIAL times look wrong.
- **Some routes are simplified.** The Kalamassery↔Infopark timetable has partial-length trips that don't reduce cleanly to fixed arrival times, so it's bundled as a departures list plus a rough `durationEstimateS` rather than exact arrivals (unlike Medical College, which has clean pairs). The Kalamassery↔CUSAT table's column order wasn't chronological in the source image — times are stored as printed.
- **Coordinates**: the three metro-station endpoints and the Kakkanad stop reuse existing coordinates from the metro/water-metro JSON. Every other stop was geocoded via plain Nominatim search.

## Fares

Shown per-leg and as an itinerary total — shown when known, omitted when not, never guessed:

- **Metro**: real and exact, from KMRL's GTFS `fare_attributes.txt`/`fare_rules.txt`, parsed into a `fares` map on `vendor/kochi-metro.json`.
- **Water Metro**: real, from an official fare chart (11 station-pairs, ₹20–₹60) covering all ~20 bundled routes. The chart notes *"Differential rates will apply on holidays, weekends & festival seasons"* — the bundled fare is the standard-day rate.
- **Feeder bus**: only as printed on the source images — CIAL Airport (₹80) and Rajagiri Hospital (₹15) show a fare; Medical College, CUSAT, Infopark, and Thripunithura don't, so those legs have no `fareINR`.

An itinerary whose ride legs aren't all priced shows its total as "from ₹X" (`fareIsPartial`) rather than a number that looks precise but understates the cost.

## Rerunning the build scripts

```
node scripts/build-kochi-metro-data.mjs
node scripts/build-water-metro-data.mjs
```

Both print a summary and overwrite the `vendor/*.json` files — review the diff before committing.

## Rendering

Almost no new rendering code, even for the feeder bus — the map layers already had a `BUS` color/icon, and `renderTransitManeuverList` already builds "Board X, ride N stops, alight at Y" text generically. `planKochiFeederBusRideLeg`'s output just tags `mode: 'BUS'` and fits that shape. `CAR` support (park-and-ride legs) and fare display (`formatFareINR`) are the only new bits.

Each ride leg carries a `waitS`/`waitsS` (seconds until the next departure(s), from the bundled schedule), shown as "Next departure in N min" or "Next departures in N, M, K min" for multiple (capped at 3 by `TRANSIT_UPCOMING_DEPARTURES`). Boarding detection only uses the first entry. These fields don't exist on an OTP2 leg, so that rendering path is untouched.

### Multiple itinerary alternatives

`buildKochiItineraries` builds up to ~10 candidate specs — metro-only (default alighting station plus the 2 next-best within `KOCHI_METRO_ALIGHT_WINDOW`), ferry-only, metro+water-metro combined through every transfer point, and metro+feeder-bus combined (capped at `KOCHI_MAX_FEEDER_SPECS`, ranked by proximity before spending a Valhalla call). It resolves each candidate's walk/drive access legs via Valhalla (deduped across candidates sharing a leg via `cachedDriveOrWalkLeg`, so a plan costs roughly 6-9 Valhalla round trips instead of a naive ~12), ranks survivors by total duration, dedupes by ride-leg signature, drops any survivor both slower and at-least-as-expensive as another (Pareto dominance, only when both fares are known), and caps the result to `KOCHI_MAX_ITINERARY_OPTIONS`.

The planning sheet shows every surviving option as a card (`renderTransitItineraryOptions`), separate from the drive-mode alternate-route cards since traffic overlays and Fastest/Shortest tags don't apply here. The row only appears with 2+ candidates.

### Stops

Adding stops (same "Add stop" UI as drive/walk, up to `CONFIG.MAX_STOPS`) plans each leg independently via `buildKochiItineraries` — `buildKochiMultiStopItinerary` fires them together (`Promise.all`, serialized by the same Valhalla rate limiter as everything else), then concatenates the shortest candidate from each segment. Segments are independent, so the shortest per-segment choice is provably the shortest whole-trip total, with no per-segment alternatives row needed. Every leg but the last gets the actual stop's name as its destination label, so the maneuver list reads e.g. "Walk to Edapally" instead of a generic "your destination." Live tracking needs no changes for this — it already walks `state.transitItinerary.legs` by index. OTP2 has no equivalent (its REST planner takes only a plain from/to) — a multi-stop trip fails outright with a clear error on the OTP2 fallback instead of silently dropping stops.

## Live tracking during the ride

Once `buildKochiItineraries` returns an itinerary (tagged `source: 'kochi'` — the OTP2 fallback never carries this), the "Start" button reappears on the planning sheet, same as drive/walk mode. Tapping it calls `startTransitNavigation`, which starts the same GPS watch and live puck drive/walk navigation uses, but drives its own leg-by-leg state machine (`state.transitLegIndex`, kept separate from drive mode's `state.currentLegIndex`) instead of reusing `state.route`.

- **Walk/drive legs** carry a real Valhalla maneuver list, so the first/last-mile portion gets a real turn-by-turn banner — the same `#nav-banner` drive/walk mode uses.
- **Metro ride legs** show "Next stop: X" and a stops-remaining count, from the leg's ordered station list. Once boarded, the leg expands into a full per-station list, styled like leg-level highlighting: passed stations dulled, the next station highlighted, upcoming ones plain.
- **Water metro ride legs** have no intermediate-stop data, so a ferry leg shows a percent-of-distance readout instead, with no per-station list.
- **Boarding detection is a heuristic, not certainty.** You're considered "boarded" once you're within `TRANSIT_BOARDING_RADIUS_M` (config.js) of the ride leg's origin AND at/after the leg's scheduled departure time. Requiring both avoids mistaking "waiting on the platform" for "already riding." It's still just proximity + a static schedule, not real-time vehicle position, so a late train or boarding a different service than planned isn't distinguished. A manual "`I'm on the train`"/"`I'm on the boat`" button appears once you're in range, regardless of scheduled time, so early boarding can still be confirmed. Tapping it boards immediately; the automatic check keeps running as a fallback.
- **No reroute for a ride leg — you can't reroute a train.** If the GPS fix drifts too far from the leg's expected geometry for too long (thresholds in config.js, more generous than drive/walk since GPS on a train or boat is noisier), the live progress readout is silently hidden and reappears once the fix is back in range.
- **Leg transitions and end-of-trip** are proximity-based against each leg's destination, with the same consecutive-fix confirmation drive/walk arrival uses.
- **Known gaps**: no voice guidance on transit legs (text-only banner); no wrong-direction or "boarded the wrong train" detection; no PiP integration beyond the wake-lock plumbing drive/walk mode already gets for free.

Tapping "End" stops tracking without discarding the planned itinerary — tapping "Start" again resumes tracking from leg 0.
