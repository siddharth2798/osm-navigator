// Backend for the "find nearby EV charging stations" endpoint, shared by functions/api/opencharge-poi.js and worker.js.
// Keeps OPENCHARGEMAP_API_KEY server-side (env below), since config.js is a public static file
// shipped to every visitor's browser — a secret can't live there.
const OCM_BASE_URL = 'https://api.openchargemap.io/v3';
const MAX_RESULTS_CAP = 50; // clamp: anyone can call this endpoint and spend this deployment's OCM quota

// `*` is fine — no cookies/credentials involved; real protection is the API key living only in `env`.
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

export async function openChargePoi(requestUrl, env) {
  const key = env && env.OPENCHARGEMAP_API_KEY;
  if (!key) {
    // Distinct status so the client can tell "not configured" apart from "Open Charge Map failed"
    // (see app.js's fetchNearbyChargingStations).
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
    // Forwarded as-is (status included) so a real Open Charge Map failure stays distinguishable
    // from this endpoint's own 400/501.
    if (!res.ok) console.error('[opencharge-poi] Open Charge Map returned HTTP', res.status, 'for', lat, lon);
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    console.error('[opencharge-poi] failed to reach Open Charge Map -', err.message);
    return new Response(JSON.stringify({ error: 'Could not reach Open Charge Map.' }), {
      status: 502,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  }
}
