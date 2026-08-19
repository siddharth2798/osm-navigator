// Shared logic behind the "find nearby EV charging stations" endpoint —
// used by both functions/api/opencharge-poi.js (Cloudflare Pages) and
// worker.js (a plain Cloudflare Worker with static assets), same split as
// resolve-maps-url.js right next to this file.
//
// The whole reason this exists as a server-side hop, rather than app.js
// just calling Open Charge Map directly: OPENCHARGEMAP_API_KEY has to stay
// a Cloudflare secret/variable, never a config.js value — config.js is a
// plain static file shipped to every visitor's browser, so anything in it
// is public. This endpoint holds the real key server-side (env below) and
// the client only ever calls this same-origin (or, from the Android shell,
// CONFIG.RESOLVE_MAPS_URL_BASE-prefixed) path with no secret attached at
// all — see CONFIG.OPENCHARGEMAP_ENABLED's comment in config.js.
const OCM_BASE_URL = 'https://api.openchargemap.io/v3';
const MAX_RESULTS_CAP = 50; // clamps a client-supplied maxresults — this endpoint is reachable by anyone, not just this app, and every call spends this deployment's own OCM quota

// Same reasoning as resolve-maps-url.js's CORS_HEADERS: the Android shell
// calls this cross-origin (its own origin is https://localhost), and `*` is
// fine because there's no cookie/credential involved and the real
// protection here is the API key living only in `env`, never in anything
// the client sends.
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

export async function openChargePoi(requestUrl, env) {
  const key = env && env.OPENCHARGEMAP_API_KEY;
  if (!key) {
    // Distinct status (not a generic 500/502) so the client can tell
    // "this deployment never configured the feature" apart from "Open
    // Charge Map itself failed" — see the matching check in app.js's
    // fetchNearbyChargingStations.
    return new Response(JSON.stringify({ error: 'OPENCHARGEMAP_API_KEY is not set on this deployment.' }), {
      status: 501,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }

  const lat = parseFloat(requestUrl.searchParams.get('latitude'));
  const lon = parseFloat(requestUrl.searchParams.get('longitude'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'latitude and longitude (numeric) are required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }
  const distanceKm = Math.min(Math.max(parseFloat(requestUrl.searchParams.get('distance')) || 15, 1), 100);
  const maxResults = Math.min(Math.max(parseInt(requestUrl.searchParams.get('maxresults'), 10) || 25, 1), MAX_RESULTS_CAP);

  const ocmUrl = `${OCM_BASE_URL}/poi?latitude=${lat}&longitude=${lon}&distance=${distanceKm}&distanceunit=km&maxresults=${maxResults}&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(ocmUrl, { headers: { Accept: 'application/json' } });
    // Passed through as-is (status included) rather than collapsed into a
    // generic error — a real Open Charge Map failure (bad key, their own
    // rate limit) should surface distinguishably from this endpoint's own
    // 400/501 above.
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Could not reach Open Charge Map.' }), {
      status: 502,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }
}
