// Shared logic behind the "find nearby aircraft" endpoint (personal
// flight-tracking overlay — see CONFIG.FLIGHT_TRACKING_ENABLED in
// config.js) — used by both functions/api/flights.js (Cloudflare Pages)
// and worker.js (the plain Worker deployment path), same split as
// resolve-maps-url.js/opencharge-poi.js right next to this file.
//
// Unlike those two, there's no secret to hide here — api.adsb.lol needs no
// API key at all today. The ONLY reason this hop exists is CORS: confirmed
// live that api.adsb.lol sends no Access-Control-Allow-Origin header at
// all, so a browser fetch() straight from app.js would have its response
// blocked from being read, even though the request itself would succeed.
// This endpoint is a stateless relay that adds the header adsb.lol
// doesn't, plus the short-lived edge cache below — no other business logic
// beyond bounds-checking the inputs.
//
// adsb.lol is an unofficial, community-run aggregator with no uptime
// guarantee, and its own docs describe "dynamic rate limiting based on
// environment load" (no fixed published cap) plus an API key (obtained by
// running your own receiver) that may become required at some unspecified
// future point — see docs/FLIGHT_TRACKING.md. Fine for a personal branch;
// not something to build main-line reliability expectations around.
const ADSB_BASE_URL = 'https://api.adsb.lol/v2/point';
const MAX_RADIUS_NM = 250; // adsb.lol's own documented cap on this endpoint

// Fallback for when adsb.lol fails or rate-limits — confirmed live that
// adsb.fi's /v3 endpoint returns the exact same response shape (same `ac`
// array, same per-aircraft fields: hex/lat/lon/track/gs/seen_pos/etc — both
// are readsb-family community aggregators), so this needs zero response
// transformation, just a different upstream URL. adsb.fi's own docs state
// a flat 1 req/sec public limit (vs. adsb.lol's vague "dynamic" one) and a
// matching 250 NM radius cap.
const ADSB_FI_BASE_URL = 'https://opendata.adsb.fi/api/v3/lat';

// Cloudflare's edge cache (`caches.default`, available in both the plain
// Worker and Pages Functions runtimes this file is shared between) absorbs
// duplicate/near-simultaneous requests for the same area — e.g. a flaky
// network causing app.js's own fetch to be retried, or more than one
// device/tab polling the same stretch of road — without this app's own
// client-side poll cadence (CONFIG.FLIGHT_POLL_INTERVAL_MS, 15s) ever
// seeing the cache: TTL here is deliberately shorter than that, so it can
// only ever catch bursts, never serve a normal solo poll stale aircraft
// data. Coordinates are rounded to a coarse grid for the cache key — the
// query itself still uses the exact lat/lon against adsb.lol.
const CACHE_TTL_S = 10;
const CACHE_GRID_DEG = 0.02; // ~2km at the equator — coarse enough to dedup nearby duplicate requests

// adsb.lol rejects requests carrying a generic runtime-default User-Agent
// (confirmed live: Node's own default fetch() UA gets "User-Agent too
// generic; include valid contact info" as a plain-text, non-JSON body
// instead of real data — Cloudflare's own default Worker UA is generic
// enough to risk the same) with a real one identifying this project and a
// contact address, exactly as their own error message asks for.
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
  // not just this app, and every call spends adsb.lol's shared community
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

  const primary = await tryFetch(`${ADSB_BASE_URL}/${lat}/${lon}/${radiusNm}`);
  let final = primary;
  let source = 'adsb.lol';
  // Falls back on ANY non-OK primary result — a 429, a 5xx, or a thrown
  // network error all mean "adsb.lol isn't giving usable data right now",
  // and the whole point of a backup is not caring which of those it was.
  if (!primary.ok) {
    const fallback = await tryFetch(`${ADSB_FI_BASE_URL}/${lat}/lon/${lon}/dist/${radiusNm}`);
    // Only switches to the fallback's result if it actually SUCCEEDED — if
    // adsb.fi also failed, the ORIGINAL adsb.lol failure (its real status,
    // e.g. 429, which app.js's applyFlightBackoff specifically checks for)
    // is still what's worth surfacing to the client/debug log, not
    // whatever unrelated failure status adsb.fi happened to fail with.
    if (fallback.ok) { final = fallback; source = 'adsb.fi'; }
  }

  if (!final.res) {
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
  const response = new Response(final.res.body, {
    status: final.res.status,
    headers: { 'content-type': 'application/json', 'x-flight-source': source, ...CORS_HEADERS },
  });
  if (cache && final.ok) {
    const toCache = response.clone();
    toCache.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_S}`);
    await cache.put(cacheKey, toCache);
  }
  return response;
}
