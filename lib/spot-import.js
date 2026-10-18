// Pure helpers for scripts/import-spots.mjs: turn an owner's list of places (JSON entries, or a text file of
// Google Maps links) into spot drafts. No network of its own — the redirect-follower is passed in.
import { parseGoogleMapsUrl } from './google-maps-url.js';

/**
 * One entry per non-blank, non-comment line. Format: `<google maps link> | <category> | <note>`;
 * category and note are optional ("|" separated), a missing category falls back to `defaultCategory`.
 */
export function parseLinkLines(text, defaultCategory = '') {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [maps, category, ...noteParts] = line.split('|').map((part) => part.trim());
      return { maps, category: category || defaultCategory, note: noteParts.join(' | ') };
    });
}

/**
 * Resolves one entry to a draft ready for POST /api/spots/import: { name, lat, lon, category, note, url }.
 * An entry may carry lat/lon directly, or a Google Maps link (`maps`) that is parsed — and, for a short link
 * that has no coordinates in it, followed through `followRedirect(url) -> final url`.
 * Returns { draft } or { error }.
 */
export async function resolveImportEntry(entry, { followRedirect, defaultCategory = '' } = {}) {
  const category = entry.category || defaultCategory;
  const base = { category, note: entry.note || '', url: entry.url || '' };

  const lat = Number(entry.lat);
  const lon = Number(entry.lon);
  if (entry.lat != null && entry.lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    if (!entry.name) return { error: 'Missing "name".' };
    return { draft: { name: entry.name, lat, lon, ...base } };
  }

  if (!entry.maps) return { error: 'Needs either lat/lon or a Google Maps link ("maps").' };
  let parsed = parseGoogleMapsUrl(entry.maps);
  if (!parsed) return { error: 'Not a Google Maps link.' };
  if (parsed.lat == null && followRedirect) {
    try {
      const finalUrl = await followRedirect(parsed.matchedUrl);
      parsed = parseGoogleMapsUrl(finalUrl) || parsed;
    } catch (err) {
      return { error: `Couldn't follow the link: ${err.message}` };
    }
  }
  if (parsed.lat == null || parsed.lon == null) {
    return { error: 'No coordinates found in that link — open it in a browser and copy the full address-bar URL, or give lat/lon.' };
  }
  const name = entry.name || parsed.name;
  if (!name) return { error: 'The link has no place name — add a "name".' };
  return { draft: { name, lat: parsed.lat, lon: parsed.lon, ...base } };
}
