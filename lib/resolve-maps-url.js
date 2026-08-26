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

// Every response below needs this, not just the success path: on the web
// this endpoint is always called same-origin (a relative path — see the
// call site in app.js), so CORS was never relevant. The Capacitor Android
// shell is the one caller that hits this cross-origin (its own origin is
// https://localhost, calling the deployed Worker's real domain via
// CONFIG.RESOLVE_MAPS_URL_BASE) — without this header, the browser blocks
// reading ANY response here regardless of status code, surfacing as a bare
// "TypeError: Failed to fetch" client-side with zero information about
// what actually happened server-side (confirmed live: this endpoint
// genuinely returned 200 with a correct body — curl with a matching Origin
// header proved it — the response was simply never readable by the page).
// `*` (not a specific origin) is fine here: this endpoint takes no cookies/
// credentials, and its real access control is ALLOWED_HOSTS below, not
// same-origin policy — anyone can already reach it directly (curl, a
// script) regardless of what CORS header it sends.
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
  // Belt-and-suspenders alongside the host check: only ever follow a plain
  // http(s) link. fetch() already rejects any other scheme on its own, but
  // that's an implicit side effect of the runtime rather than something
  // this function asserts itself — a scheme like `javascript://google.com`
  // still parses `.hostname` as "google.com" (the URL parser treats `//`
  // as introducing an authority regardless of scheme), so the host check
  // alone doesn't rule it out.
  if (!isAllowedUrl(targetUrl)) return new Response('Bad request', { status: 400, headers: CORS_HEADERS });

  try {
    const res = await fetch(targetUrl.toString(), { redirect: 'follow' });
    const resolvedUrl = unwrapGoogleSorryPage(res.url);
    return new Response(JSON.stringify({ resolvedUrl }), { status: 200, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    return new Response('Upstream error', { status: 502, headers: CORS_HEADERS });
  }
}

// Same protocol + host check applied to both the initial request param and
// the `continue` param unwrapped from Google's "sorry" interstitial below —
// centralized so the interstitial-unwrap path can't become a second,
// unchecked exit out of the allow-list.
function isAllowedUrl(url) {
  return (url.protocol === 'https:' || url.protocol === 'http:') && ALLOWED_HOSTS.has(url.hostname);
}

// Google occasionally serves its own "unusual traffic" interstitial
// (google.com/sorry/index?continue=<the real destination>&q=...) instead of
// actually redirecting to the place page — seen from Cloudflare Workers'
// shared egress IPs, which Google's abuse detection flags far more readily
// than a residential IP. The interstitial still carries the real
// destination (coordinates included) in its own `continue` param, so this
// unwraps that instead of giving up. `continue` is attacker-influencable in
// principle (it rides along inside a redirect chain that starts from a
// caller-supplied URL), so it gets the exact same allow-list check as the
// original request param before being trusted as a resolved destination —
// otherwise this unwrap would be a second, unchecked way out of
// ALLOWED_HOSTS. A `continue` value that fails the check is discarded in
// favor of the interstitial's own URL, same as if unwrapping had found
// nothing at all.
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
