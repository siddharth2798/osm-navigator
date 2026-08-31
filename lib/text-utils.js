// Small text/HTML-safety helpers — extracted from app.js so they're
// testable in plain Node with no DOM/browser globals (see
// tests/text-utils.test.js). Behavior is unchanged; app.js imports these
// instead of defining them locally.

/** Nominatim's `display_name` is one long comma-separated string with no
 * distinction between "the name" and "the rest of the address" — shown
 * verbatim, that's what made the search bar and every card built from it
 * read as an unbroken wall of text. Splitting on the first comma and
 * treating everything after it as secondary detail is a good enough
 * heuristic to get a bold place name + a dim address line almost
 * everywhere, matching how Google Maps presents a picked result. This is
 * purely a rendering split — `label` itself (used for recent trips,
 * favorites, and the native notification title) keeps the full string. */
export function splitPlaceLabel(label) {
  const commaIndex = label.indexOf(',');
  if (commaIndex === -1) return { primary: label, secondary: '' };
  return { primary: label.slice(0, commaIndex).trim(), secondary: label.slice(commaIndex + 1).trim() };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// escapeHtml() only escapes HTML metacharacters — it doesn't stop a
// `javascript:` (or other non-http(s)) value from being written into an
// href and executing on click. Used wherever a URL comes from a
// community-editable upstream source (Open Charge Map operator links) or a
// failed Google Maps link resolve (see showStatus's opts.link in app.js)
// rather than this app's own code. `new URL(value, base)`'s base only
// matters for a relative `value` — every real caller passes an absolute
// URL, so falling back to a harmless placeholder base in a non-browser
// environment (no `location` global, e.g. these tests) never changes the
// real answer.
export function isSafeHttpUrl(value) {
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
