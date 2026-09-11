import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearbyFlights } from '../lib/flights-proxy.js';

// nearbyFlights calls the global fetch() directly (no injection point —
// it's a Cloudflare Worker/Pages Functions module, not written for
// testability), same rationale as resolve-maps-url.test.js's own
// withMockedFetch. `caches` is left undefined here (as it is in plain
// Node) so nearbyFlights takes its no-edge-cache branch every time,
// which keeps these tests about the airplanes.live/OpenSky tier logic
// only.
function withMockedFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = original; });
}

function flightsUrl(lat = 40, lon = -73, radiusNm = 5) {
  return new URL(`https://example.com/api/flights?lat=${lat}&lon=${lon}&radiusNm=${radiusNm}`);
}

const OPENSKY_STATES = { states: [] }; // empty is fine — these tests only care about which source answered and how it was called

// getOpenSkyToken caches its token at module scope (see lib/flights-proxy.js —
// this mirrors production, where a warm Worker isolate shouldn't
// re-authenticate on every single request). That cache is shared across every
// test in this file, so the tests below are ORDERED deliberately: the
// no-credentials and token-endpoint-failure cases run first (neither can leave
// a valid cached token behind), then the success case populates the cache,
// then the reuse case relies on exactly that.

test('airplanes.live succeeding means OpenSky (and any OAuth2 token exchange) is never touched', async () => {
  let openSkyCalled = false;
  await withMockedFetch(
    async (url) => {
      if (String(url).startsWith('https://api.airplanes.live/')) {
        return new Response(JSON.stringify({ ac: [{ hex: 'abc123', lat: 40, lon: -73 }] }), { status: 200 });
      }
      openSkyCalled = true;
      throw new Error('should not be called');
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), {});
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'airplanes.live');
    },
  );
  assert.equal(openSkyCalled, false);
});

test('no OPENSKY_CLIENT_ID/SECRET configured: falls back to an anonymous OpenSky call with no Authorization header', async () => {
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response('', { status: 403 });
      if (String(url).startsWith('https://opensky-network.org/')) {
        assert.equal(opts.headers.Authorization, undefined);
        return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), {});
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
});

test('token endpoint failing (bad client_id/secret) degrades to the same anonymous OpenSky call, not a thrown error', async () => {
  const env = { OPENSKY_CLIENT_ID: 'bad-id', OPENSKY_CLIENT_SECRET: 'bad-secret' };
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response('', { status: 403 });
      if (String(url).startsWith('https://auth.opensky-network.org/')) return new Response('', { status: 401 });
      if (String(url).startsWith('https://opensky-network.org/')) {
        assert.equal(opts.headers.Authorization, undefined);
        return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), env);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
});

test('valid OPENSKY_CLIENT_ID/SECRET: exchanges for a bearer token and sends it as Authorization on the states/all call', async () => {
  const env = { OPENSKY_CLIENT_ID: 'good-id', OPENSKY_CLIENT_SECRET: 'good-secret' };
  let tokenRequests = 0;
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response('', { status: 403 });
      if (String(url).startsWith('https://auth.opensky-network.org/')) {
        tokenRequests++;
        assert.equal(opts.method, 'POST');
        const body = new URLSearchParams(opts.body);
        assert.equal(body.get('grant_type'), 'client_credentials');
        assert.equal(body.get('client_id'), 'good-id');
        assert.equal(body.get('client_secret'), 'good-secret');
        return new Response(JSON.stringify({ access_token: 'tok-123', expires_in: 1800 }), { status: 200 });
      }
      if (String(url).startsWith('https://opensky-network.org/')) {
        assert.equal(opts.headers.Authorization, 'Bearer tok-123');
        return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), env);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
  assert.equal(tokenRequests, 1);
});

test('a still-valid cached token is reused across requests instead of re-hitting the token endpoint', async () => {
  const env = { OPENSKY_CLIENT_ID: 'good-id', OPENSKY_CLIENT_SECRET: 'good-secret' };
  let tokenRequests = 0;
  let statesRequests = 0;
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response('', { status: 403 });
      if (String(url).startsWith('https://auth.opensky-network.org/')) {
        tokenRequests++;
        return new Response(JSON.stringify({ access_token: 'should-not-be-refetched', expires_in: 1800 }), { status: 200 });
      }
      if (String(url).startsWith('https://opensky-network.org/')) {
        statesRequests++;
        // Reuses the token minted by the previous test, not a fresh one —
        // proves the module-scope cache (see lib/flights-proxy.js) is
        // actually short-circuiting the token exchange, not just
        // coincidentally succeeding.
        assert.equal(opts.headers.Authorization, 'Bearer tok-123');
        return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      await nearbyFlights(flightsUrl(), env);
    },
  );
  assert.equal(tokenRequests, 0, 'token endpoint should not be called again while the cached token is still valid');
  assert.equal(statesRequests, 1);
});

test('both airplanes.live and OpenSky failing surfaces the ORIGINAL airplanes.live status, not a generic 502', async () => {
  await withMockedFetch(
    async (url) => {
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response('rate limited', { status: 429 });
      if (String(url).startsWith('https://opensky-network.org/')) return new Response('', { status: 503 });
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), {});
      assert.equal(res.status, 429);
      assert.equal(res.headers.get('x-flight-source'), 'airplanes.live');
    },
  );
});

test('rejects out-of-range coordinates before ever calling fetch', async () => {
  let fetchCalled = false;
  await withMockedFetch(
    async () => { fetchCalled = true; throw new Error('should not be called'); },
    async () => {
      const res = await nearbyFlights(flightsUrl(999, -73), {});
      assert.equal(res.status, 400);
    },
  );
  assert.equal(fetchCalled, false);
});
