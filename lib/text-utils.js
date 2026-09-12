// Text/HTML-safety helpers extracted from app.js for testing in plain Node.

/** Splits a display_name into a primary name and secondary address at the first comma. */
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

// Checks the URL's protocol is http/https — escapeHtml alone won't stop a javascript: link.
export function isSafeHttpUrl(value) {
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
