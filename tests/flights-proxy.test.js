import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearbyFlights } from '../lib/flights-proxy.js';

// nearbyFlights calls the global fetch() directly (no injection point —
// it's a Cloudflare Worker/Pages Functions module, not written for
// testability), same rationale as resolve-maps-url.test.js's own
// withMockedFetch. `caches` is left undefined here (as it is in plain
// Node) so nearbyFlights takes its no-edge-cache branch every time,
// which keeps these tests about the OpenSky/airplanes.live tier logic
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

// OpenSky is the primary (tier 1) source, airplanes.live the fallback —
// see lib/flights-proxy.js's own comments for why (airplanes.live
// reliably 403s from this deployment's Cloudflare Worker runtime).
//
// getOpenSkyToken caches its token at module scope (mirrors production,
// where a warm Worker isolate shouldn't re-authenticate on every single
// request). That cache is shared across every test in this file, so the
// tests below are ORDERED deliberately: the no-credentials and
// token-endpoint-failure cases run first (neither can leave a valid
// cached token behind), then the success case populates the cache, then
// the reuse case relies on exactly that.

test('SELF_HOSTED_FLIGHTS_URL configured and succeeding means neither direct upstream is ever touched', async () => {
  const env = { SELF_HOSTED_FLIGHTS_URL: 'https://relay.example.com', RELAY_SHARED_SECRET: 'shh' };
  let directUpstreamCalled = false;
  await withMockedFetch(
    async (url, opts) => {
      if (String(url) === 'https://relay.example.com/flights?lat=40&lon=-73&radiusNm=5') {
        assert.equal(opts.headers['x-relay-secret'], 'shh');
        return new Response(JSON.stringify({ ac: [{ hex: 'abc123' }] }), { status: 200, headers: { 'x-flight-source': 'opensky' } });
      }
      directUpstreamCalled = true;
      throw new Error('should not be called');
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), env);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
      assert.deepEqual(JSON.parse(await res.text()), { ac: [{ hex: 'abc123' }] });
    },
  );
  assert.equal(directUpstreamCalled, false);
});

test('SELF_HOSTED_FLIGHTS_URL configured but failing falls through to the direct OpenSky/airplanes.live tiers', async () => {
  const env = { SELF_HOSTED_FLIGHTS_URL: 'https://relay.example.com', RELAY_SHARED_SECRET: 'shh' };
  await withMockedFetch(
    async (url) => {
      if (String(url).startsWith('https://relay.example.com/')) return new Response('', { status: 502 });
      if (String(url).startsWith('https://opensky-network.org/')) return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), env);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
});

test('no SELF_HOSTED_FLIGHTS_URL configured: relay is never called, goes straight to the direct tiers', async () => {
  await withMockedFetch(
    async (url) => {
      if (String(url).includes('relay')) throw new Error('relay should never be called when unconfigured');
      if (String(url).startsWith('https://opensky-network.org/')) return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), {});
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
});

test('OpenSky succeeding (anonymous, no creds configured) means airplanes.live is never touched', async () => {
  let airplanesLiveCalled = false;
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://opensky-network.org/')) {
        assert.equal(opts.headers.Authorization, undefined);
        return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      }
      airplanesLiveCalled = true;
      throw new Error('should not be called');
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), {});
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
  assert.equal(airplanesLiveCalled, false);
});

test('token endpoint failing (bad client_id/secret) still succeeds via the same anonymous OpenSky call — no fallback needed', async () => {
  const env = { OPENSKY_CLIENT_ID: 'bad-id', OPENSKY_CLIENT_SECRET: 'bad-secret' };
  let airplanesLiveCalled = false;
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://auth.opensky-network.org/')) return new Response('', { status: 401 });
      if (String(url).startsWith('https://opensky-network.org/')) {
        assert.equal(opts.headers.Authorization, undefined);
        return new Response(JSON.stringify(OPENSKY_STATES), { status: 200 });
      }
      airplanesLiveCalled = true;
      throw new Error('should not be called');
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), env);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
  assert.equal(airplanesLiveCalled, false);
});

test('valid OPENSKY_CLIENT_ID/SECRET: exchanges for a bearer token and sends it as Authorization on the primary states/all call', async () => {
  const env = { OPENSKY_CLIENT_ID: 'good-id', OPENSKY_CLIENT_SECRET: 'good-secret' };
  let tokenRequests = 0;
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://auth.opensky-network.org/')) {
        tokenRequests++;
        assert.equal(opts.method, 'POST');
        assert.ok(opts.signal instanceof AbortSignal, 'token exchange should carry the fetchWithTimeout AbortSignal');
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

test('OpenSky failing outright falls back to airplanes.live', async () => {
  const env = { OPENSKY_CLIENT_ID: 'good-id', OPENSKY_CLIENT_SECRET: 'good-secret' };
  await withMockedFetch(
    async (url) => {
      // Reuses the token cached by the previous tests — this deployment's
      // real 403 happens on the states/all call itself, not the token
      // exchange, so OpenSky can be fully authenticated and still need
      // the fallback (e.g. a genuine outage, not the auth path).
      if (String(url).startsWith('https://opensky-network.org/')) return new Response('', { status: 503 });
      if (String(url).startsWith('https://api.airplanes.live/')) {
        return new Response(JSON.stringify({ ac: [{ hex: 'abc123', lat: 40, lon: -73 }] }), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), env);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'airplanes.live');
    },
  );
});

test('both OpenSky and airplanes.live failing surfaces the ORIGINAL OpenSky status, not a generic 502', async () => {
  await withMockedFetch(
    async (url) => {
      if (String(url).startsWith('https://opensky-network.org/')) return new Response('rate limited', { status: 429 });
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response('', { status: 403 });
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), {});
      assert.equal(res.status, 429);
      assert.equal(res.headers.get('x-flight-source'), 'opensky');
    },
  );
});

test('every upstream call carries an AbortSignal — the wiring behind the 5s timeout each fetch goes through', async () => {
  // Regression guard for a real production incident: with no timeout at
  // all, a silently hung connection to an upstream (not a fast error —
  // an actual hang) stalled the whole /api/flights request until
  // Cloudflare itself gave up and returned a 522, confirmed live via
  // repeated curls against the deployed Worker. Every fetch in
  // lib/flights-proxy.js now goes through fetchWithTimeout, which attaches
  // an AbortSignal — this checks that wiring on the states/all and
  // airplanes.live-fallback calls without waiting out a real timeout. No
  // client credentials here deliberately: with creds, this can reuse the
  // token minted by an earlier test in this file (the module-scope cache
  // is shared and still valid), which would make the token-endpoint call
  // count unpredictable — that call site's own signal is covered
  // separately by the "valid OPENSKY_CLIENT_ID/SECRET" test above.
  const seenSignals = [];
  await withMockedFetch(
    async (url, opts) => {
      seenSignals.push(!!(opts && opts.signal instanceof AbortSignal));
      if (String(url).startsWith('https://opensky-network.org/')) return new Response('', { status: 503 }); // forces the airplanes.live fallback below
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response(JSON.stringify({ ac: [] }), { status: 200 });
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      await nearbyFlights(flightsUrl(), {});
    },
  );
  assert.equal(seenSignals.length, 2, 'expected exactly 2 upstream calls: states/all, airplanes.live fallback');
  assert.ok(seenSignals.every(Boolean), 'every upstream fetch should carry an AbortSignal');
});

test('a genuinely hung OpenSky connection times out and falls through to airplanes.live rather than hanging the whole request', async () => {
  // The real shape of the incident above: not a fast error, a connection
  // that never resolves on its own. Uses a real AbortSignal listener
  // (not a fake timer) so this exercises the actual UPSTREAM_TIMEOUT_MS
  // path end-to-end — genuinely slow (~5s), which is the point.
  function hangUntilAborted(signal) {
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
  }
  const start = Date.now();
  await withMockedFetch(
    async (url, opts) => {
      if (String(url).startsWith('https://opensky-network.org/')) return hangUntilAborted(opts.signal);
      if (String(url).startsWith('https://api.airplanes.live/')) return new Response(JSON.stringify({ ac: [] }), { status: 200 });
      throw new Error(`unexpected fetch to ${url}`);
    },
    async () => {
      const res = await nearbyFlights(flightsUrl(), {});
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-flight-source'), 'airplanes.live');
    },
  );
  assert.ok(Date.now() - start < 8000, 'should resolve within the ~5s timeout plus a small margin, not hang indefinitely');
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
