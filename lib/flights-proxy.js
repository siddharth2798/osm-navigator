// Backend for the "find nearby aircraft" endpoint (flight-tracking overlay), shared by functions/api/flights.js and worker.js.
// Proxies api.adsb.lol to add CORS headers it doesn't send itself, plus bounds-checking and a short edge cache.
const ADSB_BASE_URL = 'https://api.adsb.lol/v2/point';
const MAX_RADIUS_NM = 250; // adsb.lol's documented cap on this endpoint

// Fallback if adsb.lol fails or rate-limits — same response shape, no transform needed.
const ADSB_FI_BASE_URL = 'https://opendata.adsb.fi/api/v3/lat';

// Last-resort fallback, tried only if both adsb.lol and adsb.fi fail — independent infra, separate rate-limit pool.
// Different request/response shape than the other two, needs transforming (see openSkyStateToAircraft below).
const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const NM_PER_DEG_LAT = 60; // nautical miles per degree of latitude

// Dedups bursts of near-simultaneous requests for the same area. TTL is shorter than the
// client's own poll interval, so it never serves stale data on a normal solo poll.
const CACHE_TTL_S = 10;
const CACHE_GRID_DEG = 0.02; // ~2km grid, coarse enough to dedup nearby requests

// adsb.lol rejects requests with a generic default User-Agent, so send a real one identifying this project.
const UPSTREAM_HEADERS = { 'User-Agent': 'osm-navigator (personal project; https://github.com/siddharth2798/osm-navigator)' };

// Allows the Android shell's cross-origin calls. x-flight-source needs its own expose-headers
// entry since it's not in CORS's default safelist of readable response headers.
const CORS_HEADERS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-flight-source' };

/** Fetches a URL, never throwing — network errors resolve like a non-2xx response so callers can treat them the same. */
async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: UPSTREAM_HEADERS });
    return { res, ok: res.ok };
  } catch (err) {
    return { res: null, ok: false };
  }
}

/** Converts a point + radius into a lat/lon bounding box, since OpenSky's API takes a bbox, not point + radius. */
function bboxFromPoint(lat, lon, radiusNm) {
  const latDeg = radiusNm / NM_PER_DEG_LAT;
  const lonDeg = radiusNm / NM_PER_DEG_LAT / Math.cos((lat * Math.PI) / 180);
  return {
    lamin: lat - latDeg, lamax: lat + latDeg,
    lomin: lon - lonDeg, lomax: lon + lonDeg,
  };
}

/** Converts an OpenSky state vector (a positional array, different units) into this app's aircraft shape. Returns null if it has no position. */
function openSkyStateToAircraft(state, nowS) {
  const [icao24, callsign, , timePosition, lastContact, longitude, latitude, baroAltitude, , velocity, trueTrack] = state;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  const posTimestamp = typeof timePosition === 'number' ? timePosition : lastContact;
  return {
    hex: icao24,
    flight: callsign,
    lat: latitude,
    lon: longitude,
    alt_baro: typeof baroAltitude === 'number' ? Math.round(baroAltitude * 3.28084) : null,
    track: typeof trueTrack === 'number' ? trueTrack : null,
    gs: typeof velocity === 'number' ? velocity * 1.94384 : null,
    seen_pos: typeof posTimestamp === 'number' ? Math.max(0, nowS - posTimestamp) : null,
  };
}

/** Queries OpenSky and returns an already-transformed { ac: [...] } body; never throws. */
async function tryFetchOpenSky(lat, lon, radiusNm) {
  const { lamin, lamax, lomin, lomax } = bboxFromPoint(lat, lon, radiusNm);
  const url = `${OPENSKY_STATES_URL}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  try {
    const res = await fetch(url, { headers: UPSTREAM_HEADERS });
    if (!res.ok) return { ok: false, res };
    const data = await res.json();
    const nowS = Math.floor(Date.now() / 1000);
    const ac = (Array.isArray(data.states) ? data.states : [])
      .map((state) => openSkyStateToAircraft(state, nowS))
      .filter(Boolean);
    return { ok: true, body: { ac } };
  } catch (err) {
    return { ok: false, res: null };
  }
}

export async function nearbyFlights(requestUrl, env) {
  const lat = parseFloat(requestUrl.searchParams.get('lat'));
  const lon = parseFloat(requestUrl.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response(JSON.stringify({ error: 'lat and lon (valid coordinates) are required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }
  // Clamped, not just validated — anyone can call this endpoint and every call spends adsb.lol's shared quota.
  const radiusNm = Math.min(Math.max(parseFloat(requestUrl.searchParams.get('radiusNm')) || 5, 1), MAX_RADIUS_NM);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const gridLat = (Math.round(lat / CACHE_GRID_DEG) * CACHE_GRID_DEG).toFixed(2);
  const gridLon = (Math.round(lon / CACHE_GRID_DEG) * CACHE_GRID_DEG).toFixed(2);
  const cacheKey = new Request(`https://flights-proxy.internal/v2/point/${gridLat}/${gridLon}/${radiusNm}`);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const primary = await tryFetch(`${ADSB_BASE_URL}/${lat}/${lon}/${radiusNm}`);
  let final = primary;
  let source = 'adsb.lol';
  // Falls back on any non-OK result — bad status or thrown network error, treated the same.
  if (!primary.ok) {
    console.error('[flights-proxy] adsb.lol failed (status', primary.res ? primary.res.status : 'network error', ') for', lat, lon, '- trying adsb.fi');
    const fallback = await tryFetch(`${ADSB_FI_BASE_URL}/${lat}/lon/${lon}/dist/${radiusNm}`);
    // Only switch to the fallback's result on success — otherwise keep adsb.lol's original status
    // (app.js's applyFlightBackoff checks it, e.g. for 429).
    if (fallback.ok) {
      final = fallback;
      source = 'adsb.fi';
    } else {
      console.error('[flights-proxy] adsb.fi ALSO failed (status', fallback.res ? fallback.res.status : 'network error', ') for', lat, lon, '- trying OpenSky');
      const openSky = await tryFetchOpenSky(lat, lon, radiusNm);
      // Same rule as above: only switch on success, otherwise keep the original adsb.lol failure status.
      if (openSky.ok) {
        final = openSky;
        source = 'opensky';
      } else {
        console.error('[flights-proxy] OpenSky ALSO failed (status', openSky.res ? openSky.res.status : 'network error', ') for', lat, lon, '- all three sources down');
      }
    }
  }

  if (!final.res && !final.body) {
    return new Response(JSON.stringify({ error: 'Could not reach the flight-tracking data source.' }), {
      status: 502,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Forwarded as-is (status included) so a real upstream failure stays distinguishable from this
  // endpoint's own 400. OpenSky's body is already transformed; the other two tiers pass their raw stream through.
  const response = final.body
    ? new Response(JSON.stringify(final.body), { status: 200, headers: { 'content-type': 'application/json', 'x-flight-source': source, ...CORS_HEADERS } })
    : new Response(final.res.body, { status: final.res.status, headers: { 'content-type': 'application/json', 'x-flight-source': source, ...CORS_HEADERS } });
  if (cache && final.ok) {
    const toCache = response.clone();
    toCache.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_S}`);
    await cache.put(cacheKey, toCache);
  }
  return response;
}
