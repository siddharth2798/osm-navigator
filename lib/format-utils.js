// Plain display-text formatters extracted from app.js for testing in plain Node.

export function formatDistance(m) {
  if (m < 950) return Math.round(m) + ' m';
  return (m / 1000).toFixed(1) + ' km';
}

export function formatDuration(s) {
  const mins = Math.round(s / 60);
  if (mins < 1) return '<1 min';
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  return h + ' h ' + (mins % 60) + ' min';
}

/** Formats a wait time like "in 4 min"; null when there's no next departure to show. */
export function formatWaitText(waitS) {
  if (waitS == null) return null;
  const mins = Math.round(waitS / 60);
  return mins < 1 ? 'in under a minute' : `in ${mins} min`;
}

/** Formats multiple wait times like "in 2, 17, 32 min"; falls back to formatWaitText for a single value. */
export function formatWaitsText(waitsS) {
  if (!waitsS || !waitsS.length) return null;
  if (waitsS.length === 1) return formatWaitText(waitsS[0]);
  return 'in ' + waitsS.map((s) => { const m = Math.round(s / 60); return m < 1 ? '<1' : String(m); }).join(', ') + ' min';
}

export function formatBytes(n) {
  if (!n) return '0 MB';
  const mb = n / (1024 * 1024);
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}

/** Formats a fare like "₹80", or "from ₹80" when isPartial (not all legs have a known fare). */
export function formatFareINR(amount, isPartial) {
  return `${isPartial ? 'from ' : ''}₹${amount}`;
}
