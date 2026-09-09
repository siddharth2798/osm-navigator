// Pure search-matching/ranking logic for Flight Tracking Mode's search bar
// — pulled out of app.js into its own module so it's unit-testable without
// a DOM, same convention as lib/flight-render-utils.js right next to this
// file. Purely in-memory: no fetch, no network — see app.js's
// searchFlightEntities wrapper for why (scoped to the bundled airport list
// + the most recent /api/flights poll, not a global search).

/** Airports ranked first (a small, static, complete index is more useful to
 * search than a same-second snapshot of whatever's currently in range),
 * each list capped independently at `maxResults`. `airports`/`aircraft` are
 * plain arrays (flightRefData.airports / state.lastFlightPollAircraft in
 * app.js) — passed in rather than imported so this stays framework-free. */
export function searchFlightEntities(query, airports, aircraft, maxResults) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const matchedAirports = (airports || [])
    .filter((a) => (
      (a.icao && a.icao.toLowerCase() === q)
      || (a.iata && a.iata.toLowerCase() === q)
      || (a.name && a.name.toLowerCase().includes(q))
      || (a.city && a.city.toLowerCase().includes(q))
    ))
    .slice(0, maxResults)
    .map((a) => ({ kind: 'airport', ...a }));
  const matchedAircraft = (aircraft || [])
    .filter((a) => (
      (a.flight && a.flight.trim().toLowerCase().includes(q))
      || (a.r && a.r.toLowerCase().includes(q))
      || (a.hex && a.hex.toLowerCase().includes(q))
    ))
    .slice(0, maxResults)
    .map((a) => ({ kind: 'aircraft', ...a }));
  return [...matchedAirports, ...matchedAircraft];
}
