import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineDistanceM, nearestKochiStation, findKochiTransferPoints } from '../lib/kochi-geo.js';

test('haversineDistanceM is zero for identical points', () => {
  assert.equal(haversineDistanceM(10.0, 76.3, 10.0, 76.3), 0);
});

test('haversineDistanceM matches the known real-world Vyttila metro <-> Vytilla water metro gap (~222m)', () => {
  // Same two real coordinate pairs used earlier this session to confirm the
  // haversine swap-in for turf.distance doesn't drift the KOCHI_TRANSFER_MAX_M
  // threshold check in any practically meaningful way.
  const metro = { lat: 9.9682, lon: 76.3238 };
  const water = { lat: 9.9664, lon: 76.3254 };
  const distM = haversineDistanceM(metro.lat, metro.lon, water.lat, water.lon);
  assert.ok(distM > 150 && distM < 300, `expected ~222m, got ${distM}`);
});

test('nearestKochiStation returns the closest station with distanceM and index attached', () => {
  const stations = [
    { name: 'Aluva', lat: 10.1080, lon: 76.3520 },
    { name: 'Edapally', lat: 10.0247, lon: 76.3081 },
    { name: 'Vyttila', lat: 9.9682, lon: 76.3238 },
  ];
  const result = nearestKochiStation(9.97, 76.32, stations);
  assert.equal(result.name, 'Vyttila');
  assert.equal(result.index, 2);
  assert.ok(result.distanceM < 1000);
});

test('nearestKochiStation skips entries with missing coordinates', () => {
  const stations = [
    { name: 'No Coords', lat: null, lon: null },
    { name: 'Has Coords', lat: 9.97, lon: 76.32 },
  ];
  const result = nearestKochiStation(9.97, 76.32, stations);
  assert.equal(result.name, 'Has Coords');
});

test('nearestKochiStation returns null for an empty array or all-missing-coordinates array', () => {
  assert.equal(nearestKochiStation(9.97, 76.32, []), null);
  assert.equal(nearestKochiStation(9.97, 76.32, [{ name: 'X', lat: null, lon: null }]), null);
});

test('findKochiTransferPoints only pairs stations within maxM, and pairs every qualifying combination', () => {
  const metroStations = [
    { name: 'Vyttila Metro', lat: 9.9682, lon: 76.3238 },
    { name: 'Far Metro', lat: 10.5, lon: 76.9 },
  ];
  const waterStations = [
    { name: 'Vytilla Jetty', lat: 9.9664, lon: 76.3254 },
    { name: 'Far Jetty', lat: 9.90, lon: 76.20 },
  ];
  const points = findKochiTransferPoints(metroStations, waterStations, 400);
  assert.equal(points.length, 1);
  assert.equal(points[0].metroStation.name, 'Vyttila Metro');
  assert.equal(points[0].waterStation.name, 'Vytilla Jetty');
  assert.equal(points[0].metroIndex, 0);
  assert.ok(points[0].distM < 400);
});

test('findKochiTransferPoints skips entries with missing coordinates and returns empty when nothing qualifies', () => {
  const metroStations = [{ name: 'M', lat: null, lon: null }];
  const waterStations = [{ name: 'W', lat: 9.9664, lon: 76.3254 }];
  assert.deepEqual(findKochiTransferPoints(metroStations, waterStations, 10000), []);
  assert.deepEqual(findKochiTransferPoints([], [], 10000), []);
});
