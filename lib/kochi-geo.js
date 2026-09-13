// Pure geo-search helpers for the Kochi transit planner, extracted from app.js so they're
// testable in plain Node (see tests/kochi-geo.test.js). Has its own small haversine
// implementation instead of importing turf, which app.js loads via a <script> tag, not an ES import.
const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance between two [lat, lon] points, in meters. */
export function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Nearest entry in `stations` to a point, or null if none have coordinates. */
export function nearestKochiStation(lat, lon, stations) {
  let best = null;
  let bestDistM = Infinity;
  stations.forEach((s, index) => {
    if (s.lat == null || s.lon == null) return;
    const distM = haversineDistanceM(lat, lon, s.lat, s.lon);
    if (distM < bestDistM) { bestDistM = distM; best = { ...s, index, distanceM: distM }; }
  });
  return best;
}

/** Every (metroStation, waterMetroJetty) pair within `maxM` of each other — a walkable
 * transfer point between the two networks. Purely coordinate-based, does no caching itself. */
export function findKochiTransferPoints(metroStations, waterMetroStations, maxM) {
  const points = [];
  metroStations.forEach((metroStation, metroIndex) => {
    if (metroStation.lat == null || metroStation.lon == null) return;
    waterMetroStations.forEach((waterStation) => {
      if (waterStation.lat == null || waterStation.lon == null) return;
      const distM = haversineDistanceM(metroStation.lat, metroStation.lon, waterStation.lat, waterStation.lon);
      if (distM <= maxM) points.push({ metroStation, metroIndex, waterStation, distM });
    });
  });
  return points;
}

/** Metro station (if any) at the same spot as `feederStationName`, within `maxM`.
 * Null if it's not a known feeder stop or isn't close enough to any station. */
export function feederRouteMetroEnd(feederStationName, metroStations, feederStations, maxM) {
  const station = feederStations.find((s) => s.name === feederStationName);
  if (!station) return null;
  const nearest = nearestKochiStation(station.lat, station.lon, metroStations);
  return nearest && nearest.distanceM <= maxM ? nearest : null;
}
