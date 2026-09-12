#!/usr/bin/env node
// Standalone relay server — run this on a box that is NOT on a hyperscaler
// IP range (a personal VPS, same box as a self-hosted Valhalla instance,
// etc.), not inside the Cloudflare Worker. Exists for one reason, confirmed
// live this session: OpenSky's own GitHub README states "We may block AWS
// and other hyperscalers due to generalized abuse from these IPs" —
// Cloudflare Workers' shared egress IPs get caught by the same kind of
// policy. Both OpenSky and airplanes.live respond instantly from a normal
// residential/VPS IP and either hang (OpenSky, consistent with a
// network-level DROP) or reject fast (airplanes.live, consistent with an
// app-layer block) when called from inside the deployed Worker. There is
// no Cloudflare-side fix — Dedicated CDN Egress IPs is Enterprise-only and
// is for inbound traffic to your own origin anyway, not Workers' own
// outbound fetch() to third parties.
//
// This script is the same core tiered-fetch logic as lib/flights-proxy.js
// (OpenSky primary, airplanes.live fallback, same OAuth2 client_credentials
// support), just running as a plain long-lived Node HTTP server instead of
// a Worker — same relationship as a self-hosted Valhalla instance to
// VALHALLA_URL/lib/valhalla-proxy.js. Not imported from lib/flights-proxy.js
// directly: different runtime (plain `node`, not `workerd`), different
// server-wiring (http.createServer, not a Workers fetch handler), and no
// Cloudflare edge cache — porting the same handful of functions here is
// simpler than trying to share a module across two genuinely different
// execution environments.
//
// Deployment (systemd, on the same box as a self-hosted Valhalla instance):
//   1. Copy this file to the server, e.g. /opt/flights-relay/flights-relay.mjs
//   2. Create /etc/systemd/system/flights-relay.service:
//        [Unit]
//        Description=osm-navigator flights relay
//        After=network.target
//        [Service]
//        ExecStart=/usr/bin/node /opt/flights-relay/flights-relay.mjs
//        Environment=PORT=8091
//        Environment=RELAY_SHARED_SECRET=<a long random string>
//        Environment=OPENSKY_CLIENT_ID=<optional, from opensky-network.org's API client page>
//        Environment=OPENSKY_CLIENT_SECRET=<optional>
//        Restart=on-failure
//        User=<a non-root user>
//        [Install]
//        WantedBy=multi-user.target
//   3. systemctl enable --now flights-relay
//   4. Reverse-proxy it under your existing domain (nginx, alongside
//      whatever already fronts Valhalla), e.g.:
//        location /flights-relay/ {
//          proxy_pass http://127.0.0.1:8091/;
//        }
//      then set the Cloudflare secret SELF_HOSTED_FLIGHTS_URL to
//      https://valhalla.first-time.space/flights-relay (no trailing
//      slash) and RELAY_SHARED_SECRET to the same random string as above.
//
// RELAY_SHARED_SECRET is required, not optional — unlike Valhalla's own
// proxy (which just forwards to a real Valhalla binary that only does
// routing math), this relay holds real upstream credentials and spends a
// real, personal OpenSky/airplanes.live quota. Without a shared secret,
// anyone who finds this URL could run up against that quota on your
// behalf. The Worker sends it as the `x-relay-secret` header.

import http from 'node:http';

const PORT = Number(process.env.PORT) || 8091;
const RELAY_SHARED_SECRET = process.env.RELAY_SHARED_SECRET;
if (!RELAY_SHARED_SECRET) {
  console.error('RELAY_SHARED_SECRET is not set — refusing to start. See the deployment comment at the top of this file.');
  process.exit(1);
}

const NM_PER_DEG_LAT = 60;
const MAX_RADIUS_NM = 250;
const OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all';
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const AIRPLANES_LIVE_BASE_URL = 'https://api.airplanes.live/v2/point';
const UPSTREAM_HEADERS = { 'User-Agent': 'osm-navigator (personal project; https://github.com/siddharth2798/osm-navigator)' };
const UPSTREAM_TIMEOUT_MS = 8000; // generous vs. lib/flights-proxy.js's 5s — this box isn't blocked, so a slow-but-real response shouldn't be aborted just to match the Worker's own tighter budget

async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let openSkyToken = null;
let openSkyTokenExpiresAtMs = 0;
async function getOpenSkyToken() {
  if (!process.env.OPENSKY_CLIENT_ID || !process.env.OPENSKY_CLIENT_SECRET) return null;
  if (openSkyToken && Date.now() < openSkyTokenExpiresAtMs) return openSkyToken;
  try {
    const res = await fetchWithTimeout(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.OPENSKY_CLIENT_ID,
        client_secret: process.env.OPENSKY_CLIENT_SECRET,
      }),
    });
    if (!res.ok) {
      console.error('[flights-relay] OpenSky token request failed, status', res.status);
      return null;
    }
    const data = await res.json();
    if (!data.access_token) return null;
    openSkyToken = data.access_token;
    openSkyTokenExpiresAtMs = Date.now() + (Math.max((data.expires_in || 1800) - 60, 30)) * 1000;
    return openSkyToken;
  } catch (err) {
    console.error('[flights-relay] OpenSky token request threw', err.message);
    return null;
  }
}

function bboxFromPoint(lat, lon, radiusNm) {
  const latDeg = radiusNm / NM_PER_DEG_LAT;
  const lonDeg = radiusNm / NM_PER_DEG_LAT / Math.cos((lat * Math.PI) / 180);
  return { lamin: lat - latDeg, lamax: lat + latDeg, lomin: lon - lonDeg, lomax: lon + lonDeg };
}

function openSkyStateToAircraft(state, nowS) {
  const [icao24, callsign, , timePosition, lastContact, longitude, latitude, baroAltitude, onGround, velocity, trueTrack, , , , squawk] = state;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  const posTimestamp = typeof timePosition === 'number' ? timePosition : lastContact;
  return {
    hex: icao24,
    flight: callsign,
    lat: latitude,
    lon: longitude,
    alt_baro: typeof baroAltitude === 'number' ? Math.round(baroAltitude * 3.28084) : null,
    track: typeof trueTrack === 'number' ? trueTrack : null,
    gs: typeof velocity === 'number' ? velocity * 1.94384 : null,
    seen_pos: typeof posTimestamp === 'number' ? Math.max(0, nowS - posTimestamp) : null,
    on_ground: typeof onGround === 'boolean' ? onGround : null,
    squawk: typeof squawk === 'string' ? squawk : null,
  };
}

async function tryFetchOpenSky(lat, lon, radiusNm) {
  const { lamin, lamax, lomin, lomax } = bboxFromPoint(lat, lon, radiusNm);
  const url = `${OPENSKY_STATES_URL}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const token = await getOpenSkyToken();
  const headers = token ? { ...UPSTREAM_HEADERS, Authorization: `Bearer ${token}` } : UPSTREAM_HEADERS;
  try {
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const nowS = Math.floor(Date.now() / 1000);
    const ac = (Array.isArray(data.states) ? data.states : []).map((s) => openSkyStateToAircraft(s, nowS)).filter(Boolean);
    return { ok: true, body: { ac } };
  } catch (err) {
    return { ok: false, status: null, err: err.message };
  }
}

async function tryFetchAirplanesLive(lat, lon, radiusNm) {
  try {
    const res = await fetchWithTimeout(`${AIRPLANES_LIVE_BASE_URL}/${lat}/${lon}/${radiusNm}`, { headers: UPSTREAM_HEADERS });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    return { ok: true, body };
  } catch (err) {
    return { ok: false, status: null, err: err.message };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/flights') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Only /flights is served here.' }));
    return;
  }
  if (req.headers['x-relay-secret'] !== RELAY_SHARED_SECRET) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or wrong x-relay-secret.' }));
    return;
  }

  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'lat and lon (valid coordinates) are required.' }));
    return;
  }
  const radiusNm = Math.min(Math.max(parseFloat(url.searchParams.get('radiusNm')) || 5, 1), MAX_RADIUS_NM);

  // Same tier order as lib/flights-proxy.js: OpenSky first, airplanes.live
  // as the fallback — this box isn't blocked from reaching either, so this
  // is purely about picking the source with the better anonymous quota.
  let result = await tryFetchOpenSky(lat, lon, radiusNm);
  let source = 'opensky';
  if (!result.ok) {
    console.error('[flights-relay] OpenSky failed (status', result.status ?? result.err, ') for', lat, lon, '- trying airplanes.live');
    const fallback = await tryFetchAirplanesLive(lat, lon, radiusNm);
    if (fallback.ok) {
      result = fallback;
      source = 'airplanes.live';
    } else {
      console.error('[flights-relay] airplanes.live ALSO failed (status', fallback.status ?? fallback.err, ') for', lat, lon);
    }
  }

  if (!result.ok) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Could not reach the flight-tracking data source.' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json', 'x-flight-source': source });
  res.end(JSON.stringify(result.body));
});

server.listen(PORT, () => {
  console.log(`[flights-relay] listening on :${PORT} (OpenSky auth: ${process.env.OPENSKY_CLIENT_ID ? 'on' : 'off (anonymous)'})`);
});
