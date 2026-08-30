// Shared logic behind the TomTom Category Search proxy — used by both
// functions/api/places.js (Cloudflare Pages) and worker.js (the plain
// Worker deployment path), same split as flights-proxy.js/opencharge-poi.js
// right next to this file. The real API key lives only as a Cloudflare
// secret (env.TOMTOM_API_KEY, set via the dashboard), never in the client
// bundle. The term allow-list keeps this from becoming an open relay for
// arbitrary TomTom category searches — it only ever forwards the same
// fixed set of terms tomtomCategorySearchNear (app.js) already uses.
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
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }
}
