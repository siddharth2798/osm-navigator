import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpots } from '../spots.js';
import { handleSpotsRequest } from '../lib/spots-api.js';
import { createTestD1 } from './helpers/d1-sqlite.mjs';

// spots.js wires its static buttons at construction, so give it a DOM-shaped stub; the car path never touches the
// DOM again. Requests go to the real API handler over a real (SQLite) database rather than a mock.
function stubDom() {
  const element = () => ({
    addEventListener() {}, style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  globalThis.document = { getElementById: element };
}

const KEY = 'secret eats';
const CAR = [76.2431, 9.9669]; // lon, lat
const SPOTS = [
  ['Far Cafe', 9.9900, 76.2800],
  ['Near Puttu', 9.9670, 76.2432],
  ['Mid Chai', 9.9700, 76.2500],
  ['Out Of Range', 12.5, 79.0],
  ['Marine Drive Corn', 9.9814, 76.2760],
];

function setup({ live = CAR, places = {} } = {}) {
  stubDom();
  const DB = createTestD1();
  DB.raw.prepare('INSERT INTO collections (id, title, icon, color, categories_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('food', 'Secret eats', '🍜', '#e8590c', JSON.stringify([{ id: 'cafe', label: 'Café', emoji: '☕' }]), 0);
  SPOTS.forEach(([name, lat, lon], i) => DB.raw.prepare(
    `INSERT INTO spots (id, collection_id, name, lat, lon, category, note, url, created_at, updated_at, author_hash)
     VALUES (?, 'food', ?, ?, ?, 'cafe', '', '', 0, 0, 'seed')`,
  ).run(`s${i}`, name, lat, lon));
  const env = { DB, SPOT_KEYWORD_FOOD: KEY };
  const requests = [];
  const noop = () => {};
  const spots = createSpots({
    map: {}, awaitMapLoad: async () => {}, showStatus: noop, pushBackLayer: noop, forgetBackLayerIfTop: noop,
    goBackInApp: noop, isNativePlatform: () => false, showSuggestionList: noop, hideSuggestionList: noop,
    openDirectionsTo: noop, saveToFavorites: noop, createPinElement: noop, resolveCurrentLocationAnchor: async () => { throw new Error('no gps'); },
    currentLiveLngLat: () => live,
    geocodePlace: async (text) => places[text] || null,
    fetchWithTimeout: async (path, init) => {
      requests.push(path);
      return handleSpotsRequest(new Request(`https://example.com${path}`, init), env, 0);
    },
  });
  return { spots, requests };
}

test('a normal place query is not handled (null), and makes no spots-API call beyond the manifest', async () => {
  const { spots, requests } = setup();
  assert.equal(await spots.nearestForCar('pizza near me'), null);
  assert.equal(await spots.nearestForCar('ab'), null);
  assert.ok(requests.every((p) => p === '/api/spots/manifest'), `unexpected calls: ${requests}`);
});

test('the keyword lists the nearest spots first, as navigable results, within range only', async () => {
  const { spots } = setup();
  const results = await spots.nearestForCar('Secret Eats');
  assert.deepEqual(results.map((r) => r.label), ['Near Puttu', 'Mid Chai', 'Marine Drive Corn', 'Far Cafe']);
  assert.ok(results.every((r) => typeof r.lat === 'number' && typeof r.lon === 'number' && r.distanceM >= 0));
  assert.ok(results[0].distanceM < results[1].distanceM);
  assert.ok(!results.some((r) => r.label === 'Out Of Range'));
});

test('results are capped to what the car host will show', async () => {
  const { spots } = setup();
  assert.equal((await spots.nearestForCar('secret eats', 2)).length, 2);
  assert.equal((await spots.nearestForCar('secret eats')).length, 4); // < the default cap of 6
});

test('"<keyword> near <place>" ranks and measures from that place, not from the car', async () => {
  const { spots } = setup({ places: { 'Marine Drive': { lat: 9.9814, lon: 76.2760 } } });
  const results = await spots.nearestForCar('secret eats near Marine Drive');
  assert.equal(results[0].label, 'Marine Drive Corn');
  assert.ok(results[0].distanceM < 50, `closest spot should be at the named place, got ${results[0].distanceM} m`);
  // Even capped to one result, the answer is the spot at the named place — not whatever is nearest the car.
  const [only] = await spots.nearestForCar('secret eats near Marine Drive', 1);
  assert.equal(only.label, 'Marine Drive Corn');
});

test('an unknown place falls back to the car, and no location at all is an empty list, not a keyword search', async () => {
  const { spots } = setup({ places: {} });
  assert.equal((await spots.nearestForCar('secret eats near Atlantis'))[0].label, 'Near Puttu');
  const lost = setup({ live: null });
  assert.deepEqual(await lost.spots.nearestForCar('secret eats'), []);
});
