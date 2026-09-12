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
const NM_PER_DEG_LAT = 60; // nautical miles per degree of latitude — a standard, not an approximation
const MAX_RADIUS_NM = 250;

// OpenSky Network is the primary (tier 1) source — swapped from
// airplanes.live (see that constant's own comment below for the full
// history) because airplanes.live has been confirmed, repeatedly, to
// 403 on every single request from this deployment's Cloudflare Worker
// runtime — trying it first meant every poll paid for a request that
// never once succeeded before falling through to OpenSky anyway.
// OpenSky is genuinely independent infrastructure (an academic/non-profit
// network, ETH Zurich-affiliated), not a community-run aggregator, so it
// doesn't share adsb.lol/adsb.fi's history of intermittent
// rate-limiting/timeouts on this deployment. Coverage skews toward
// Europe/North America more than a readsb-family source would.
//
// Authenticated (via env.OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET, below)
// raises the quota well past the anonymous 400-credits/day cap that was a
// real, easy-to-hit ceiling under this app's 15s continuous polling —
// more important than ever now that OpenSky carries every single poll
// instead of just the ones airplanes.live failed. OpenSky migrated off
// HTTP Basic Auth (plain username/password) to OAuth2 client_credentials
// on 2026-03-18 — a client_id/client_secret pair from the account's "API
// client" page, NOT the login username/password, which the auth server
// now rejects outright. If env.OPENSKY_CLIENT_ID isn't set, falls back
// to the old anonymous call (still works, just capped at 400/day).
const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
// Module-scope: persists across requests within the same warm Worker
// isolate (best-effort — a cold start just re-fetches), so a fresh token
// isn't exchanged on every single poll. Tokens last 30 min; refreshed 60s
// early so a request never straddles the exact expiry instant.
let openSkyToken = null;
let openSkyTokenExpiresAtMs = 0;

/** Returns a valid bearer token, or null if no client credentials are
 * configured (caller then falls back to the anonymous, unauthenticated
 * call). Never throws — a token-endpoint failure just means "proceed
 * anonymously", same never-throws contract as tryFetch/tryFetchOpenSky. */
async function getOpenSkyToken(env) {
  if (!env || !env.OPENSKY_CLIENT_ID || !env.OPENSKY_CLIENT_SECRET) return null;
  if (openSkyToken && Date.now() < openSkyTokenExpiresAtMs) return openSkyToken;
  try {
    const res = await fetchWithTimeout(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.OPENSKY_CLIENT_ID,
        client_secret: env.OPENSKY_CLIENT_SECRET,
      }),
    });
    if (!res.ok) {
      console.error('[flights-proxy] OpenSky token request failed, status', res.status);
      return null;
    }
    const data = await res.json();
    if (!data.access_token) return null;
    openSkyToken = data.access_token;
    openSkyTokenExpiresAtMs = Date.now() + (Math.max((data.expires_in || 1800) - 60, 30)) * 1000;
    return openSkyToken;
  } catch (err) {
    console.error('[flights-proxy] OpenSky token request threw', err);
    return null;
  }
}

// Fallback tier (only tried if OpenSky fails) — airplanes.live. Per its
// own published OpenAPI spec (https://airplanes.live/openapi.yaml), its
// /v2/point response is field-for-field identical to the readsb-family
// shape this app already expects (hex/flight/r/t/alt_baro/gs/track/lat/
// lon/seen_pos) — no response transformation needed, same drop-in
// pass-through as the old adsb.fi tier, which is why `tryFetch` (a plain
// pass-through, below) can serve both this and the old primary role
// unchanged.
//
// A PRIOR version of this comment claimed airplanes.live gates access
// behind manual approval. That was wrong — confirmed by reading aurora's
// actual source (github.com/siddharth2798/aurora,
// apps/api/internal/poller/opensky.go despite the misleading filename):
// it sends only a plain User-Agent header, no API key, no auth of any
// kind, and its own README documents this API as "Auth: None —
// completely open" with no rate limiting ever observed across 94
// parallel tiles/5s. So a genuine per-account approval gate can't be
// what's happening here. This deployment still confirmed a live 403 from
// Cloudflare's Worker runtime specifically (same requests succeed via
// plain curl from elsewhere) — the far more likely explanation is
// airplanes.live blocking Cloudflare's shared/datacenter Worker egress IP
// range outright (a common anti-scraping posture for community ADS-B
// aggregators). Demoted from tier 1 to tier 2 for exactly this reason —
// see OPENSKY_STATES_URL's own comment above — but kept as a fallback
// rather than removed entirely: it costs nothing to keep trying on the
// (now rarer) request where OpenSky itself has a bad moment, and if that
// IP-range block ever lifts, this starts contributing again with zero
// code changes. Re-verify with a live curl from the deployed Worker
// before trusting this comment again; don't just re-assert it.
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

// Confirmed live (curl against the deployed Worker, repeatedly, ~20s
// every time): with no timeout at all, a hung upstream connection — not
// a fast error, an actual silent hang — stalled the whole /api/flights
// request until Cloudflare itself gave up and returned a 522, worse than
// any of this file's own error handling ever runs. Every upstream fetch
// below (OpenSky's token exchange, OpenSky's states/all, airplanes.live)
// goes through this instead of a bare fetch(), so a hang on ANY one of
// them degrades to the next tier within a bounded time instead of
// stalling the entire request past Cloudflare's own patience. 5s is
// generous against every upstream's real observed latency (well under
// 1.5s each, live-tested) while still leaving enough budget for a
// primary-timeout + fallback-timeout combination to finish comfortably
// under whatever threshold produced that 522.
const UPSTREAM_TIMEOUT_MS = 5000;
async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Tries one upstream, never throwing — a network failure (including an
 * abort from fetchWithTimeout's own timeout) resolves to { res: null }
 * exactly like a non-2xx status resolves to { ok: false }, so callers can
 * treat "couldn't reach it" and "reached it but it said no" the same way
 * when deciding whether to fall back. */
async function tryFetch(url) {
  try {
    const res = await fetchWithTimeout(url, { headers: UPSTREAM_HEADERS });
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
async function tryFetchOpenSky(lat, lon, radiusNm, env) {
  const { lamin, lamax, lomin, lomax } = bboxFromPoint(lat, lon, radiusNm);
  const url = `${OPENSKY_STATES_URL}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const token = await getOpenSkyToken(env);
  const headers = token ? { ...UPSTREAM_HEADERS, Authorization: `Bearer ${token}` } : UPSTREAM_HEADERS;
  try {
    const res = await fetchWithTimeout(url, { headers });
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

  // OpenSky first (see OPENSKY_STATES_URL's own comment above — this is
  // the swap away from airplanes.live, which reliably 403s from this
  // deployment's Worker runtime), airplanes.live as the fallback.
  const primary = await tryFetchOpenSky(lat, lon, radiusNm, env);
  let final = primary;
  let source = 'opensky';
  // Falls back on ANY non-OK primary result — a bad token exchange, a
  // rate limit, a 5xx, or a thrown network error all mean "OpenSky isn't
  // giving usable data right now", and the whole point of a backup is
  // not caring which of those it was.
  if (!primary.ok) {
    console.error('[flights-proxy] OpenSky failed (status', primary.res ? primary.res.status : 'network error', ') for', lat, lon, '- trying airplanes.live');
    const fallback = await tryFetch(`${AIRPLANES_LIVE_BASE_URL}/${lat}/${lon}/${radiusNm}`);
    // Only switches to the fallback's result if it actually SUCCEEDED — if
    // airplanes.live also failed (expected — see its own comment above),
    // the ORIGINAL OpenSky failure is still what's worth surfacing to the
    // client/debug log, not whatever unrelated failure status
    // airplanes.live happened to fail with.
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
