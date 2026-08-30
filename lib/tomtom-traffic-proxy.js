// Shared logic behind the TomTom Flow Segment Data proxy — used by both
// functions/api/traffic.js (Cloudflare Pages) and worker.js (the plain
// Worker deployment path), same split as flights-proxy.js/opencharge-poi.js
// right next to this file. The real API key lives only as a Cloudflare
// secret (env.TOMTOM_API_KEY, set via the dashboard), never in the client
// bundle — this proxy exists to keep it server-side, not for CORS (TomTom
// does send CORS headers, but the key still can't go in a client fetch).
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

export async function tomtomTrafficFlow(requestUrl, env) {
  const lat = parseFloat(requestUrl.searchParams.get('lat'));
  const lon = parseFloat(requestUrl.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response('Bad request', { status: 400, headers: CORS_HEADERS });
  }

  try {
    const upstream = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${env.TOMTOM_API_KEY}`;
    const res = await fetch(upstream);
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }
}
