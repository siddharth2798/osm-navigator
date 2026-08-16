// Shared logic behind the "resolve a Google Maps short link" endpoint —
// used by both functions/api/resolve-maps-url.js (Cloudflare Pages) and
// worker.js (a plain Cloudflare Worker with static assets), so the
// security-sensitive allow-list only ever lives in one place. Follows the
// short link's redirect server-side and hands back the final URL — a
// browser can't do this itself, since a cross-origin redirect's target
// isn't readable via fetch() due to CORS. No API key, no secret, nothing
// to configure. The host allow-list keeps this from becoming an open
// redirect-follower for arbitrary URLs.
const ALLOWED_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);

export async function resolveMapsUrl(requestUrl) {
  const target = requestUrl.searchParams.get('url');
  if (!target) return new Response('Bad request', { status: 400 });

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  // Belt-and-suspenders alongside the host check: only ever follow a plain
  // http(s) link. fetch() already rejects any other scheme on its own, but
  // that's an implicit side effect of the runtime rather than something
  // this function asserts itself — a scheme like `javascript://google.com`
  // still parses `.hostname` as "google.com" (the URL parser treats `//`
  // as introducing an authority regardless of scheme), so the host check
  // alone doesn't rule it out.
  if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') return new Response('Bad request', { status: 400 });
  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) return new Response('Bad request', { status: 400 });

  try {
    const res = await fetch(targetUrl.toString(), { redirect: 'follow' });
    return new Response(JSON.stringify({ resolvedUrl: res.url }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response('Upstream error', { status: 502 });
  }
}
