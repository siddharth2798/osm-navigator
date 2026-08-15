// Cloudflare Pages Function — proxies TomTom's Category Search so the real
// API key lives only as a Cloudflare secret (context.env.TOMTOM_API_KEY, set
// via the dashboard), never in the client bundle. The term allow-list keeps
// this from becoming an open relay for arbitrary TomTom category searches —
// it only ever forwards the same fixed set of terms
// tomtomCategorySearchNear (app.js) already used when it called TomTom
// directly.
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

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const term = url.searchParams.get('term');
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const radius = Math.min(parseInt(url.searchParams.get('radius'), 10) || 5000, 20000);
  if (!ALLOWED_TERMS.has(term) || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response('Bad request', { status: 400 });
  }

  try {
    const upstream = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(term)}.json?key=${context.env.TOMTOM_API_KEY}&lat=${lat}&lon=${lon}&radius=${radius}&limit=10`;
    const res = await fetch(upstream);
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response('Upstream error', { status: 502 });
  }
}
