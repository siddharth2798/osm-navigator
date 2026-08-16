// Cloudflare Pages Function — follows a Google Maps short link's redirect
// server-side and hands back the final URL. A browser can't do this itself:
// a cross-origin redirect's target isn't readable via fetch() due to CORS.
// No API key, no secret, nothing to configure — this is a pure redirect
// follow against Google's own share-link infrastructure. The host allow-list
// keeps this from becoming an open redirect-follower for arbitrary URLs.
const ALLOWED_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const target = requestUrl.searchParams.get('url');
  if (!target) return new Response('Bad request', { status: 400 });

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) return new Response('Bad request', { status: 400 });

  try {
    const res = await fetch(targetUrl.toString(), { redirect: 'follow' });
    return new Response(JSON.stringify({ resolvedUrl: res.url }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response('Upstream error', { status: 502 });
  }
}
