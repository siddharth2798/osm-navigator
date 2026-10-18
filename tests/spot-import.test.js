import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkLines, resolveImportEntry } from '../lib/spot-import.js';

const LONG_LINK = 'https://www.google.com/maps/place/Dhe+Puttu/@9.9669,76.2431,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d9.9668123!4d76.2430456';

test('parseLinkLines skips blanks and comments and splits link | category | note', () => {
  const entries = parseLinkLines(`
# my list
${LONG_LINK} | restaurant | Go early | before 1pm

https://maps.app.goo.gl/abc123
`, 'cafe');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { maps: LONG_LINK, category: 'restaurant', note: 'Go early | before 1pm' });
  assert.deepEqual(entries[1], { maps: 'https://maps.app.goo.gl/abc123', category: 'cafe', note: '' });
});

test('an entry with lat/lon is used as given, and needs a name', async () => {
  const ok = await resolveImportEntry({ name: 'A', lat: '9.9', lon: 76.2, category: 'cafe', note: 'n' });
  assert.deepEqual(ok.draft, { name: 'A', lat: 9.9, lon: 76.2, category: 'cafe', note: 'n', url: '' });
  assert.match((await resolveImportEntry({ lat: 1, lon: 2 })).error, /name/);
});

test('a long Google Maps link yields precise coordinates and the place name', async () => {
  const { draft } = await resolveImportEntry({ maps: LONG_LINK, category: 'restaurant' });
  assert.equal(draft.name, 'Dhe Puttu');
  assert.equal(draft.lat, 9.9668123);
  assert.equal(draft.lon, 76.2430456);
});

test('an explicit name overrides the one in the link', async () => {
  const { draft } = await resolveImportEntry({ maps: LONG_LINK, name: 'Best puttu', category: 'restaurant' });
  assert.equal(draft.name, 'Best puttu');
});

test('a short link is followed to find the coordinates', async () => {
  let asked = null;
  const { draft, error } = await resolveImportEntry(
    { maps: 'https://maps.app.goo.gl/abc123', category: 'cafe' },
    { followRedirect: async (url) => { asked = url; return LONG_LINK; } },
  );
  assert.equal(error, undefined);
  assert.equal(asked, 'https://maps.app.goo.gl/abc123');
  assert.equal(draft.name, 'Dhe Puttu');
});

test('unresolvable entries come back as errors, not exceptions', async () => {
  assert.match((await resolveImportEntry({ maps: 'https://example.com/x' })).error, /Not a Google Maps link/);
  assert.match((await resolveImportEntry({})).error, /lat\/lon or a Google Maps link/);
  assert.match((await resolveImportEntry({ maps: 'https://maps.app.goo.gl/abc123' }, { followRedirect: async () => 'https://maps.app.goo.gl/abc123' })).error, /No coordinates/);
  assert.match((await resolveImportEntry({ maps: 'https://maps.app.goo.gl/abc123' }, { followRedirect: async () => { throw new Error('offline'); } })).error, /offline/);
  assert.match((await resolveImportEntry({ maps: 'https://www.google.com/maps/@9.9,76.2,15z' })).error, /place name/);
});
