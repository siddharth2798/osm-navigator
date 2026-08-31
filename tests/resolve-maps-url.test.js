import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMapsUrl } from '../lib/resolve-maps-url.js';

// resolveMapsUrl calls the global fetch() directly (no injection point — it's
// a Cloudflare Worker module, not written for testability), so these tests
// swap globalThis.fetch out for the duration of each test and restore it
// afterwards, rather than changing the module itself.
function withMockedFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = original; });
}

test('rejects a request with no ?url= param', async () => {
  const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url'));
  assert.equal(res.status, 400);
});

test('rejects a ?url= that is not a valid URL at all', async () => {
  const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url?url=not%20a%20url'));
  assert.equal(res.status, 400);
});

test('rejects a ?url= host that is not on the allow-list, before ever calling fetch', async () => {
  let fetchCalled = false;
  await withMockedFetch(
    async () => { fetchCalled = true; throw new Error('should not be called'); },
    async () => {
      const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url?url=https://evil.example.com/steal'));
      assert.equal(res.status, 400);
    },
  );
  assert.equal(fetchCalled, false);
});

test('a legit redirect to an allow-listed host resolves successfully', async () => {
  await withMockedFetch(
    async () => ({ url: 'https://maps.google.com/maps/place/Somewhere/@10.0,76.3,15z' }),
    async () => {
      const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url?url=https://maps.app.goo.gl/abc123'));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.resolvedUrl, 'https://maps.google.com/maps/place/Somewhere/@10.0,76.3,15z');
    },
  );
});

test('a hijacked/repurposed short link redirecting off the allow-list is rejected with 502, and the off-list URL is not leaked in the response body', async () => {
  await withMockedFetch(
    async () => ({ url: 'https://evil.example.com/phishing' }),
    async () => {
      const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url?url=https://maps.app.goo.gl/abc123'));
      assert.equal(res.status, 502);
      const body = await res.text();
      assert.ok(!body.includes('evil.example.com'));
    },
  );
});

test('Google\'s "sorry" interstitial is unwrapped via its own continue= param when that param is allow-listed', async () => {
  await withMockedFetch(
    async () => ({ url: 'https://www.google.com/sorry/index?continue=https://maps.google.com/maps/place/Somewhere/@10.0,76.3,15z&q=EgQ' }),
    async () => {
      const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url?url=https://maps.app.goo.gl/abc123'));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.resolvedUrl, 'https://maps.google.com/maps/place/Somewhere/@10.0,76.3,15z');
    },
  );
});

test('a "sorry" interstitial whose continue= param points off the allow-list falls back to the interstitial\'s own (allow-listed) URL, never the untrusted continue= target', async () => {
  const sorryPageUrl = 'https://www.google.com/sorry/index?continue=https://evil.example.com/steal&q=EgQ';
  await withMockedFetch(
    async () => ({ url: sorryPageUrl }),
    async () => {
      const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url?url=https://maps.app.goo.gl/abc123'));
      // www.google.com (the interstitial's own host) IS allow-listed, so this
      // succeeds — but critically, resolvedUrl must be the interstitial page
      // itself, not the unvalidated evil.example.com continue= target.
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.resolvedUrl, sorryPageUrl);
    },
  );
});

test('fetch itself throwing (network failure) surfaces as a 502, not an unhandled rejection', async () => {
  await withMockedFetch(
    async () => { throw new Error('network down'); },
    async () => {
      const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url?url=https://maps.app.goo.gl/abc123'));
      assert.equal(res.status, 502);
    },
  );
});

test('response includes permissive CORS header on every path (needed for the Capacitor Android shell)', async () => {
  const res = await resolveMapsUrl(new URL('https://example.com/api/resolve-maps-url'));
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});
