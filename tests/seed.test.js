import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { handleSpotsRequest } from '../lib/spots-api.js';
import { createTestD1 } from './helpers/d1-sqlite.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('migrations/ holds only real migrations — `wrangler d1 migrations apply` would run any other .sql file in it', () => {
  const files = readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql'));
  assert.deepEqual(files, ['0001_spots.sql']);
});

test('the example seed applies to the schema and becomes a working collection once its keyword secret is set', async () => {
  const DB = createTestD1();
  DB.raw.exec(read('../seeds/food.example.sql'));
  const row = DB.raw.prepare('SELECT id, title, categories_json FROM collections').get();
  assert.equal(row.id, 'food');
  assert.ok(JSON.parse(row.categories_json).length >= 3);

  const get = (env, path, key) => handleSpotsRequest(
    new Request(`https://example.com${path}`, { headers: key ? { 'x-collection-key': key } : {} }), env, 0,
  );

  // No keyword secret yet: the collection exists but is invisible and locked.
  assert.deepEqual((await (await get({ DB }, '/api/spots/manifest')).json()).collections, []);

  // With the secret set (what `wrangler secret put SPOT_KEYWORD_FOOD` does), it comes alive.
  const env = { DB, SPOT_KEYWORD_FOOD: 'my private phrase' };
  assert.equal((await (await get(env, '/api/spots/manifest')).json()).collections.length, 1);
  assert.equal((await get(env, '/api/spots/collection?c=food', 'My  Private PHRASE')).status, 200);
  assert.equal((await get(env, '/api/spots/collection?c=food', 'something else')).status, 401);
});
