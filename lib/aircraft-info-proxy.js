// Shared logic behind "look up an aircraft's registration/type by its
// ICAO24 hex code" (personal flight-tracking overlay's aircraft detail
// panel) — used by both functions/api/aircraft-info.js (Cloudflare Pages)
// and worker.js, same split as flights-proxy.js right next to this file.
//
// This exists specifically to backfill what OpenSky's /api/flights tier
// can't provide: OpenSky's state vectors carry no registration/type/
// manufacturer fields at all (see openSkyStateToAircraft in
// flights-proxy.js), while the airplanes.live fallback tier would supply
// them directly (readsb-family `r`/`t` fields) if/when its pending access
// approval lands. Until then, this is the only source for that data on an
// OpenSky-only poll. Backed by adsbdb.com, same project as
// flight-route-proxy.js, same "no fallback tier, cache aggressively,
// degrade gracefully in the UI" reasoning — see that file's header comment.
const ADSBDB_AIRCRAFT_URL = 'https://api.adsbdb.com/v0/aircraft';

// Registration/type/manufacturer for a given airframe essentially never
// change — cache far longer than the route lookup's already-long 24h.
const CACHE_TTL_S = 2592000; // 30 days

const HEX_PATTERN = /^[0-9a-fA-F]{6}$/;

const UPSTREAM_HEADERS = { 'User-Agent': 'osm-navigator (personal project; https://github.com/siddharth2798/osm-navigator)' };
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
}

export async function aircraftInfo(requestUrl, env) {
  const rawHex = (requestUrl.searchParams.get('hex') || '').trim().toLowerCase();
  if (!HEX_PATTERN.test(rawHex)) {
    return jsonResponse({ error: 'hex (6-character ICAO24 address) is required.' }, 400);
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://aircraft-info-proxy.internal/v0/aircraft/${rawHex}`);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  let upstream;
  try {
    upstream = await fetch(`${ADSBDB_AIRCRAFT_URL}/${rawHex}`, { headers: UPSTREAM_HEADERS });
  } catch (err) {
    return jsonResponse({ error: 'Could not reach the aircraft-info data source.' }, 502);
  }

  // adsbdb answers an unknown hex with a genuine 404 on this endpoint
  // (confirmed live) — unlike the callsign endpoint's 200-with-string-body
  // quirk. Handled as "unknown", not cached (a registration lookup gap can
  // be filled in later as adsbdb's own data grows).
  if (upstream.status === 404) {
    return jsonResponse({ error: 'No known info for that aircraft.' }, 404);
  }
  if (!upstream.ok) {
    return jsonResponse({ error: 'Could not reach the aircraft-info data source.' }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch (err) {
    return jsonResponse({ error: 'Could not reach the aircraft-info data source.' }, 502);
  }

  // Defensive: mirror the callsign endpoint's string-body-means-unknown
  // handling in case this endpoint ever behaves the same way, even though
  // live testing only observed a real 404 here.
  if (typeof data.response === 'string' || !data.response || !data.response.aircraft) {
    return jsonResponse({ error: 'No known info for that aircraft.' }, 404);
  }

  const ac = data.response.aircraft;
  const body = {
    hex: rawHex,
    registration: ac.registration || null,
    type: ac.type || null,
    icaoType: ac.icao_type || null,
    manufacturer: ac.manufacturer || null,
    photoUrl: ac.url_photo || null,
  };

  const response = jsonResponse(body, 200);
  if (cache) {
    const toCache = response.clone();
    toCache.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_S}`);
    await cache.put(cacheKey, toCache);
  }
  return response;
}
