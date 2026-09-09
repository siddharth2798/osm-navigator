import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchFlightEntities } from '../lib/flight-search.js';

const AIRPORTS = [
  { icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'US', lat: 40.64, lon: -73.78, large: true },
  { icao: 'EGLL', iata: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'GB', lat: 51.47, lon: -0.46, large: true },
  { icao: 'VOBL', iata: 'BLR', name: 'Kempegowda International Airport', city: 'Bengaluru', country: 'IN', lat: 13.2, lon: 77.7, large: true },
];

const AIRCRAFT = [
  { hex: 'a1a1a1', flight: 'UAL123  ', r: 'N123AA', lat: 1, lon: 1 },
  { hex: 'b2b2b2', flight: 'BAW117  ', r: 'G-EMBY', lat: 2, lon: 2 },
  { hex: 'c3c3c3', flight: null, r: null, lat: 3, lon: 3 }, // no callsign/registration at all — must not throw
];

test('returns nothing for a query under 2 characters', () => {
  assert.deepEqual(searchFlightEntities('k', AIRPORTS, AIRCRAFT, 8), []);
  assert.deepEqual(searchFlightEntities('', AIRPORTS, AIRCRAFT, 8), []);
});

test('matches an airport by exact ICAO code (case-insensitive)', () => {
  const results = searchFlightEntities('kjfk', AIRPORTS, [], 8);
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'airport');
  assert.equal(results[0].icao, 'KJFK');
});

test('matches an airport by exact IATA code', () => {
  const results = searchFlightEntities('LHR', AIRPORTS, [], 8);
  assert.equal(results.length, 1);
  assert.equal(results[0].icao, 'EGLL');
});

test('matches an airport by name or city substring', () => {
  assert.equal(searchFlightEntities('kennedy', AIRPORTS, [], 8).length, 1);
  assert.equal(searchFlightEntities('bengaluru', AIRPORTS, [], 8).length, 1);
  assert.equal(searchFlightEntities('london', AIRPORTS, [], 8).length, 1);
});

test('matches an aircraft by callsign, registration, or hex substring', () => {
  assert.equal(searchFlightEntities('UAL123', [], AIRCRAFT, 8)[0].hex, 'a1a1a1');
  assert.equal(searchFlightEntities('G-EMBY', [], AIRCRAFT, 8)[0].hex, 'b2b2b2');
  assert.equal(searchFlightEntities('c3c3c3', [], AIRCRAFT, 8)[0].hex, 'c3c3c3'); // matched by hex even with no callsign/reg
});

test('airports rank before aircraft when both match', () => {
  const airports = [{ icao: 'AAAA', iata: 'UAL', name: 'United Airport', city: null, lat: 0, lon: 0 }];
  const aircraft = [{ hex: 'x', flight: 'UAL999', r: null, lat: 0, lon: 0 }];
  const results = searchFlightEntities('ual', airports, aircraft, 8);
  assert.equal(results.length, 2);
  assert.equal(results[0].kind, 'airport');
  assert.equal(results[1].kind, 'aircraft');
});

test('each kind is capped independently at maxResults', () => {
  const manyAirports = Array.from({ length: 20 }, (_, i) => ({ icao: `K${i}`, iata: null, name: `Test Airport ${i}`, city: null, lat: 0, lon: 0 }));
  const results = searchFlightEntities('test airport', manyAirports, [], 3);
  assert.equal(results.length, 3);
});

test('does not throw on aircraft with missing flight/registration/hex fields', () => {
  const sparse = [{ hex: null, flight: null, r: null, lat: 0, lon: 0 }];
  assert.doesNotThrow(() => searchFlightEntities('anything', [], sparse, 8));
  assert.deepEqual(searchFlightEntities('anything', [], sparse, 8), []);
});

test('gracefully handles null/undefined airports or aircraft arrays', () => {
  assert.doesNotThrow(() => searchFlightEntities('jfk', null, undefined, 8));
  assert.deepEqual(searchFlightEntities('jfk', null, undefined, 8), []);
});
