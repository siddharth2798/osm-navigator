import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSpotsRequest, keywordSecretName, SPOT_API_LIMITS } from '../lib/spots-api.js';
import { hashKeyword } from '../lib/collections.js';
import { createTestD1 } from './helpers/d1-sqlite.mjs';

const KEY = 'secret eats';
const NOW = Date.UTC(2026, 9, 18, 12);
const CATEGORIES = [{ id: 'street-food', label: 'Street food', emoji: '🌮' }, { id: 'cafe', label: 'Café', emoji: '☕' }];

// The keyword is a Worker secret, not a database column: SPOT_KEYWORD_<ID>.
function setup(extraEnv = {}) {
  const DB = createTestD1();
  DB.raw.prepare(
    'INSERT INTO collections (id, title, icon, color, categories_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('food', 'Secret eats', '🍜', '#e8590c', JSON.stringify(CATEGORIES), NOW);
  return { DB, SPOT_KEYWORD_FOOD: KEY, ...extraEnv };
}

function call(env, method, path, { body, key = KEY, ip = '1.1.1.1', headers = {}, now = NOW } = {}) {
  const init = { method, headers: { 'cf-connecting-ip': ip, ...headers } };
  if (key) init.headers['x-collection-key'] = key;
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return handleSpotsRequest(new Request(`https://example.com${path}`, init), env, now);
}

const draft = (over = {}) => ({ name: 'Chai Corner', lat: 9.97, lon: 76.28, category: 'cafe', note: 'Masala chai', ...over });
const createSpot = (env, over, opts) => call(env, 'POST', '/api/spots?c=food', { body: draft(over), ...opts });

test('returns 501 when no D1 binding exists, even for preflight-free requests', async () => {
  const res = await handleSpotsRequest(new Request('https://example.com/api/spots/manifest'), {}, NOW);
  assert.equal(res.status, 501);
});

test('OPTIONS answers CORS preflight with 204 before anything else', async () => {
  const res = await handleSpotsRequest(new Request('https://example.com/api/spots', { method: 'OPTIONS' }), {}, NOW);
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-headers'), /x-collection-key/);
});

test('manifest exposes only id, salt and hash — no titles, categories or spots', async () => {
  const env = setup();
  await createSpot(env);
  const res = await call(env, 'GET', '/api/spots/manifest', { key: null });
  assert.equal(res.status, 200);
  const { collections } = await res.json();
  assert.deepEqual(Object.keys(collections[0]).sort(), ['hash', 'id', 'salt']);
  assert.equal(collections[0].hash, await hashKeyword(KEY, collections[0].salt));
  assert.ok(!JSON.stringify(collections).includes(KEY), 'the plaintext keyword must never appear in the manifest');
});

test('changing the keyword secret rotates the manifest and locks out the old keyword', async () => {
  const env = setup();
  const before = (await (await call(env, 'GET', '/api/spots/manifest', { key: null })).json()).collections[0];
  assert.equal((await call(env, 'GET', '/api/spots/collection?c=food', { key: KEY })).status, 200);

  env.SPOT_KEYWORD_FOOD = 'brand new phrase';
  const after = (await (await call(env, 'GET', '/api/spots/manifest', { key: null })).json()).collections[0];
  assert.notEqual(after.hash, before.hash);
  assert.equal(after.hash, await hashKeyword('Brand  New Phrase', after.salt));
  assert.equal((await call(env, 'GET', '/api/spots/collection?c=food', { key: KEY })).status, 401);
  assert.equal((await call(env, 'GET', '/api/spots?c=food&bbox=76.2,9.9,76.3,10.0', { key: KEY })).status, 401);
  assert.equal((await call(env, 'GET', '/api/spots/collection?c=food', { key: 'brand new phrase' })).status, 200);
});

test('a collection with no keyword secret (or a too-short one) is disabled and hidden from the manifest', async () => {
  for (const secret of [undefined, '', '  ', 'ab']) {
    const env = setup({ SPOT_KEYWORD_FOOD: secret });
    const { collections } = await (await call(env, 'GET', '/api/spots/manifest', { key: null })).json();
    assert.deepEqual(collections, [], `secret ${JSON.stringify(secret)}`);
    assert.equal((await call(env, 'GET', '/api/spots/collection?c=food', { key: secret || KEY })).status, 401);
    assert.equal((await createSpot(env, {}, { key: secret || KEY })).status, 401);
  }
});

test('each collection id maps to its own secret name (SPOT_KEYWORD_<ID>)', async () => {
  assert.equal(keywordSecretName('food'), 'SPOT_KEYWORD_FOOD');
  assert.equal(keywordSecretName('hidden-views'), 'SPOT_KEYWORD_HIDDEN_VIEWS');
});

test('SPOT_SALT, when set, changes the published salt but not who can unlock', async () => {
  const env = setup({ SPOT_SALT: 'pepper' });
  const [entry] = (await (await call(env, 'GET', '/api/spots/manifest', { key: null })).json()).collections;
  assert.equal(entry.salt, 'pepper:food');
  assert.equal(entry.hash, await hashKeyword(KEY, 'pepper:food'));
  assert.equal((await call(env, 'GET', '/api/spots/collection?c=food')).status, 200);
});

test('collection details need the right key', async () => {
  const env = setup();
  assert.equal((await call(env, 'GET', '/api/spots/collection?c=food', { key: null })).status, 401);
  assert.equal((await call(env, 'GET', '/api/spots/collection?c=food', { key: 'nope' })).status, 401);
  assert.equal((await call(env, 'GET', '/api/spots/collection?c=missing')).status, 401);
  const ok = await call(env, 'GET', '/api/spots/collection?c=food', { key: '  Secret   EATS ' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.title, 'Secret eats');
  assert.deepEqual(body.categories, CATEGORIES);
  assert.equal('keyword_hash' in body, false);
});

test('create then list returns the spot inside the bbox only, without private fields', async () => {
  const env = setup();
  const created = await createSpot(env);
  assert.equal(created.status, 201);

  const inside = await call(env, 'GET', '/api/spots?c=food&bbox=76.2,9.9,76.3,10.0');
  const { spots } = await inside.json();
  assert.equal(spots.length, 1);
  assert.equal(spots[0].name, 'Chai Corner');
  assert.equal('author_hash' in spots[0], false);
  assert.equal('status' in spots[0], false);

  const outside = await call(env, 'GET', '/api/spots?c=food&bbox=77.0,9.9,77.1,10.0');
  assert.deepEqual((await outside.json()).spots, []);
});

test('list and create reject a wrong key, and list rejects a bad bbox', async () => {
  const env = setup();
  assert.equal((await call(env, 'GET', '/api/spots?c=food&bbox=76.2,9.9,76.3,10.0', { key: 'wrong' })).status, 401);
  assert.equal((await createSpot(env, {}, { key: 'wrong' })).status, 401);
  assert.equal((await call(env, 'GET', '/api/spots?c=food&bbox=nonsense')).status, 400);
  assert.equal((await call(env, 'GET', '/api/spots?c=food&bbox=-200,0,50,50')).status, 400); // outside the world
  assert.equal((await call(env, 'GET', '/api/spots?c=food&bbox=76.3,9.9,76.2,10.0')).status, 400); // inverted
});

// Spots in four different cities, so a country-wide box and nearest-first ranking can be exercised for real.
const CITIES = [
  ['Mangaluru Spot', 12.8864, 74.8384], ['Kochi Spot', 9.9670, 76.2432],
  ['Kozhikode Spot', 11.2517, 75.7792], ['Delhi Spot', 28.5338, 77.2089],
];
async function seedCities(env) {
  for (const [name, lat, lon] of CITIES) {
    const res = await call(env, 'POST', '/api/spots?c=food', { body: draft({ name, lat, lon }), ip: `10.0.0.${name.length}` });
    assert.equal(res.status, 201, name);
  }
}

test('a country-wide or world-wide box is accepted and returns every spot inside it', async () => {
  const env = setup();
  await seedCities(env);
  const india = await (await call(env, 'GET', '/api/spots?c=food&bbox=68,6,98,36')).json();
  assert.deepEqual(india.spots.map((s) => s.name).sort(), CITIES.map((c) => c[0]).sort());
  assert.equal(india.truncated, false);
  const world = await call(env, 'GET', '/api/spots?c=food&bbox=-180,-90,180,90');
  assert.equal(world.status, 200);
  assert.equal((await world.json()).spots.length, 4);
});

test('near=lat,lon returns nearest first, so a truncated result keeps the closest spots', async () => {
  const env = setup();
  await seedCities(env);
  const fromKochi = '/api/spots?c=food&bbox=-180,-90,180,90&near=9.97,76.24';
  const ranked = await (await call(env, 'GET', fromKochi)).json();
  assert.deepEqual(ranked.spots.map((s) => s.name), ['Kochi Spot', 'Kozhikode Spot', 'Mangaluru Spot', 'Delhi Spot']);

  const capped = await (await call(env, 'GET', `${fromKochi}&limit=2`)).json();
  assert.deepEqual(capped.spots.map((s) => s.name), ['Kochi Spot', 'Kozhikode Spot']);
  assert.equal(capped.truncated, true);

  assert.equal((await call(env, 'GET', '/api/spots?c=food&bbox=-180,-90,180,90&near=nonsense')).status, 400);
  assert.equal((await call(env, 'GET', '/api/spots?c=food&bbox=-180,-90,180,90&near=95,0')).status, 400);
});

test('create validates input, unknown categories and oversize or malformed bodies', async () => {
  const env = setup();
  assert.equal((await createSpot(env, { name: '' })).status, 400);
  assert.equal((await createSpot(env, { category: 'sushi' })).status, 400);
  assert.equal((await createSpot(env, { url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call(env, 'POST', '/api/spots?c=food', { body: 'not json' })).status, 400);
  assert.equal((await call(env, 'POST', '/api/spots?c=food', { body: { ...draft(), note: 'x'.repeat(5000) } })).status, 400);
});

test('create stores HTML-looking text verbatim as data (escaping is the client\'s job)', async () => {
  const env = setup();
  const res = await createSpot(env, { note: '<img src=x onerror=alert(1)>' });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).spot.note, '<img src=x onerror=alert(1)>');
});

test('create rejects a near-identical spot but allows the same name elsewhere', async () => {
  const env = setup();
  assert.equal((await createSpot(env)).status, 201);
  assert.equal((await createSpot(env, { name: 'chai corner', lat: 9.97001 }, { ip: '2.2.2.2' })).status, 409);
  assert.equal((await createSpot(env, { lat: 10.5 }, { ip: '3.3.3.3' })).status, 201);
});

test('create is rate limited per client per day, and a new day resets it', async () => {
  const env = setup();
  for (let i = 0; i < SPOT_API_LIMITS.CREATES_PER_DAY; i++) {
    const res = await createSpot(env, { name: `Spot ${i}`, lat: 9 + i * 0.01 });
    assert.equal(res.status, 201, `create #${i}`);
  }
  assert.equal((await createSpot(env, { name: 'One too many', lat: 12 })).status, 429);
  // A different client is unaffected.
  assert.equal((await createSpot(env, { name: 'Other client', lat: 12.5 }, { ip: '9.9.9.9' })).status, 201);
  // Next day: the hash rotates, so the same IP starts fresh.
  assert.equal((await createSpot(env, { name: 'Tomorrow', lat: 13 }, { now: NOW + 25 * 3600 * 1000 })).status, 201);
});

test('reports are one per client per spot, and enough reports hide the spot', async () => {
  const env = setup();
  const { spot } = await (await createSpot(env)).json();
  const report = (ip) => call(env, 'POST', `/api/spots/${spot.id}/report`, { ip });

  assert.equal((await report('1.0.0.1')).status, 200);
  assert.equal((await report('1.0.0.1')).status, 200); // duplicate from the same client is ignored
  assert.equal(env.DB.raw.prepare('SELECT report_count AS n FROM spots WHERE id = ?').get(spot.id).n, 1);

  assert.equal((await (await report('1.0.0.2')).json()).hidden, false);
  assert.equal((await (await report('1.0.0.3')).json()).hidden, true);

  const list = await call(env, 'GET', '/api/spots?c=food&bbox=76.2,9.9,76.3,10.0');
  assert.deepEqual((await list.json()).spots, []);
});

test('report needs the key and an existing spot', async () => {
  const env = setup();
  const { spot } = await (await createSpot(env)).json();
  assert.equal((await call(env, 'POST', `/api/spots/${spot.id}/report`, { key: 'wrong' })).status, 401);
  assert.equal((await call(env, 'POST', '/api/spots/does-not-exist/report')).status, 404);
});

test('moderation is disabled without ADMIN_TOKEN and refused with the wrong one', async () => {
  const noAdmin = setup();
  const { spot } = await (await createSpot(noAdmin)).json();
  assert.equal((await call(noAdmin, 'DELETE', `/api/spots/${spot.id}`, { headers: { authorization: 'Bearer x' } })).status, 501);

  const env = setup({ ADMIN_TOKEN: 'owner-token' });
  const created = await (await createSpot(env)).json();
  assert.equal((await call(env, 'DELETE', `/api/spots/${created.spot.id}`)).status, 401);
  assert.equal((await call(env, 'DELETE', `/api/spots/${created.spot.id}`, { headers: { authorization: 'Bearer nope' } })).status, 401);
});

test('admin can hide, restore (clearing reports) and delete a spot', async () => {
  const env = setup({ ADMIN_TOKEN: 'owner-token' });
  const auth = { authorization: 'Bearer owner-token' };
  const { spot } = await (await createSpot(env)).json();
  const listCount = async () => (await (await call(env, 'GET', '/api/spots?c=food&bbox=76.2,9.9,76.3,10.0')).json()).spots.length;

  assert.equal((await call(env, 'PATCH', `/api/spots/${spot.id}`, { body: { status: 'hidden' }, headers: auth })).status, 200);
  assert.equal(await listCount(), 0);

  await call(env, 'POST', `/api/spots/${spot.id}/report`, { ip: '5.5.5.5' });
  assert.equal((await call(env, 'PATCH', `/api/spots/${spot.id}`, { body: { status: 'active', note: 'Updated' }, headers: auth })).status, 200);
  assert.equal(await listCount(), 1);
  const row = env.DB.raw.prepare('SELECT note, report_count AS n FROM spots WHERE id = ?').get(spot.id);
  assert.deepEqual({ ...row }, { note: 'Updated', n: 0 });

  assert.equal((await call(env, 'PATCH', `/api/spots/${spot.id}`, { body: { status: 'bogus' }, headers: auth })).status, 400);
  assert.equal((await call(env, 'PATCH', '/api/spots/missing', { body: { status: 'hidden' }, headers: auth })).status, 404);

  assert.equal((await call(env, 'DELETE', `/api/spots/${spot.id}`, { headers: auth })).status, 200);
  assert.equal(await listCount(), 0);
});

test('owner bulk import adds valid spots, reports bad and duplicate ones, and ignores the public rate limit', async () => {
  const env = setup({ ADMIN_TOKEN: 'owner-token' });
  const auth = { authorization: 'Bearer owner-token' };
  const spots = [
    draft({ name: 'One', lat: 9.1 }),
    draft({ name: 'Two', lat: 9.2, category: 'sushi' }), // unknown category
    draft({ name: 'One', lat: 9.1 }),                    // duplicate of the first, within the same request
    draft({ name: 'Three', lat: 9.3, note: '<b>hi</b>' }),
  ];
  const res = await call(env, 'POST', '/api/spots/import?c=food', { body: { spots }, headers: auth, key: null });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.created, 2);
  assert.deepEqual(body.skipped.map((s) => s.index), [1, 2]);
  assert.match(body.skipped[0].reason, /type/i);
  assert.match(body.skipped[1].reason, /exists/i);

  // Bulk-imported spots are visible through the normal, key-protected list.
  const list = await (await call(env, 'GET', '/api/spots?c=food&bbox=76.2,9.0,76.3,9.5')).json();
  assert.deepEqual(list.spots.map((s) => s.name).sort(), ['One', 'Three']);

  // More than the public per-day limit in one go is fine for the owner.
  const many = Array.from({ length: 50 }, (_, i) => draft({ name: `Bulk ${i}`, lat: 11 + i * 0.01 }));
  const big = await (await call(env, 'POST', '/api/spots/import?c=food', { body: { spots: many }, headers: auth, key: null })).json();
  assert.equal(big.created, 50);
});

test('owner bulk import is refused without the admin token, for unknown collections and for bad bodies', async () => {
  const env = setup({ ADMIN_TOKEN: 'owner-token' });
  const auth = { authorization: 'Bearer owner-token' };
  const body = { spots: [draft()] };
  assert.equal((await call(env, 'POST', '/api/spots/import?c=food', { body, key: null })).status, 401);
  // The collection key alone is not enough: that is a shared, public-ish credential.
  assert.equal((await call(env, 'POST', '/api/spots/import?c=food', { body })).status, 401);
  assert.equal((await call(env, 'POST', '/api/spots/import?c=nope', { body, headers: auth, key: null })).status, 404);
  assert.equal((await call(env, 'POST', '/api/spots/import?c=food', { body: { spots: [] }, headers: auth, key: null })).status, 400);
  assert.equal((await call(env, 'POST', '/api/spots/import?c=food', { body: { nope: 1 }, headers: auth, key: null })).status, 400);
  const tooMany = { spots: Array.from({ length: SPOT_API_LIMITS.IMPORT_MAX_SPOTS + 1 }, (_, i) => draft({ name: `n${i}` })) };
  assert.equal((await call(env, 'POST', '/api/spots/import?c=food', { body: tooMany, headers: auth, key: null })).status, 400);
  assert.equal((await call(env, 'GET', '/api/spots/import?c=food', { headers: auth })).status, 405);
  const noAdmin = setup();
  assert.equal((await call(noAdmin, 'POST', '/api/spots/import?c=food', { body, headers: auth, key: null })).status, 501);
});

test('unknown paths and wrong methods are rejected cleanly', async () => {
  const env = setup();
  assert.equal((await call(env, 'GET', '/api/spots/unknown/thing/else')).status, 404);
  assert.equal((await call(env, 'PUT', '/api/spots')).status, 405);
  assert.equal((await call(env, 'POST', '/api/spots/manifest')).status, 405);
});
