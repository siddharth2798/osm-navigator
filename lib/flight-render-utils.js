// Pure rendering-logic helpers for the personal flight-tracking overlay's
// "Flight Tracking Mode" (FR24-style aircraft icons + dead reckoning) —
// pulled out of app.js into their own module so they're unit-testable
// without a DOM/MapLibre instance, same convention as lib/kochi-geo.js and
// lib/format-utils.js right next to this file. Icon DRAWING itself
// (makeSdfPlaneIcon in app.js) stays in app.js since it needs
// document.createElement('canvas') — not pure, nothing to gain from moving
// it here.
//
// classifyAircraftSize/aircraftColorFor/boostForDark/drCapSecFor and the
// dead-reckoning math in buildDRFeatureCollection are ported from the
// aurora project's own Map.tsx (classifyAircraft/aircraftColor/boostDark/
// drCapSec/buildDRGeoJSON) — same real-world airline livery colors and
// altitude-gradient/size-class tiering, adapted from React refs to plain
// functions over a Map<hex, {a, atMs}> cache (see app.js's
// flightDRCache/updateFlightLayer for how that cache gets fed).

/** Airline livery colors keyed by 3-letter ICAO callsign prefix. */
export const FLIGHT_AIRLINE_COLORS = {
  AAL: '#B9D6F2', UAL: '#1B3A6B', DAL: '#C41230', SWA: '#304CB2',
  ASA: '#006EB6', JBU: '#003876', HAL: '#7B2D8B', NKS: '#FEC900',
  FFT: '#298544', ACA: '#CC0000', WJA: '#0059A8', SKW: '#4E5E7C',
  BAW: '#075AAA', RYR: '#073590', EZY: '#FF6600', DLH: '#05164D',
  AFR: '#002395', KLM: '#009FDF', IBE: '#D2002F', AZA: '#006A4E',
  SAS: '#00349C', FIN: '#003580', TAP: '#00A67E', LOT: '#003F8A',
  VLG: '#E8612C', BEL: '#BC0024', AUA: '#BA0C2F', SWR: '#CC0000',
  EJU: '#FF6600', TOM: '#1B5FA8', NAX: '#D81939', CSA: '#003F8A',
  AEE: '#006DC9', TRA: '#1DA462', WZZ: '#C6007E', BTI: '#009FDF',
  AIC: '#C62828', IGO: '#0A2F6F', SDG: '#D32F2F', AXB: '#B22222',
  GOW: '#E87722', AKJ: '#FF6600', SEJ: '#FF0000',
  UAE: '#B8860B', ETD: '#BD9B60', QTR: '#5C0932', SVA: '#006934',
  MEA: '#CC0000', GFA: '#007749', FLY: '#E03A3E', ABY: '#CC0000',
  OMA: '#D4213D', GEC: '#CC0000',
  CPA: '#006564', CES: '#C8102E', CSN: '#0033A0', CCA: '#C8102E',
  JAL: '#CC0000', ANA: '#2B3990', KAL: '#003087', AAR: '#00509E',
  SIA: '#0F5FA6', MAS: '#CC0001', THA: '#670179', GAR: '#006B3F',
  QFA: '#C8102E', JST: '#EA7200', EVA: '#007B5E', CAL: '#007B5E',
  VNA: '#C8102E', PAL: '#0038A8', CEB: '#0067B0', HVN: '#D4213D',
  CXA: '#0067B0', SHB: '#E21B1B', AXM: '#D42A2A',
  CSZ: '#0033A0', CHH: '#1C6CC0', DKH: '#1C6CC0', OKA: '#0033A0',
  ETH: '#009245', KQA: '#CC0000', SAA: '#CC0000', MSR: '#CC0000',
  TAM: '#0069AA', LAT: '#0069AA', GLO: '#FF7600', AZU: '#1C3F94',
  AVA: '#CC0001', VOI: '#C8102E', AMX: '#006341', ARG: '#74ACDF',
  FDX: '#4D148C', UPS: '#351C15', CLX: '#002F6C', GTI: '#002F6C',
};

/** type may be null/empty (OpenSky-only poll, or a callsign this app's
 * /api/aircraft-info lookup hasn't resolved yet) — falls back to a generic
 * 'md' class rather than guessing, same as aurora's own fallback. */
export function classifyAircraftSize(type) {
  const t = (type || '').toUpperCase().trim();
  if (/^(B74[0-9DRST]|B748|A34[0-6]|A38[08]|IL96|DC8[5-9])/.test(t)) return 'xl';
  if (/^(B75[23]|B76[23]|B77[0-9LW]|B77[89]|B78[789X]|A30[06]|A33[0-9]|A35[09K]|DC10|MD11|L101|A310)/.test(t)) return 'lg';
  if (/^(A31[89]|A32[01]|A20N|A21N|A22[0-9]|BCS[13]|B71[0-9]|B72[0-9]|B73[0-9]|B38M|B39M|DC9[0-9]|MD[89][0-9])/.test(t)) return 'md';
  if (/^(CRJ|E1[3-9]|E7[0-9]|AT[3-7]|DH8|PC12|C208|TBM|GL[5-7T]|GLEX|C25|C56|C68|LJ[2-7]|FA[1-9]|CL[3-6])/.test(t)) return 'sm';
  if (/^(EC[2-9]|R2[24]|R66|B0[67]|AW|S7[0-9]|C1[5-9][0-9]|C2[0-9][0-9]|PA[2-4]|BE[3-5]|SR[12])/.test(t)) return 'xs';
  return t.length >= 3 ? 'md' : 'xs';
}

/** Proportionally brightens a hex color until it reads clearly against this
 * app's dark map (perceived luminance >= 0.18, capped at 3x) — several
 * airline liveries (e.g. UAL's navy, DLH's near-black) are otherwise too
 * dark to see against the base map style. Applied unconditionally since
 * this app has no light map style to branch on. */
export function boostFlightColorForDark(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum >= 0.18) return hex;
  const k = Math.min(0.18 / Math.max(lum, 0.001), 3);
  return `#${[r, g, b].map((c) => Math.min(255, Math.round(c * k)).toString(16).padStart(2, '0')).join('')}`;
}

/** Airline-livery color by callsign prefix first, altitude gradient as
 * fallback (green low -> cyan -> blue -> purple high) — matches aurora's
 * own tiering. altitude may be null/undefined (no alt_baro on this fix);
 * treated as the lowest gradient band via Number(altitude) || 0. */
export function aircraftColorFor(callsign, onGround, altitude) {
  if (onGround) return '#64748b';
  const prefix = (callsign || '').trim().toUpperCase().slice(0, 3);
  if (FLIGHT_AIRLINE_COLORS[prefix]) return boostFlightColorForDark(FLIGHT_AIRLINE_COLORS[prefix]);
  const alt = Number(altitude) || 0;
  if (alt < 5000) return '#4ade80';
  if (alt < 15000) return '#22d3ee';
  if (alt < 28000) return '#60a5fa';
  return '#a78bfa';
}

/** Extrapolation is capped shorter at low altitude (aircraft maneuvering
 * during approach/departure changes heading much faster than a cruising
 * one) — same tiering as aurora's drCapSec. altitude null/0 (no alt_baro,
 * or genuinely on the ground) falls into the longest — i.e. least
 * aggressively re-capped — 'cruise' tier below, since there's nothing more
 * specific to go on. */
export function drCapSecFor(altitude) {
  const alt = Number(altitude) || 0;
  if (alt > 0 && alt < 2000) return 15;
  if (alt > 0 && alt < 8000) return 20;
  return 30;
}

/** Rebuilds a flight-aircraft GeoJSON FeatureCollection from a
 * `Map<key, {a, atMs}>` cache, extrapolating each entry's position forward
 * from its last poll snapshot using heading + ground speed (dead
 * reckoning) — see app.js's buildDRFeatureCollection wrapper/
 * startFlightModeRendering for how this gets driven on a rAF tick.
 *
 * `describeLabel(flight)` is dependency-injected rather than imported
 * directly, since the real describeCallsign in app.js depends on a lazily-
 * loaded airline-code lookup table that has no reason to exist in this
 * pure module — defaults to the raw flight string (or '') so this stays
 * usable standalone. */
export function buildDRFeatureCollection(cache, nowMs, describeLabel = (flight) => flight || '') {
  const features = [];
  for (const { a, atMs } of cache.values()) {
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
    const dtSec = Math.min((nowMs - atMs) / 1000, drCapSecFor(a.alt_baro));
    let { lat, lon } = a;
    if (!a.on_ground && typeof a.gs === 'number' && a.gs > 5 && typeof a.track === 'number') {
      // 1 knot = 1 NM/h; 1 NM = 1/60 degree of latitude.
      const nmTraveled = (a.gs / 3600) * dtSec;
      const dDeg = nmTraveled / 60;
      const hdgRad = (a.track * Math.PI) / 180;
      lat = a.lat + dDeg * Math.cos(hdgRad);
      lon = a.lon + (dDeg * Math.sin(hdgRad)) / Math.cos((a.lat * Math.PI) / 180);
    }
    const squawk = a.squawk || '';
    features.push({
      type: 'Feature',
      properties: {
        hex: a.hex || null,
        label: describeLabel(a.flight),
        flight: a.flight || null,
        t: a.t || null,
        r: a.r || null,
        alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
        gs: typeof a.gs === 'number' ? a.gs : null,
        heading: typeof a.track === 'number' ? a.track : 0,
        on_ground: !!a.on_ground,
        squawk,
        emergency: squawk === '7500' || squawk === '7600' || squawk === '7700',
        size_class: classifyAircraftSize(a.t),
        color: aircraftColorFor(a.flight, !!a.on_ground, a.alt_baro),
        distM: typeof a._distM === 'number' ? a._distM : null,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}
