import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAircraftSize, boostFlightColorForDark, aircraftColorFor,
  drCapSecFor, buildDRFeatureCollection, FLIGHT_AIRLINE_COLORS,
} from '../lib/flight-render-utils.js';

test('classifyAircraftSize buckets known ICAO type codes correctly', () => {
  assert.equal(classifyAircraftSize('B744'), 'xl'); // 747
  assert.equal(classifyAircraftSize('A388'), 'xl'); // A380
  assert.equal(classifyAircraftSize('B77W'), 'lg'); // 777
  assert.equal(classifyAircraftSize('A320'), 'md');
  assert.equal(classifyAircraftSize('CRJ9'), 'sm');
  assert.equal(classifyAircraftSize('R66'), 'xs'); // helicopter
});

test('classifyAircraftSize falls back gracefully on missing/unknown type — never throws', () => {
  // OpenSky's /api/flights tier supplies no type field at all (see
  // lib/flights-proxy.js) — this must degrade, not crash.
  assert.equal(classifyAircraftSize(null), 'xs');
  assert.equal(classifyAircraftSize(undefined), 'xs');
  assert.equal(classifyAircraftSize(''), 'xs');
  assert.equal(classifyAircraftSize('ZZZZ'), 'md'); // unknown but long enough
  assert.equal(classifyAircraftSize('zz'), 'xs'); // unknown and short
});

test('boostFlightColorForDark leaves an already-bright color untouched', () => {
  assert.equal(boostFlightColorForDark('#B9D6F2'), '#B9D6F2'); // AAL — already light
});

test('boostFlightColorForDark brightens a too-dark color while roughly preserving hue', () => {
  const boosted = boostFlightColorForDark('#05164D'); // DLH near-black navy — luminance ~0.09, well under the 0.18 floor
  assert.notEqual(boosted, '#05164D');
  const r = parseInt(boosted.slice(1, 3), 16);
  const g = parseInt(boosted.slice(3, 5), 16);
  const b = parseInt(boosted.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  assert.ok(lum >= 0.17, `expected boosted luminance >= ~0.18, got ${lum}`);
  // Blue should still be the dominant channel after boosting.
  assert.ok(b >= r && b >= g);
});

test('aircraftColorFor: on-ground always returns the grey regardless of callsign/altitude', () => {
  assert.equal(aircraftColorFor('UAL123', true, 35000), '#64748b');
});

test('aircraftColorFor: known airline prefix wins over the altitude gradient', () => {
  assert.equal(aircraftColorFor('AAL456', false, 100), '#B9D6F2');
});

test('aircraftColorFor: unknown callsign falls back to the altitude gradient', () => {
  assert.equal(aircraftColorFor('ZZZ999', false, 3000), '#4ade80');
  assert.equal(aircraftColorFor('ZZZ999', false, 10000), '#22d3ee');
  assert.equal(aircraftColorFor('ZZZ999', false, 20000), '#60a5fa');
  assert.equal(aircraftColorFor('ZZZ999', false, 35000), '#a78bfa');
});

test('aircraftColorFor: missing callsign/altitude degrades to the lowest gradient band, never throws', () => {
  assert.equal(aircraftColorFor(null, false, null), '#4ade80');
  assert.equal(aircraftColorFor(undefined, false, undefined), '#4ade80');
});

test('drCapSecFor tiers by altitude, with 0/missing treated as the least aggressive cap', () => {
  assert.equal(drCapSecFor(1000), 15);
  assert.equal(drCapSecFor(5000), 20);
  assert.equal(drCapSecFor(20000), 30);
  assert.equal(drCapSecFor(0), 30);
  assert.equal(drCapSecFor(null), 30);
});

test('buildDRFeatureCollection extrapolates an airborne aircraft forward along its heading', () => {
  const cache = new Map([
    ['abc123', { a: { hex: 'abc123', flight: 'ZZZ123', lat: 40.0, lon: -73.0, alt_baro: 30000, track: 90, gs: 500, on_ground: false }, atMs: 1000 }],
  ]);
  const fc = buildDRFeatureCollection(cache, 1000 + 10000); // 10s later
  assert.equal(fc.features.length, 1);
  const [feat] = fc.features;
  // Heading 90 (due east) => longitude should increase, latitude ~unchanged.
  assert.ok(feat.geometry.coordinates[0] > -73.0, 'longitude should have advanced eastward');
  assert.ok(Math.abs(feat.geometry.coordinates[1] - 40.0) < 0.01, 'latitude should barely move heading due east');
  assert.equal(feat.properties.size_class, 'xs'); // t is absent -> empty-string fallback, length 0 < 3 -> 'xs'
  assert.equal(feat.properties.color, '#a78bfa'); // unknown callsign prefix, 30000ft -> purple band
  assert.equal(feat.properties.emergency, false);
});

test('buildDRFeatureCollection does not extrapolate a stationary/on-ground aircraft', () => {
  const cache = new Map([
    ['gnd001', { a: { hex: 'gnd001', flight: 'GND1', lat: 40.0, lon: -73.0, alt_baro: null, track: 0, gs: 0, on_ground: true }, atMs: 1000 }],
  ]);
  const fc = buildDRFeatureCollection(cache, 1000 + 10000);
  const [feat] = fc.features;
  assert.deepEqual(feat.geometry.coordinates, [-73.0, 40.0]);
  assert.equal(feat.properties.on_ground, true);
  assert.equal(feat.properties.color, '#64748b');
});

test('buildDRFeatureCollection caps extrapolation distance by drCapSecFor, not raw elapsed time', () => {
  const cache = new Map([
    ['far001', { a: { hex: 'far001', flight: 'XYZ1', lat: 0, lon: 0, alt_baro: 1000, track: 90, gs: 500, on_ground: false }, atMs: 0 }],
  ]);
  const cappedAt15s = buildDRFeatureCollection(cache, 15000).features[0].geometry.coordinates;
  const wayLater = buildDRFeatureCollection(cache, 10 * 60 * 1000).features[0].geometry.coordinates; // 10 minutes later — should extrapolate no further than the 15s cap (low altitude)
  assert.ok(Math.abs(cappedAt15s[0] - wayLater[0]) < 1e-9, 'extrapolation beyond the drCapSecFor cap should not advance further');
});

test('buildDRFeatureCollection flags 7500/7600/7700 squawks as emergency, others not', () => {
  const cache = new Map([
    ['e1', { a: { hex: 'e1', flight: 'SOS1', lat: 1, lon: 1, squawk: '7700', on_ground: false }, atMs: 0 }],
    ['e2', { a: { hex: 'e2', flight: 'OK1', lat: 2, lon: 2, squawk: '2200', on_ground: false }, atMs: 0 }],
    ['e3', { a: { hex: 'e3', flight: 'OK2', lat: 3, lon: 3, on_ground: false }, atMs: 0 }], // no squawk at all (OpenSky gap)
  ]);
  const fc = buildDRFeatureCollection(cache, 0);
  const byHex = Object.fromEntries(fc.features.map((f) => [f.properties.hex, f.properties]));
  assert.equal(byHex.e1.emergency, true);
  assert.equal(byHex.e2.emergency, false);
  assert.equal(byHex.e3.emergency, false);
});

test('buildDRFeatureCollection skips entries without valid lat/lon rather than throwing', () => {
  const cache = new Map([
    ['bad', { a: { hex: 'bad', flight: 'NOPOS', lat: null, lon: undefined }, atMs: 0 }],
  ]);
  const fc = buildDRFeatureCollection(cache, 1000);
  assert.equal(fc.features.length, 0);
});

test('buildDRFeatureCollection uses the injected describeLabel for the label property', () => {
  const cache = new Map([
    ['lbl', { a: { hex: 'lbl', flight: 'UAL123  ', lat: 1, lon: 1, on_ground: false }, atMs: 0 }],
  ]);
  const fc = buildDRFeatureCollection(cache, 0, (flight) => `custom:${flight.trim()}`);
  assert.equal(fc.features[0].properties.label, 'custom:UAL123');
});

test('buildDRFeatureCollection defaults describeLabel to the raw flight string when not provided', () => {
  const cache = new Map([
    ['lbl2', { a: { hex: 'lbl2', flight: 'BAW1', lat: 1, lon: 1, on_ground: false }, atMs: 0 }],
  ]);
  const fc = buildDRFeatureCollection(cache, 0);
  assert.equal(fc.features[0].properties.label, 'BAW1');
});

test('FLIGHT_AIRLINE_COLORS is a non-empty map of 3-letter prefixes to hex colors', () => {
  assert.ok(Object.keys(FLIGHT_AIRLINE_COLORS).length > 50);
  for (const [prefix, hex] of Object.entries(FLIGHT_AIRLINE_COLORS)) {
    assert.match(prefix, /^[A-Z]{3}$/);
    assert.match(hex, /^#[0-9A-Fa-f]{6}$/);
  }
});
