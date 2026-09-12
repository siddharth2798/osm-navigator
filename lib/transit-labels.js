// Label text for the Kochi transit itinerary-alternatives cards, extracted from app.js for testing in plain Node.

/** Returns label parts like "Metro"/"Water Metro" based on which leg modes are present. */
export function kochiItineraryBaseParts(itinerary) {
  const parts = [];
  if (itinerary.legs.some((l) => l.mode === 'SUBWAY')) parts.push('Metro');
  if (itinerary.legs.some((l) => l.mode === 'FERRY')) parts.push('Water Metro');
  return parts;
}

/** Builds one label per itinerary, adding "(via StationName)" when two itineraries would otherwise share a label. */
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
