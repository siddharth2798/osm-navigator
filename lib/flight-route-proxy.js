// Shared logic behind "look up a flight's origin/destination by callsign"
// (personal flight-tracking overlay's aircraft detail panel) — used by both
// functions/api/flight-route.js (Cloudflare Pages) and worker.js (the plain
// Worker deployment path), same split as flights-proxy.js right next to
// this file.
//
// Backed by adsbdb.com (https://www.adsbdb.com/), a free, keyless community
// project that resolves an ADS-B callsign to the airline + scheduled
// origin/destination airports for that flight number. No CORS header on
// its own responses (confirmed live), so — same reasoning as
// flights-proxy.js — this hop exists purely to relay with one added.
//
// Unlike /api/flights (polled every 15s while navigating), this only fires
// on a discrete tap in the aircraft detail panel — call volume is orders of
// magnitude lower, so there's no fallback tier here (adsbdb has no
// comparable free alternative anyway) and no client-side backoff wiring;
// protection is the long cache TTL below plus the UI degrading to "Route
// unknown" on any failure.
const ADSBDB_CALLSIGN_URL = 'https://api.adsbdb.com/v0/callsign';

// Routes are stable for a given callsign/flight-number for the life of that
// scheduled service — cache aggressively. Not cached at all when the route
// comes back unknown (see below): a route can become known later once a
// flight plan is actually filed, and re-checking costs nothing given how
// rarely this endpoint is hit.
const CACHE_TTL_S = 86400; // 24h

const CALLSIGN_PATTERN = /^[A-Z0-9]{2,8}$/;

const UPSTREAM_HEADERS = { 'User-Agent': 'osm-navigator (personal project; https://github.com/siddharth2798/osm-navigator)' };
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
}

/** adsbdb's own airport shape has verbose keys (icao_code/iata_code/
 * country_name/...) — flattened here to match this app's short-key
 * convention (see flights-proxy.js's hex/flight/alt_baro/gs fields). */
function flattenAirport(a) {
  if (!a) return null;
  return {
    icao: a.icao_code || null,
    iata: a.iata_code || null,
    name: a.name || null,
    city: a.municipality || null,
    country: a.country_iso_name || null,
    lat: typeof a.latitude === 'number' ? a.latitude : null,
    lon: typeof a.longitude === 'number' ? a.longitude : null,
  };
}

export async function flightRoute(requestUrl, env) {
  const rawCallsign = (requestUrl.searchParams.get('callsign') || '').trim().toUpperCase();
  if (!CALLSIGN_PATTERN.test(rawCallsign)) {
    return jsonResponse({ error: 'callsign (2-8 alphanumeric characters) is required.' }, 400);
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://flight-route-proxy.internal/v0/callsign/${rawCallsign}`);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  let upstream;
  try {
    upstream = await fetch(`${ADSBDB_CALLSIGN_URL}/${encodeURIComponent(rawCallsign)}`, { headers: UPSTREAM_HEADERS });
  } catch (err) {
    return jsonResponse({ error: 'Could not reach the route-lookup data source.' }, 502);
  }

  // adsbdb answers an unknown callsign with a genuine 404 (confirmed live:
  // {"response":"unknown callsign"}) — handled the same way
  // aircraft-info-proxy.js handles its own 404 case. Not cached: a route
  // can become known later once a flight plan is actually filed.
  if (upstream.status === 404) {
    return jsonResponse({ error: 'No known route for that callsign.' }, 404);
  }
  if (!upstream.ok) {
    return jsonResponse({ error: 'Could not reach the route-lookup data source.' }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch (err) {
    return jsonResponse({ error: 'Could not reach the route-lookup data source.' }, 502);
  }

  // Defensive: adsbdb's other endpoint (aircraft-info-proxy.js) has also
  // been observed returning a 200 with a string `response` body for an
  // unknown lookup rather than a 404 — mirror that handling here too in
  // case this endpoint ever does the same for a callsign it partially
  // recognizes but has no route for.
  if (typeof data.response === 'string' || !data.response || !data.response.flightroute) {
    return jsonResponse({ error: 'No known route for that callsign.' }, 404);
  }

  const fr = data.response.flightroute;
  const body = {
    callsign: fr.callsign || rawCallsign,
    callsignIata: fr.callsign_iata || null,
    airline: fr.airline ? { name: fr.airline.name || null, icao: fr.airline.icao || null, iata: fr.airline.iata || null, country: fr.airline.country || null } : null,
    origin: flattenAirport(fr.origin),
    destination: flattenAirport(fr.destination),
  };

  const response = jsonResponse(body, 200);
  if (cache) {
    const toCache = response.clone();
    toCache.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_S}`);
    await cache.put(cacheKey, toCache);
  }
  return response;
}
