// Secret spot collections — pure helpers shared by the browser (app.js) and the Worker (lib/spots-api.js).
// A "collection" is a themed set of community-added spots (food, viewpoints, ...) unlocked by a keyword typed
// into the search bar. No DOM, no fetch — everything here runs in plain Node for tests.

export const SPOT_LIMITS = Object.freeze({
  NAME_MAX: 80,
  NOTE_MAX: 500,
  URL_MAX: 300,
});

// Splits on "near" so "<keyword> near <place>" works; a keyword may itself contain spaces.
const NEAR_SPLIT = /\s+near\s+/gi;

/** Lowercases, trims and collapses whitespace so "  Secret   Eats " and "secret eats" are the same keyword. */
export function normalizeKeyword(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Salted hash of a keyword. The salt is per collection, so identical keywords on two collections differ. */
export function hashKeyword(keyword, salt) {
  return sha256Hex(`${salt}:${normalizeKeyword(keyword)}`);
}

/**
 * Every way the query could be read as "<keyword>" or "<keyword> near <place>".
 * The whole query is always candidate #1; each " near " then yields a further split.
 */
export function keywordCandidates(query) {
  const text = String(query ?? '').trim();
  const candidates = [{ keyword: text, place: null }];
  for (const match of text.matchAll(NEAR_SPLIT)) {
    const keyword = text.slice(0, match.index).trim();
    const place = text.slice(match.index + match[0].length).trim();
    if (keyword && place) candidates.push({ keyword, place });
  }
  return candidates;
}

/**
 * Checks a search query against the public manifest ([{id, salt, hash}]) without contacting the server.
 * Returns { id, keyword, place } for the first collection whose keyword matches, otherwise null.
 */
export async function matchCollection(query, manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) return null;
  const candidates = keywordCandidates(query).filter((c) => normalizeKeyword(c.keyword).length > 0);
  for (const candidate of candidates) {
    for (const entry of manifest) {
      if (!entry || !entry.salt || !entry.hash) continue;
      if (await hashKeyword(candidate.keyword, entry.salt) === entry.hash) {
        return { id: entry.id, keyword: normalizeKeyword(candidate.keyword), place: candidate.place };
      }
    }
  }
  return null;
}

/** Constant-time-ish string compare for hex digests. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function stripControlChars(s) {
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates and normalises a new-spot draft (used by the add form and again by the server).
 * `categoryIds` is the collection's allowed category ids; an empty list accepts none.
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function validateSpotDraft(draft, categoryIds = []) {
  if (!draft || typeof draft !== 'object') return { ok: false, error: 'Missing spot details.' };

  const name = stripControlChars(String(draft.name ?? ''));
  if (!name) return { ok: false, error: 'Give the spot a name.' };
  if (name.length > SPOT_LIMITS.NAME_MAX) return { ok: false, error: `Name must be ${SPOT_LIMITS.NAME_MAX} characters or fewer.` };

  const lat = Number(draft.lat);
  const lon = Number(draft.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, error: 'Pick a valid location on the map.' };
  }

  const category = String(draft.category ?? '');
  if (!categoryIds.includes(category)) return { ok: false, error: 'Pick a type.' };

  const note = stripControlChars(String(draft.note ?? ''));
  if (note.length > SPOT_LIMITS.NOTE_MAX) return { ok: false, error: `Note must be ${SPOT_LIMITS.NOTE_MAX} characters or fewer.` };

  const url = String(draft.url ?? '').trim();
  if (url) {
    if (url.length > SPOT_LIMITS.URL_MAX) return { ok: false, error: 'That link is too long.' };
    if (!isAbsoluteHttpUrl(url)) return { ok: false, error: 'Links must start with http:// or https://.' };
  }

  return { ok: true, value: { name, lat, lon, category, note, url } };
}

/** Link to the spot's Google Maps page. Built here, never taken from user input. */
export function googleMapsSpotUrl(name, lat, lon) {
  const query = `${name} ${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Great-circle distance in metres. */
export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Parses "w,s,e,n" into numbers, or null when malformed, inverted or outside the world. The default span cap is the
 * whole globe: the response size is bounded by the API's result limit, not by how wide the box is. */
export function parseBbox(text, maxSpanDeg = 360) {
  const parts = String(text ?? '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = parts;
  if (s < -90 || n > 90 || w < -180 || e > 180 || s >= n || w >= e) return null;
  if (n - s > maxSpanDeg || e - w > maxSpanDeg) return null;
  return { w, s, e, n };
}

/** Parses "lat,lon" into numbers, or null when malformed or out of range. */
export function parseLatLon(text) {
  const parts = String(text ?? '').split(',').map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lon] = parts;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** A square bbox string ("w,s,e,n") of the given half-size in degrees around a point. */
export function bboxAround(lat, lon, halfDeg = 0.05) {
  return [lon - halfDeg, lat - halfDeg, lon + halfDeg, lat + halfDeg].map((n) => +n.toFixed(6)).join(',');
}
