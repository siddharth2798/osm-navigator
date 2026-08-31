// Label text for the Kochi transit itinerary-alternatives cards —
// extracted from app.js so it's testable in plain Node (see
// tests/transit-labels.test.js). Behavior is unchanged; app.js imports
// these instead of defining them locally.

/** Label parts for one itinerary's card — "Metro"/"Water Metro" — derived
 * purely from which leg modes are present, never hardcoded per station, so
 * this keeps working if the candidate search in app.js or the bundled data
 * changes what combinations are possible. */
export function kochiItineraryBaseParts(itinerary) {
  const parts = [];
  if (itinerary.legs.some((l) => l.mode === 'SUBWAY')) parts.push('Metro');
  if (itinerary.legs.some((l) => l.mode === 'FERRY')) parts.push('Water Metro');
  return parts;
}

/** One label per itinerary in `itineraries` — e.g. "Metro + Water Metro",
 * "Metro" — with a disambiguating "(via StationName)" suffix added ONLY
 * when two itineraries would otherwise share an identical label (e.g. two
 * metro-only alternatives alighting at different nearby stations — see the
 * KOCHI_METRO_ALIGHT_WINDOW candidates in buildKochiItineraries, app.js). */
export function buildTransitItineraryLabels(itineraries) {
  const labels = itineraries.map((it) => kochiItineraryBaseParts(it).join(' + '));
  const counts = new Map();
  labels.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
  return itineraries.map((itinerary, i) => {
    if (counts.get(labels[i]) <= 1) return labels[i];
    const rideLeg = itinerary.legs.find((l) => l.mode === 'SUBWAY' || l.mode === 'FERRY');
    const viaName = rideLeg && rideLeg.to && rideLeg.to.name;
    return viaName ? `${labels[i]} (via ${viaName})` : labels[i];
  });
}
