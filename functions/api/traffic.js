// Cloudflare Pages Function — proxies TomTom's Flow Segment Data so the real
// API key lives only as a Cloudflare secret (context.env.TOMTOM_API_KEY, set
// via the dashboard), never in the client bundle. Mirrors the request/response
// shape app.js's fetchTomTomFlowRatio already expects, so that function only
// needed a URL change, not a parsing change.
// Same rationale as resolve-maps-url.js's CORS_HEADERS: harmless to set
// unconditionally (no cookies/credentials involved, real access control is
// upstream in TomTom's own key) and keeps this endpoint usable from a
// cross-origin caller (e.g. the Android shell) without a separate code path.
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response('Bad request', { status: 400, headers: CORS_HEADERS });
  }

  try {
    const upstream = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${context.env.TOMTOM_API_KEY}`;
    const res = await fetch(upstream);
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }
}
