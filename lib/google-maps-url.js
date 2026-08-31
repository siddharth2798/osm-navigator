// Parses a pasted/shared Google Maps link (any format) into
// {lat, lon, name, matchedUrl} — extracted from app.js so it's testable in
// plain Node with no DOM/browser globals (see tests/google-maps-url.test.js).
// Behavior is unchanged; app.js imports this instead of defining it locally.
export const GOOGLE_MAPS_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);

/** Pure, no-network parse of a pasted Google Maps URL. `!3d<lat>!4d<lng>`
 * (present on most /maps/place/ links) is the precise place-pin coordinate
 * Google itself resolved the name to — preferred over the `@lat,lng,zoom`
 * segment, which is only ever the map's viewport center at share time (can
 * be off if the sharer had panned before sharing). Falls back to the place
 * name in the path for a short link with no coordinates yet, or a URL that
 * only ever had a name (e.g. a plain `?q=` search link).
 * Returns `null` only when `text` isn't a Google Maps URL at all — once the
 * host matches, always returns an object (`{lat, lon, name?}`, `{name}`, or
 * `{}`), even when nothing could be extracted yet (a bare short link with
 * no name/coordinates in its own URL — resolveGoogleMapsLink's redirect
 * hop in app.js is what fills that in), so callers can tell "not a Google
 * Maps link" apart from "is one, nothing to show yet". */
export function parseGoogleMapsUrl(text) {
  const trimmed = text.trim();
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a bare URL by itself — Google Maps' own "Share" action (and most
    // other apps) share a place name and link together as one blob of text
    // ("Cafe UUTOPIA ft. Toddy\nhttps://maps.app.goo.gl/...") rather than a
    // clean URL on its own, so look for a URL anywhere inside the string
    // before giving up. The rest of this function still matches !3d/!4d and
    // @lat,lng against the whole original blob below, which is fine — those
    // are numeric URL-only patterns a place name won't coincidentally contain.
    const embedded = trimmed.match(/https?:\/\/\S+/);
    if (!embedded) return null;
    try {
      url = new URL(embedded[0]);
    } catch {
      return null;
    }
  }
  if (!GOOGLE_MAPS_HOSTS.has(url.hostname) || (url.hostname !== 'maps.app.goo.gl' && !url.pathname.includes('/maps'))) return null;
  // The isolated URL itself — not the surrounding blob — is what a caller
  // needs to hand to /api/resolve-maps-url for a short link; the raw text
  // (e.g. "Cafe UUTOPIA ft. Toddy\nhttps://maps.app.goo.gl/...") isn't a
  // valid URL on its own and would just get rejected as a bad request.
  const matchedUrl = url.toString();

  const nameMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : (url.searchParams.get('q') || null);

  const preciseMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (preciseMatch) return { lat: parseFloat(preciseMatch[1]), lon: parseFloat(preciseMatch[2]), name, matchedUrl };

  const centerMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  if (centerMatch) return { lat: parseFloat(centerMatch[1]), lon: parseFloat(centerMatch[2]), name, matchedUrl };

  return name ? { name, matchedUrl } : { matchedUrl };
}
