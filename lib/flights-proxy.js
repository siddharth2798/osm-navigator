// Shared logic behind the "find nearby aircraft" endpoint (personal
// flight-tracking overlay — see CONFIG.FLIGHT_TRACKING_ENABLED in
// config.js) — used by both functions/api/flights.js (Cloudflare Pages)
// and worker.js (the plain Worker deployment path), same split as
// resolve-maps-url.js/opencharge-poi.js right next to this file.
//
// Unlike those two, there's no secret to hide here — neither source below
// needs an API key today. The ONLY reason this hop exists is CORS:
// confirmed live that neither sends an Access-Control-Allow-Origin header,
// so a browser fetch() straight from app.js would have its response
// blocked from being read, even though the request itself would succeed.
// This endpoint is a stateless relay that adds the header neither source
// sends, plus the short-lived edge cache below — no other business logic
// beyond bounds-checking the inputs.
//
// OpenSky Network is the default (tier 1) — genuinely independent
// infrastructure (an academic/non-profit network, ETH Zurich-affiliated),
// not a community-run aggregator, so it doesn't share adsb.lol/adsb.fi's
// history of intermittent rate-limiting/timeouts on this deployment.
// Anonymous (unauthenticated) access: 400 free credits/day, ~1 credit per
// query at this app's radii (well under the 25 sq° threshold for the
// cheapest tier). Coverage skews toward Europe/North America more than a
// readsb-family source would — worth knowing outside those regions, but
// not a reason to avoid it as the default given the reliability tradeoff.
const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const NM_PER_DEG_LAT = 60; // nautical miles per degree of latitude — a standard, not an approximation
const MAX_RADIUS_NM = 250;

// Fallback tier (only tried if OpenSky fails) — airplanes.live, the same
// source github.com/siddharth2798/aurora uses. Per its own published
// OpenAPI spec (https://airplanes.live/openapi.yaml), its /v2/point
// response is field-for-field identical to the readsb-family shape this
// app already expects (hex/flight/r/t/alt_baro/gs/track/lat/lon/seen_pos)
// — no response transformation needed, same drop-in pass-through as the
// old adsb.fi tier. UNLIKE adsb.lol/adsb.fi, airplanes.live gates access
// behind manual approval: a live test during development got HTTP 403
// with "Please contact us at contact@airplanes.live" on every request,
// regardless of User-Agent — this tier does nothing useful until that
// approval is granted, but costs nothing to have wired up and ready
// (OpenSky being primary means this deployment doesn't depend on it).
const AIRPLANES_LIVE_BASE_URL = 'https://api.airplanes.live/v2/point';

// Cloudflare's edge cache (`caches.default`, available in both the plain
// Worker and Pages Functions runtimes this file is shared between) absorbs
// duplicate/near-simultaneous requests for the same area — e.g. a flaky
// network causing app.js's own fetch to be retried, or more than one
// device/tab polling the same stretch of road — without this app's own
// client-side poll cadence (CONFIG.FLIGHT_POLL_INTERVAL_MS, 15s) ever
// seeing the cache: TTL here is deliberately shorter than that, so it can
// only ever catch bursts, never serve a normal solo poll stale aircraft
// data. Coordinates are rounded to a coarse grid for the cache key — the
// query itself still uses the exact lat/lon against whichever tier answers.
const CACHE_TTL_S = 10;
const CACHE_GRID_DEG = 0.02; // ~2km at the equator — coarse enough to dedup nearby duplicate requests

// Readsb-family sources (this app used to call adsb.lol/adsb.fi, and
// airplanes.live is the same family) reject requests carrying a generic
// runtime-default User-Agent — confirmed live against adsb.lol: Node's own
// default fetch() UA got "User-Agent too generic; include valid contact
// info" as a plain-text, non-JSON body instead of real data, and
// Cloudflare's own default Worker UA is generic enough to risk the same —
// with a real one identifying this project and a contact address, exactly
// as that error message asks for. Sent to both tiers below; harmless for
// OpenSky even though it doesn't require one.
const UPSTREAM_HEADERS = { 'User-Agent': 'osm-navigator (personal project; https://github.com/siddharth2798/osm-navigator)' };

// Same reasoning as every other proxy's CORS_HEADERS: the Android shell
// calls this cross-origin (its own origin is https://localhost), and `*`
// is fine — no cookies/credentials involved, and there's no secret here to
// protect via same-origin policy in the first place. x-flight-source needs
// its own expose-headers entry — CORS only exposes a small safelist of
// response headers to cross-origin JS by default, and this one isn't on it.
const CORS_HEADERS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-flight-source' };

/** Tries one upstream, never throwing — a network failure resolves to
 * { res: null } exactly like a non-2xx status resolves to { ok: false },
 * so callers can treat "couldn't reach it" and "reached it but it said no"
 * the same way when deciding whether to fall back. */
async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: UPSTREAM_HEADERS });
    return { res, ok: res.ok };
  } catch (err) {
    return { res: null, ok: false };
  }
}

/** OpenSky's states/all takes a bounding box, not a point + radius — this
 * app's own /api/flights params stay lat/lon/radiusNm for both tiers
 * (including this one) so app.js never needs to know two different
 * upstreams exist. Longitude degrees shrink toward the poles (scaled by
 * 1/cos(lat)); latitude degrees don't. */
function bboxFromPoint(lat, lon, radiusNm) {
  const latDeg = radiusNm / NM_PER_DEG_LAT;
  const lonDeg = radiusNm / NM_PER_DEG_LAT / Math.cos((lat * Math.PI) / 180);
  return {
    lamin: lat - latDeg, lamax: lat + latDeg,
    lomin: lon - lonDeg, lomax: lon + lonDeg,
  };
}

/** OpenSky's state vectors are positional arrays
 * (https://openskynetwork.github.io/opensky-api/rest.html#response), not
 * named fields, in different units than the readsb-family tiers above:
 * velocity in m/s (this app expects knots), baro_altitude in meters
 * (expects feet), time_position/last_contact as absolute unix timestamps
 * (expects seen_pos as seconds-ago). Returns null for a state with no
 * current position (OpenSky reports those for aircraft it's tracking but
 * not currently receiving a position from) — filtered out by the caller,
 * same as this app already does for the airplanes.live tier's own entries
 * missing lat/lon. */
function openSkyStateToAircraft(state, nowS) {
  const [icao24, callsign, , timePosition, lastContact, longitude, latitude, baroAltitude, onGround, velocity, trueTrack, , , , squawk] = state;
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
    // Both free on this same state vector (indices 8 and 14) — on_ground
    // drives the Flight Tracking Mode ground/airborne icon split, squawk
    // drives its emergency-ring detection. Unlike registration/type,
    // there's no reason these need the airplanes.live fallback tier at all.
    on_ground: typeof onGround === 'boolean' ? onGround : null,
    squawk: typeof squawk === 'string' ? squawk : null,
  };
}

/** Same never-throws shape as tryFetch above, but returns an already-
 * transformed `{ac: [...]}` body instead of a raw Response to forward —
 * this tier needs the conversion above before it matches what app.js
 * expects, unlike the other two, which are drop-in mirrors of each other. */
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
  // Clamped, not just validated — this endpoint is reachable by anyone,
  // not just this app, and every call spends a shared community/free-tier
  // resource, same rationale as opencharge-poi.js's MAX_RESULTS_CAP.
  const radiusNm = Math.min(Math.max(parseFloat(requestUrl.searchParams.get('radiusNm')) || 5, 1), MAX_RADIUS_NM);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const gridLat = (Math.round(lat / CACHE_GRID_DEG) * CACHE_GRID_DEG).toFixed(2);
  const gridLon = (Math.round(lon / CACHE_GRID_DEG) * CACHE_GRID_DEG).toFixed(2);
  const cacheKey = new Request(`https://flights-proxy.internal/v2/point/${gridLat}/${gridLon}/${radiusNm}`);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  // OpenSky first (see its own comment above for why it's the default),
  // airplanes.live as the fallback.
  const primary = await tryFetchOpenSky(lat, lon, radiusNm);
  let final = primary;
  let source = 'opensky';
  // Falls back on ANY non-OK primary result — a quota exhaustion, a 5xx, or
  // a thrown network error all mean "OpenSky isn't giving usable data right
  // now", and the whole point of a backup is not caring which of those it
  // was.
  if (!primary.ok) {
    console.error('[flights-proxy] OpenSky failed (status', primary.res ? primary.res.status : 'network error', ') for', lat, lon, '- trying airplanes.live');
    const fallback = await tryFetch(`${AIRPLANES_LIVE_BASE_URL}/${lat}/${lon}/${radiusNm}`);
    // Only switches to the fallback's result if it actually SUCCEEDED — if
    // airplanes.live also failed (expected until its access request is
    // approved — see its own comment above), the ORIGINAL OpenSky failure
    // is still what's worth surfacing to the client/debug log, not
    // whatever unrelated failure status airplanes.live happened to fail
    // with (currently always 403, pending approval).
    if (fallback.ok) {
      final = fallback;
      source = 'airplanes.live';
    } else {
      console.error('[flights-proxy] airplanes.live ALSO failed (status', fallback.res ? fallback.res.status : 'network error', ') for', lat, lon, '- both sources down');
    }
  }

  if (!final.res && !final.body) {
    return new Response(JSON.stringify({ error: 'Could not reach the flight-tracking data source.' }), {
      status: 502,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Passed through as-is (status included) rather than collapsed into a
  // generic error — a real upstream failure should surface distinguishably
  // from this endpoint's own 400 above. Never cached when not OK: a 429/5xx
  // cached for CACHE_TTL_S would keep serving the failure to every request
  // in that grid cell instead of letting the next one retry.
  // OpenSky's `body` is already the transformed {ac: [...]} shape (see
  // tryFetchOpenSky) — airplanes.live passes its raw upstream stream
  // straight through instead, since its shape already matches.
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
