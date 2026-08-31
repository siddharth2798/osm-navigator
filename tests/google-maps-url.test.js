import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleMapsUrl, GOOGLE_MAPS_HOSTS } from '../lib/google-maps-url.js';

test('returns null for non-Google-Maps URLs and plain text', () => {
  assert.equal(parseGoogleMapsUrl('https://example.com/maps/place/Somewhere'), null);
  assert.equal(parseGoogleMapsUrl('just some random text, not a url'), null);
  assert.equal(parseGoogleMapsUrl('https://www.google.com/search?q=cafe'), null); // google.com host but no /maps path
});

test('a short maps.app.goo.gl link with no coordinates yet returns matchedUrl only', () => {
  const result = parseGoogleMapsUrl('https://maps.app.goo.gl/abc123XYZ');
  assert.deepEqual(result, { matchedUrl: 'https://maps.app.goo.gl/abc123XYZ' });
});

test('a /maps/place/ URL with a precise !3d/!4d pin is preferred over the @lat,lng viewport center', () => {
  const url = 'https://www.google.com/maps/place/Lulu+Mall/@10.0261,76.3086,15z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d10.0270!4d76.3081';
  const result = parseGoogleMapsUrl(url);
  assert.equal(result.lat, 10.0270);
  assert.equal(result.lon, 76.3081);
  assert.equal(result.name, 'Lulu Mall');
  assert.equal(result.matchedUrl, url);
});

test('falls back to the @lat,lng viewport center when no !3d/!4d pin is present', () => {
  const url = 'https://www.google.com/maps/place/Some+Place/@10.0261,76.3086,15z';
  const result = parseGoogleMapsUrl(url);
  assert.equal(result.lat, 10.0261);
  assert.equal(result.lon, 76.3086);
  assert.equal(result.name, 'Some Place');
});

test('a plain ?q= search link with no place path yields a name-only result', () => {
  const url = 'https://www.google.com/maps?q=Cafe+UUTOPIA';
  const result = parseGoogleMapsUrl(url);
  assert.deepEqual(result, { name: 'Cafe UUTOPIA', matchedUrl: url });
});

test('finds a URL embedded inside a larger pasted blob (Google Share text)', () => {
  const blob = 'Cafe UUTOPIA ft. Toddy\nhttps://maps.app.goo.gl/abc123XYZ\nCheck it out!';
  const result = parseGoogleMapsUrl(blob);
  assert.equal(result.matchedUrl, 'https://maps.app.goo.gl/abc123XYZ');
});

test('!3d/!4d coordinates are matched against the whole original blob, not just the isolated URL', () => {
  const blob = 'Some place !3d10.5!4d76.25\nhttps://maps.app.goo.gl/abc123XYZ';
  const result = parseGoogleMapsUrl(blob);
  assert.equal(result.lat, 10.5);
  assert.equal(result.lon, 76.25);
});

test('GOOGLE_MAPS_HOSTS contains exactly the expected set of hostnames', () => {
  assert.deepEqual([...GOOGLE_MAPS_HOSTS].sort(), ['goo.gl', 'google.com', 'maps.app.goo.gl', 'maps.google.com', 'www.google.com'].sort());
});
