// Local demo server for secret spot collections — no Cloudflare account, wrangler or setup needed.
//
//   npm run dev:spots                 → http://localhost:8080  (keyword: "secret eats")
//   PORT=9000 DEMO_KEYWORD="my phrase" npm run dev:spots
//
// Serves the app's static files and runs the real /api/spots handler (lib/spots-api.js) against an in-memory
// SQLite database seeded with a demo "Secret eats" collection around Fort Kochi. Everything resets when you
// stop it. Needs Node 22.13+ (built-in node:sqlite). Not for production — deploy with wrangler instead
// (docs/SPOT_COLLECTIONS.md). Owner token for trying the bulk importer: "dev".
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSpotsRequest } from '../lib/spots-api.js';
import { createTestD1 } from '../tests/helpers/d1-sqlite.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const KEYWORD = process.env.DEMO_KEYWORD || 'secret eats';

const DB = createTestD1();
const now = Date.now();
DB.raw.prepare(
  'INSERT INTO collections (id, title, icon, color, categories_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
).run('food', 'Secret eats', '🍜', '#e8590c', JSON.stringify([
  { id: 'street-food', label: 'Street food', emoji: '🌮' },
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { id: 'cafe', label: 'Café', emoji: '☕' },
  { id: 'dessert', label: 'Dessert', emoji: '🍨' },
]), now);

const DEMO_SPOTS = [
  ['Kashi Art Café', 9.9657, 76.2428, 'cafe', 'Try the banana-walnut cake. Quiet back garden.', 'https://example.com/kashi'],
  ['Dhe Puttu', 9.9669, 76.2431, 'restaurant', 'Puttu with beef fry — go before 1pm.', ''],
  ['Chai Corner', 9.9650, 76.2440, 'street-food', 'Masala chai at 5am, cash only.', ''],
  ['Fort House Fish Fry', 9.9640, 76.2420, 'street-food', 'Karimeen pollichathu. Worth the queue.', ''],
  ['Marine Drive Corn', 9.9814, 76.2760, 'street-food', 'Roasted corn with lime, evenings.', ''],
  ['Bakery by the Jetty', 9.9672, 76.2420, 'cafe', 'Plum cake that sells out by noon.', ''],
  // Other cities, so "near <city>" and the nearest-spots framing can be tried far from Kochi.
  ["Pabba's", 12.8864, 74.8384, 'dessert', 'Parfait, Gadbad', ''],
  ['Maharaja Family Restaurant', 12.8738, 74.8486, 'restaurant', 'Ghee roast', ''],
  ['Hotel Rahmath', 11.2517, 75.7792, 'restaurant', 'Beef rib biriyani', ''],
  ['Guppy', 28.5847, 77.2239, 'restaurant', 'Sushi, prawn tempura, pork belly rice bowl', ''],
];
DEMO_SPOTS.forEach(([name, lat, lon, category, note, url], i) => DB.raw.prepare(
  `INSERT INTO spots (id, collection_id, name, lat, lon, category, note, url, created_at, updated_at, author_hash)
   VALUES (?, 'food', ?, ?, ?, ?, ?, ?, ?, ?, 'demo')`,
).run(`demo-${i}`, name, lat, lon, category, note, url, now, now));

const env = { DB, ADMIN_TOKEN: 'dev', SPOT_KEYWORD_FOOD: KEYWORD };
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function readBody(req) {
  return new Promise((done) => {
    let text = '';
    req.on('data', (chunk) => { text += chunk; });
    req.on('end', () => done(text));
  });
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/api/spots' || url.pathname.startsWith('/api/spots/')) {
    const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : await readBody(req);
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    headers['cf-connecting-ip'] = req.socket.remoteAddress || '127.0.0.1';
    const response = await handleSpotsRequest(new Request(url, { method: req.method, headers, body }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(501); res.end('Not available in the local demo server'); return; }

  const relative = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\]|\.\.[/\\])+/, '');
  const file = join(ROOT, relative);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  let data;
  try {
    data = await readFile(file); // read first: a missing file must not leave a half-written 200 behind
  } catch {
    res.writeHead(404); res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(data);
}

// A malformed URL (e.g. "/%zz") or any other per-request failure must not take the whole demo server down.
http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(`[dev-spots-server] ${req.method} ${req.url} failed - ${err.message}`);
    if (!res.headersSent) res.writeHead(err instanceof URIError ? 400 : 500);
    res.end();
  });
}).listen(PORT, () => {
  console.log(`Spot collections demo → http://localhost:${PORT}`);
  console.log(`Keyword: "${KEYWORD}"   (try: "${KEYWORD}" or "${KEYWORD} near Fort Kochi")`);
  console.log('In-memory database — resets when you stop this server. Ctrl+C to quit.');
});
