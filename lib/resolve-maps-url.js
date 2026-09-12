// Backend for "resolve a Google Maps short link", shared by functions/api/resolve-maps-url.js and worker.js.
// Follows the redirect server-side (a browser can't read a cross-origin redirect target itself) and
// returns the final URL. ALLOWED_HOSTS stops this from becoming an open redirect-follower.
const ALLOWED_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);

// Needed for the Android shell, which calls this cross-origin (origin https://localhost); without it
// the browser can't read any response here. `*` is fine — no cookies/credentials involved, and real
// access control is ALLOWED_HOSTS below, not same-origin policy.
const CORS_HEADERS = { 'access-control-allow-origin': '*' };

export async function resolveMapsUrl(requestUrl) {
  const target = requestUrl.searchParams.get('url');
  if (!target) return new Response('Bad request', { status: 400, headers: CORS_HEADERS });

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Bad request', { status: 400, headers: CORS_HEADERS });
  }
  // Extra check alongside the host check: a scheme like javascript://google.com still parses
  // .hostname as "google.com", so the hostname check alone isn't enough.
  if (!isAllowedUrl(targetUrl)) return new Response('Bad request', { status: 400, headers: CORS_HEADERS });

  try {
    const res = await fetch(targetUrl.toString(), { redirect: 'follow' });
    const resolvedUrl = unwrapGoogleSorryPage(res.url);
    // Re-check the allow-list on where the redirect actually landed — a compromised or
    // repurposed short link could redirect somewhere off-list.
    let resolvedHostOk;
    try { resolvedHostOk = isAllowedUrl(new URL(resolvedUrl)); } catch { resolvedHostOk = false; }
    if (!resolvedHostOk) {
      console.error('[resolve-maps-url] redirect chain left the allow-list:', targetUrl.toString(), '->', resolvedUrl);
      return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ resolvedUrl }), { status: 200, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    console.error('[resolve-maps-url] failed to reach', targetUrl.toString(), '-', err.message);
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }
}

// Same check used for both the initial request URL and the unwrapped `continue` param below.
function isAllowedUrl(url) {
  return (url.protocol === 'https:' || url.protocol === 'http:') && ALLOWED_HOSTS.has(url.hostname);
}

// Google sometimes serves a "sorry" anti-abuse interstitial instead of redirecting directly;
// the real destination is in its `continue` param, so unwrap that instead of giving up.
// `continue` is attacker-influenceable, so it gets the same allow-list check before being trusted.
function unwrapGoogleSorryPage(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('google.com') && parsed.pathname.startsWith('/sorry/')) {
      const target = parsed.searchParams.get('continue');
      if (target) {
        const targetUrl = new URL(target, parsed);
        if (isAllowedUrl(targetUrl)) return targetUrl.toString();
      }
    }
  } catch {
    // fall through and return the original URL unchanged
  }
  return url;
}
