# Flight tracking (personal branch only)

This is an experimental, personal-only feature that lives on `personal/flight-tracking`, not `main`. It shows nearby aircraft on the map while you're navigating: an alert above the search box when one crosses close to your live position, or every aircraft in the area once you're near an airport.

## How it works

- The toggle button sits with voice/satellite in the left-hand control stack (plane icon). It's a per-trip preference: switching it on survives a mid-trip reload/resume (e.g. Android reclaiming a backgrounded tab), but a genuinely new trip always starts with it off again, same as voice guidance defaulting fresh each time.
- Only active while you're actually navigating (source → destination, live GPS). It does nothing while just browsing/planning.
- Every 15 seconds (`CONFIG.FLIGHT_POLL_INTERVAL_MS`), the app asks this deployment's own `/api/flights` route for aircraft near your live position.
- **"Crossing above me"** means horizontal ground-track distance — the distance from you to the point on the ground directly below the aircraft, not true 3D distance including altitude. A 3D check would almost never fire for a cruising airliner (they fly 9-12km up, far beyond any sane metre threshold). Altitude is shown in the alert as extra context, not part of the trigger.
- The distance check doesn't just look at where an aircraft is *right now* — it projects the aircraft's reported track/ground-speed forward across the next poll interval and measures against that whole path (`aircraftApproachDistM` in `app.js`). A fast jet can cover several kilometres in one 15-second poll gap, well more than the overhead radius's diameter — checking only the instantaneous position could miss it crossing directly overhead between two samples entirely.
- A stale position report (adsb.lol's own `seen_pos` field older than `CONFIG.FLIGHT_MAX_POSITION_AGE_S`, 30s by default — common for MLAT-derived fixes lagging behind real ADS-B) is excluded outright rather than trusted as current.
- Get within `CONFIG.FLIGHT_NEAR_AIRPORT_RADIUS_M` (8km by default) of a bundled airport and the behavior switches: instead of only alerting on an overhead crossing, every aircraft the query returns gets plotted on the map — useful for watching approach/departure traffic near an airport rather than just the one plane that happens to pass over you.
- Tap an aircraft marker for its full detail (registration, altitude, speed, distance) in the same badge slot — it reverts to the normal overhead-alert summary on its own after `CONFIG.FLIGHT_DETAIL_DISPLAY_MS` (8s by default).
- If `/api/flights` fails several times in a row (`CONFIG.FLIGHT_CHECKIN_FAIL_WARN_THRESHOLD`, 3 by default), a status message says so once per outage — a single dropped request is ordinary network noise and isn't worth interrupting you about.
- A 429 from adsb.lol specifically pauses polling for a while (`CONFIG.FLIGHT_BACKOFF_BASE_MS`, 30s by default, doubling on each further 429 up to `CONFIG.FLIGHT_BACKOFF_MAX_MS`/5 minutes, or whatever the response's own `Retry-After` header says) rather than keep hitting an already-throttled endpoint every 15 seconds — see `applyFlightBackoff` in `app.js`. Resets back to the normal cadence the next time a check-in succeeds. The proxy (`lib/flights-proxy.js`) also holds a 10-second edge cache keyed by a coarse (~2km) grid cell, to absorb duplicate/retried requests for the same area without ever affecting a normal solo 15s poll.

## Data source

Backed by [api.adsb.lol](https://api.adsb.lol), an **unofficial, community-run** ADS-B aggregator — real aircraft positions reported by volunteers' own receivers, not an official aviation data service. This app calls it through its own `/api/flights` proxy (`functions/api/flights.js` + `lib/flights-proxy.js`), same shape as the existing TomTom/Open Charge Map proxies. Unlike those, there's no secret key involved — adsb.lol needs none today. The proxy exists purely because adsb.lol sends no CORS header at all, so a browser `fetch()` straight from the client couldn't read the response even though the request itself would succeed.

**Honest caveats, worth reading before relying on this for anything:**

- **No uptime or coverage guarantee.** This is a goodwill community project, not a commercial service. adsb.lol's own docs describe "dynamic rate limiting based on environment load" with no fixed published request cap, and say an API key (obtainable free by running your own ADS-B receiver) may become required at some unspecified future point — if that happens, the feature stops working until re-configured with a key.
- **Coverage depends entirely on ground-receiver density near wherever you're driving.** Busy areas with lots of hobbyist receivers (much of Europe/North America) see rich, near-real-time traffic. Areas with sparse receiver coverage may show little or nothing, even directly under a busy flight path. This is inherent to crowd-sourced ADS-B tracking, not a bug to chase.
- **The callsign shown is the ADS-B/ATC callsign** (adsb.lol's `flight` field), which usually but not always matches the publicly marketed flight number.
- **Aircraft-type and airline names are best-effort lookups** against bundled static reference tables (`vendor/aircraft-types.json`, `vendor/airline-codes.json` — ICAO DOC 8643 and OpenFlights data respectively). An unrecognized code just falls back to showing the raw code/callsign rather than nothing.
- **The bundled airport list** (`vendor/airports.json`, from the public-domain [OurAirports](https://ourairports.com/data/) dataset) only includes large/medium commercial airports — small airstrips and helipads won't trigger the near-airport regional view.

## Why this isn't on `main`

It depends on an unproven, unofficial third-party data source with no SLA — exactly the kind of thing this project's own convention keeps off `main` until it's been used for a while and proven reliable enough to matter for anyone but the one person who asked for it.
