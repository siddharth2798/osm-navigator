// Plain display-text formatters — extracted from app.js so they're testable
// in plain Node with no DOM/browser globals at all (see tests/format-utils.test.js).
// Behavior is unchanged; app.js imports these instead of defining them locally.

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

/** "in 4 min" / "in under a minute" for a Kochi transit ride leg's waitS
 * (see planKochiMetroRideLeg/planKochiWaterMetroRideLegs) — null when
 * there's no real next departure to report (e.g. after the last train of
 * the day), in which case the caller just omits the line entirely rather
 * than showing a wrong or empty time. */
export function formatWaitText(waitS) {
  if (waitS == null) return null;
  const mins = Math.round(waitS / 60);
  return mins < 1 ? 'in under a minute' : `in ${mins} min`;
}

/** "in 2, 17, 32 min" for a Kochi ride leg's waitsS (see
 * planKochiMetroRideLeg/planKochiWaterMetroRideLegs) — the next few real
 * departures, not just the immediate one, so you can see whether it's worth
 * rushing for this one or just catching the next. Falls back to
 * formatWaitText's single-departure phrasing when there's only one (or
 * none) left today, rather than a one-item list reading like "in 2 min"
 * with an orphaned comma. */
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

/** "₹80", or "from ₹80" when `isPartial` — used both per-leg (always exact,
 * a single ride leg's own known fare) and for a Kochi transit itinerary's
 * total (which is `isPartial` when at least one ride leg's fare isn't in
 * the bundled data, so the number shown is a floor, not the real total —
 * see buildKochiItineraries' own totalFareINR/fareIsPartial comment in
 * app.js). */
export function formatFareINR(amount, isPartial) {
  return `${isPartial ? 'from ' : ''}₹${amount}`;
}
