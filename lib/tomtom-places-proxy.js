// Shared TomTom Category Search proxy logic, used by both the Pages function and the Worker.
// API key stays server-side (env.TOMTOM_API_KEY); the term allow-list stops this becoming an open relay.
const ALLOWED_TERMS = new Set([
  'petrol station',
  'ev charging station',
  'pharmacy',
  'atm',
  'hospital',
  'restaurant',
  'parking',
  'hotel',
]);

const CORS_HEADERS = { 'access-control-allow-origin': '*' };

export async function tomtomPlacesSearch(requestUrl, env) {
  const term = requestUrl.searchParams.get('term');
  const lat = parseFloat(requestUrl.searchParams.get('lat'));
  const lon = parseFloat(requestUrl.searchParams.get('lon'));
  const radius = Math.max(100, Math.min(parseInt(requestUrl.searchParams.get('radius'), 10) || 5000, 20000));
  if (!ALLOWED_TERMS.has(term) || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response('Bad request', { status: 400, headers: CORS_HEADERS });
  }

  try {
    const upstream = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(term)}.json?key=${env.TOMTOM_API_KEY}&lat=${lat}&lon=${lon}&radius=${radius}&limit=10`;
    const res = await fetch(upstream);
    if (!res.ok) console.error('[tomtom-places-proxy] TomTom returned HTTP', res.status, 'for term', term);
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    console.error('[tomtom-places-proxy] failed to reach TomTom -', err.message);
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }
}
