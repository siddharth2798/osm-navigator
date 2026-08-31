// Pure geo-search helpers for the Kochi transit planner — extracted from
// app.js so they're testable in plain Node (see tests/kochi-geo.test.js).
// app.js's own copies used the `turf` global (loaded via a <script> tag,
// not an ES import — see index.html) purely for turf.distance, so this
// module carries its own small haversine implementation instead of adding
// a new dependency or requiring app.js to import turf differently. Same
// mean-Earth-radius constant Turf itself uses, so results match it to well
// within the precision any real threshold comparison here cares about
// (KOCHI_DRIVE_MAX_M/KOCHI_TRANSFER_MAX_M are on the order of hundreds to
// thousands of meters — nowhere near sensitive to the sub-0.1% difference
// between reasonable Earth-radius conventions).
const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance between two [lat, lon] points, in meters. */
export function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Nearest entry in `stations` (metro stations or water-metro jetties, both
 * plain {name/lat/lon, ...} arrays) to a point, or null if the array is
 * empty/every entry lacks coordinates (see the water-metro build script's
 * own "needs manual coordinates" warning for when that can happen). */
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

/** Every (metroStation, waterMetroJetty) pair within `maxM` of each other —
 * a real-world walkable transfer point between the two independent Kochi
 * transit networks (e.g. Metro's "Vyttila" station and Water Metro's
 * "Vytilla" jetty, 222m apart). Purely coordinate-based — no hardcoded
 * station names — so this keeps working if either bundled dataset is
 * regenerated with different names/positions/order. The ~25×10 pair count
 * is trivial to brute-force; no need for anything cleverer at this size.
 * app.js's own findKochiTransferPoints wraps this with its lazy
 * kochiTransferPointsCache — this function itself does no caching, so it's
 * safe to call repeatedly/in a test without worrying about stale results. */
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
