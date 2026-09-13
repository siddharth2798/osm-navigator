// Shared TomTom Flow Segment Data proxy logic, used by both the Pages function and the Worker.
// Exists to keep env.TOMTOM_API_KEY server-side, not for CORS (TomTom already sends CORS headers).
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
    if (!res.ok) console.error('[tomtom-traffic-proxy] TomTom returned HTTP', res.status, 'for', lat, lon);
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    console.error('[tomtom-traffic-proxy] failed to reach TomTom -', err.message);
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }
}
