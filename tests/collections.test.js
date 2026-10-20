import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bboxAround, googleMapsSpotUrl, hashKeyword, haversineM, keywordCandidates, matchCollection,
  normalizeKeyword, parseBbox, parseLatLon, safeEqual, validateSpotDraft,
} from '../lib/collections.js';

const CATEGORIES = ['street-food', 'cafe'];

test('normalizeKeyword lowercases, trims and collapses whitespace', () => {
  assert.equal(normalizeKeyword('  Secret   EATS '), 'secret eats');
  assert.equal(normalizeKeyword(null), '');
});

test('hashKeyword is stable, normalised and salted', async () => {
  const a = await hashKeyword('Secret Eats', 'salt1');
  assert.equal(a, await hashKeyword('  secret   eats', 'salt1'));
  assert.notEqual(a, await hashKeyword('secret eats', 'salt2'));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('keywordCandidates offers the whole query and every "near" split', () => {
  assert.deepEqual(keywordCandidates('secret eats'), [{ keyword: 'secret eats', place: null }]);
  assert.deepEqual(keywordCandidates('secret eats near Fort Kochi'), [
    { keyword: 'secret eats near Fort Kochi', place: null },
    { keyword: 'secret eats', place: 'Fort Kochi' },
  ]);
  // A dangling "near" with no place is not a split.
  assert.equal(keywordCandidates('secret eats near ').length, 1);
});

test('matchCollection finds a keyword locally, with and without a place', async () => {
  const salt = 'abc';
  const manifest = [
    { id: 'other', salt: 'zzz', hash: await hashKeyword('hidden views', 'zzz') },
    { id: 'food', salt, hash: await hashKeyword('secret eats', salt) },
  ];
  assert.deepEqual(await matchCollection('Secret Eats', manifest), { id: 'food', keyword: 'secret eats', place: null });
  assert.deepEqual(await matchCollection('secret eats near Fort Kochi', manifest), { id: 'food', keyword: 'secret eats', place: 'Fort Kochi' });
  assert.equal(await matchCollection('pizza near me', manifest), null);
  assert.equal(await matchCollection('secret', manifest), null);
  assert.equal(await matchCollection('secret eats', []), null);
  assert.equal(await matchCollection('secret eats', undefined), null);
});

test('safeEqual compares strings and rejects non-strings / length mismatches', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual(null, 'abc'), false);
});

test('validateSpotDraft accepts a good draft and normalises it', () => {
  const result = validateSpotDraft(
    { name: '  Chai\u0000 Corner ', lat: '9.97', lon: 76.28, category: 'cafe', note: 'Try the\nmasala chai', url: 'https://example.com/x' },
    CATEGORIES,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    name: 'Chai Corner', lat: 9.97, lon: 76.28, category: 'cafe', note: 'Try the masala chai', url: 'https://example.com/x',
  });
});

test('validateSpotDraft rejects bad names, locations, categories, notes and links', () => {
  const ok = { name: 'A', lat: 1, lon: 1, category: 'cafe' };
  assert.equal(validateSpotDraft(null, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, name: '   ' }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, name: 'x'.repeat(81) }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, lat: 91 }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, lon: 'abc' }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, category: 'sushi' }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, note: 'x'.repeat(501) }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, url: 'javascript:alert(1)' }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft({ ...ok, url: 'ftp://example.com' }, CATEGORIES).ok, false);
  assert.equal(validateSpotDraft(ok, CATEGORIES).ok, true);
});

test('googleMapsSpotUrl encodes awkward names and points at Google Maps search', () => {
  const url = new URL(googleMapsSpotUrl('Tom & Jerry\'s #1 café', 9.9312, 76.2673));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), "Tom & Jerry's #1 café 9.931200,76.267300");
});

test('parseBbox accepts any box inside the world, and rejects malformed, inverted or out-of-range ones', () => {
  assert.deepEqual(parseBbox('76.2,9.9,76.3,10.0'), { w: 76.2, s: 9.9, e: 76.3, n: 10 });
  assert.deepEqual(parseBbox('68,6,98,36'), { w: 68, s: 6, e: 98, n: 36 }); // all of India
  assert.deepEqual(parseBbox('-180,-90,180,90'), { w: -180, s: -90, e: 180, n: 90 }); // the whole world
  assert.equal(parseBbox('76.3,9.9,76.2,10.0'), null);
  assert.equal(parseBbox('1,2,3'), null);
  assert.equal(parseBbox('a,b,c,d'), null);
  assert.equal(parseBbox('-181,0,0,1'), null);
  assert.equal(parseBbox('0,0,10,91'), null);
  assert.equal(parseBbox('0,0,10,10', 5), null); // a caller can still ask for a tighter cap
});

test('parseLatLon accepts "lat,lon" and rejects the rest', () => {
  assert.deepEqual(parseLatLon('12.87,74.84'), { lat: 12.87, lon: 74.84 });
  assert.equal(parseLatLon('12.87'), null);
  assert.equal(parseLatLon('a,b'), null);
  assert.equal(parseLatLon('91,0'), null);
  assert.equal(parseLatLon('0,181'), null);
  assert.equal(parseLatLon(null), null);
});

test('bboxAround builds a parseable box centred on the point', () => {
  const box = parseBbox(bboxAround(10, 76, 0.05));
  assert.deepEqual(box, { w: 75.95, s: 9.95, e: 76.05, n: 10.05 });
});

test('haversineM is ~0 for the same point and ~111 km per degree of latitude', () => {
  assert.equal(haversineM(10, 76, 10, 76), 0);
  assert.ok(Math.abs(haversineM(10, 76, 11, 76) - 111195) < 200);
});
