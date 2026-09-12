// Parses a pasted/shared Google Maps link into {lat, lon, name, matchedUrl}. Extracted from
// app.js so it's testable in plain Node (see tests/google-maps-url.test.js).
export const GOOGLE_MAPS_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com']);

/** Parses a pasted Google Maps URL. Prefers the precise !3d/!4d place-pin coords over the
 * @lat,lng viewport center. Returns null if not a Google Maps URL, else an object with whatever could be extracted. */
export function parseGoogleMapsUrl(text) {
  const trimmed = text.trim();
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a bare URL — Google's share action sends a name + link together as one blob of
    // text, so look for a URL anywhere inside it before giving up.
    const embedded = trimmed.match(/https?:\/\/\S+/);
    if (!embedded) return null;
    try {
      url = new URL(embedded[0]);
    } catch {
      return null;
    }
  }
  if (!GOOGLE_MAPS_HOSTS.has(url.hostname) || (url.hostname !== 'maps.app.goo.gl' && !url.pathname.includes('/maps'))) return null;
  // The isolated URL (not the surrounding text) is what /api/resolve-maps-url needs for a short link.
  const matchedUrl = url.toString();

  const nameMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : (url.searchParams.get('q') || null);

  const preciseMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (preciseMatch) return { lat: parseFloat(preciseMatch[1]), lon: parseFloat(preciseMatch[2]), name, matchedUrl };

  const centerMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  if (centerMatch) return { lat: parseFloat(centerMatch[1]), lon: parseFloat(centerMatch[2]), name, matchedUrl };

  return name ? { name, matchedUrl } : { matchedUrl };
}
