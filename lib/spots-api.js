// Worker handler for the secret spot collections API (see docs/SPOT_COLLECTIONS.md).
// Storage is Cloudflare D1 (env.DB). Returns 501 when the binding is absent so the feature stays opt-in,
// like the Valhalla / Open Charge Map / TomTom proxies. A collection's keyword is its credential: reads and
// writes need it in the X-Collection-Key header. The keyword itself lives in a Worker secret
// (SPOT_KEYWORD_<ID>, change it with `wrangler secret put`), never in the database; only a salted hash of it is
// ever published, in the manifest.
import {
  hashKeyword, normalizeKeyword, parseBbox, parseLatLon, safeEqual, sha256Hex, validateSpotDraft,
} from './collections.js';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-collection-key, authorization',
  'access-control-max-age': '86400',
  'cache-control': 'no-store',
};

export const SPOT_API_LIMITS = Object.freeze({
  MAX_BODY_BYTES: 4096,
  LIST_LIMIT: 500,
  CREATES_PER_DAY: 20,
  REPORTS_PER_HOUR: 5,
  HIDE_AT_REPORTS: 3,
  DUPLICATE_RADIUS_DEG: 0.0005, // ~50 m
  IMPORT_MAX_SPOTS: 200,        // per owner bulk-import request
  IMPORT_MAX_BODY_BYTES: 262144,
});

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS, ...extraHeaders },
  });
}

const fail = (status, error) => json({ error }, status);
const unauthorized = () => fail(401, 'Invalid or missing collection key.');

async function readJsonBody(request, maxBytes = SPOT_API_LIMITS.MAX_BODY_BYTES) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { error: 'Request too large.' };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return { error: 'Request too large.' };
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object') return { value };
  } catch { /* fall through */ }
  return { error: 'Body must be a JSON object.' };
}

function parseCategories(collection) {
  try {
    const list = JSON.parse(collection.categories_json);
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string') : [];
  } catch {
    return [];
  }
}

/** The Worker secret that holds a collection's keyword: SPOT_KEYWORD_ + the id in capitals, e.g. SPOT_KEYWORD_FOOD. */
export function keywordSecretName(collectionId) {
  return `SPOT_KEYWORD_${String(collectionId).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

const MIN_KEYWORD_LENGTH = 3;

/** The collection's current keyword (normalised), or null when its secret is unset or too short — i.e. disabled. */
function collectionKeyword(env, collectionId) {
  const keyword = normalizeKeyword(env[keywordSecretName(collectionId)]);
  return keyword.length >= MIN_KEYWORD_LENGTH ? keyword : null;
}

/** Per-collection salt for the public manifest. Public by design; SPOT_SALT (optional secret) just varies it per deployment. */
function collectionSalt(env, collectionId) {
  return env.SPOT_SALT ? `${env.SPOT_SALT}:${collectionId}` : String(collectionId);
}

/** Looks up the collection and checks the supplied keyword against the keyword secret. Null when either fails. */
async function authenticate(request, env, collectionId) {
  const key = request.headers.get('x-collection-key');
  if (!collectionId || !key) return null;
  const keyword = collectionKeyword(env, collectionId);
  if (!keyword) return null;
  const collection = await env.DB.prepare('SELECT * FROM collections WHERE id = ?').bind(collectionId).first();
  if (!collection) return null;
  const salt = collectionSalt(env, collection.id);
  const [supplied, expected] = await Promise.all([hashKeyword(key, salt), hashKeyword(keyword, salt)]);
  return safeEqual(supplied, expected) ? collection : null;
}

/** Daily-rotating hash of the caller's IP — enough for rate limiting, useless for tracking people over time. */
function clientHash(request, env, now) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const day = new Date(now).toISOString().slice(0, 10);
  return sha256Hex(`${env.IP_SALT || 'spots'}:${day}:${ip}`);
}

function toPublicSpot(row) {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    category: row.category,
    note: row.note,
    url: row.url,
    createdAt: row.created_at,
  };
}

/** Public list of {id, salt, hash} the app uses to recognise a keyword on-device. Collections without a keyword secret are left out. */
async function handleManifest(env) {
  const { results } = await env.DB.prepare('SELECT id FROM collections').all();
  const collections = [];
  for (const { id } of results) {
    const keyword = collectionKeyword(env, id);
    if (!keyword) continue;
    const salt = collectionSalt(env, id);
    collections.push({ id, salt, hash: await hashKeyword(keyword, salt) });
  }
  return json({ collections }, 200, { 'cache-control': 'public, max-age=300' });
}

async function handleCollection(request, env, url) {
  const collection = await authenticate(request, env, url.searchParams.get('c'));
  if (!collection) return unauthorized();
  return json({
    id: collection.id,
    title: collection.title,
    icon: collection.icon,
    color: collection.color,
    categories: parseCategories(collection),
  });
}

async function handleList(request, env, url) {
  const collection = await authenticate(request, env, url.searchParams.get('c'));
  if (!collection) return unauthorized();
  const bbox = parseBbox(url.searchParams.get('bbox'));
  if (!bbox) return fail(400, 'bbox must be "west,south,east,north", inside the world, with west < east and south < north.');
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit'), 10) || SPOT_API_LIMITS.LIST_LIMIT, SPOT_API_LIMITS.LIST_LIMIT));

  // Optional `near=lat,lon` ranks results nearest-first, so when a wide box holds more than `limit` spots the ones
  // that survive the cut are the closest, not arbitrary. (Squared degrees are fine for ranking over a short span.)
  const nearRaw = url.searchParams.get('near');
  const near = nearRaw == null ? null : parseLatLon(nearRaw);
  if (nearRaw != null && !near) return fail(400, 'near must be "lat,lon".');
  const order = near ? 'ORDER BY ((lat - ?) * (lat - ?) + (lon - ?) * (lon - ?))' : '';
  const params = [collection.id, bbox.s, bbox.n, bbox.w, bbox.e];
  if (near) params.push(near.lat, near.lat, near.lon, near.lon);
  params.push(limit);

  const { results } = await env.DB.prepare(
    `SELECT id, name, lat, lon, category, note, url, created_at FROM spots
     WHERE collection_id = ? AND status = 'active' AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
     ${order}
     LIMIT ?`,
  ).bind(...params).all();
  return json({ spots: results.map(toPublicSpot), truncated: results.length >= limit });
}

async function handleCreate(request, env, url, now) {
  const collection = await authenticate(request, env, url.searchParams.get('c'));
  if (!collection) return unauthorized();

  const body = await readJsonBody(request);
  if (body.error) return fail(400, body.error);

  const categoryIds = parseCategories(collection).map((c) => c.id);
  const checked = validateSpotDraft(body.value, categoryIds);
  if (!checked.ok) return fail(400, checked.error);
  const spot = checked.value;

  const author = await clientHash(request, env, now);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM spots WHERE author_hash = ? AND created_at > ?')
    .bind(author, now - DAY_MS).first();
  if (recent.n >= SPOT_API_LIMITS.CREATES_PER_DAY) return fail(429, 'Daily limit reached. Try again tomorrow.');

  const r = SPOT_API_LIMITS.DUPLICATE_RADIUS_DEG;
  const duplicate = await env.DB.prepare(
    `SELECT id FROM spots WHERE collection_id = ? AND status = 'active' AND lower(name) = lower(?)
     AND abs(lat - ?) < ? AND abs(lon - ?) < ? LIMIT 1`,
  ).bind(collection.id, spot.name, spot.lat, r, spot.lon, r).first();
  if (duplicate) return fail(409, 'That spot has already been added here.');

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO spots (id, collection_id, name, lat, lon, category, note, url, created_at, updated_at, author_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, collection.id, spot.name, spot.lat, spot.lon, spot.category, spot.note, spot.url, now, now, author).run();

  return json({ spot: toPublicSpot({ id, ...spot, created_at: now }) }, 201);
}

async function handleReport(request, env, spotId, now) {
  const spot = await env.DB.prepare('SELECT id, collection_id FROM spots WHERE id = ?').bind(spotId).first();
  if (!spot) return fail(404, 'No such spot.');
  const collection = await authenticate(request, env, spot.collection_id);
  if (!collection) return unauthorized();

  const reporter = await clientHash(request, env, now);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_hash = ? AND created_at > ?')
    .bind(reporter, now - HOUR_MS).first();
  if (recent.n >= SPOT_API_LIMITS.REPORTS_PER_HOUR) return fail(429, 'Too many reports. Try again later.');

  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO reports (id, spot_id, reporter_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), spot.id, reporter, now),
    env.DB.prepare(
      `UPDATE spots SET
         report_count = (SELECT COUNT(*) FROM reports WHERE spot_id = ?),
         status = CASE WHEN (SELECT COUNT(*) FROM reports WHERE spot_id = ?) >= ? THEN 'hidden' ELSE status END,
         updated_at = ?
       WHERE id = ?`,
    ).bind(spot.id, spot.id, SPOT_API_LIMITS.HIDE_AT_REPORTS, now, spot.id),
  ]);

  const updated = await env.DB.prepare('SELECT status FROM spots WHERE id = ?').bind(spot.id).first();
  return json({ ok: true, hidden: updated.status === 'hidden' });
}

// Owner-only moderation (no admin UI in v1: use curl with the ADMIN_TOKEN secret).
function checkAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return fail(501, 'Moderation is not enabled (ADMIN_TOKEN is not set).');
  const supplied = request.headers.get('authorization') || '';
  return safeEqual(supplied, `Bearer ${env.ADMIN_TOKEN}`) ? null : fail(401, 'Invalid admin token.');
}

async function handleAdminUpdate(request, env, spotId, now) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  const body = await readJsonBody(request);
  if (body.error) return fail(400, body.error);

  const { status, name, note } = body.value;
  if (status !== undefined && status !== 'active' && status !== 'hidden') return fail(400, 'status must be "active" or "hidden".');
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 80)) return fail(400, 'Invalid name.');
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) return fail(400, 'Invalid note.');

  const existing = await env.DB.prepare('SELECT id FROM spots WHERE id = ?').bind(spotId).first();
  if (!existing) return fail(404, 'No such spot.');

  const statements = [
    env.DB.prepare(
      'UPDATE spots SET status = COALESCE(?, status), name = COALESCE(?, name), note = COALESCE(?, note), updated_at = ? WHERE id = ?',
    ).bind(status ?? null, name?.trim() ?? null, note ?? null, now, spotId),
  ];
  // Restoring a spot clears its reports so it isn't hidden again by the very next one.
  if (status === 'active') {
    statements.push(env.DB.prepare('DELETE FROM reports WHERE spot_id = ?').bind(spotId));
    statements.push(env.DB.prepare('UPDATE spots SET report_count = 0 WHERE id = ?').bind(spotId));
  }
  await env.DB.batch(statements);
  return json({ ok: true });
}

/**
 * Owner-only bulk add (scripts/import-spots.mjs). Same validation as the public create route, but no daily
 * rate limit, and bad or duplicate entries are reported back instead of failing the whole batch.
 */
async function handleAdminImport(request, env, url, now) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  const collectionId = url.searchParams.get('c');
  const collection = collectionId
    ? await env.DB.prepare('SELECT * FROM collections WHERE id = ?').bind(collectionId).first()
    : null;
  if (!collection) return fail(404, 'No such collection.');

  const body = await readJsonBody(request, SPOT_API_LIMITS.IMPORT_MAX_BODY_BYTES);
  if (body.error) return fail(400, body.error);
  const drafts = body.value.spots;
  if (!Array.isArray(drafts) || drafts.length === 0) return fail(400, 'Send { "spots": [ ... ] }.');
  if (drafts.length > SPOT_API_LIMITS.IMPORT_MAX_SPOTS) {
    return fail(400, `At most ${SPOT_API_LIMITS.IMPORT_MAX_SPOTS} spots per request.`);
  }

  const categoryIds = parseCategories(collection).map((c) => c.id);
  const r = SPOT_API_LIMITS.DUPLICATE_RADIUS_DEG;
  const created = [];
  const skipped = [];
  for (let index = 0; index < drafts.length; index++) {
    const checked = validateSpotDraft(drafts[index], categoryIds);
    if (!checked.ok) { skipped.push({ index, reason: checked.error }); continue; }
    const spot = checked.value;
    const duplicate = await env.DB.prepare(
      `SELECT id FROM spots WHERE collection_id = ? AND lower(name) = lower(?)
       AND abs(lat - ?) < ? AND abs(lon - ?) < ? LIMIT 1`,
    ).bind(collection.id, spot.name, spot.lat, r, spot.lon, r).first();
    if (duplicate) { skipped.push({ index, reason: 'Already exists here.' }); continue; }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO spots (id, collection_id, name, lat, lon, category, note, url, created_at, updated_at, author_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import')`,
    ).bind(id, collection.id, spot.name, spot.lat, spot.lon, spot.category, spot.note, spot.url, now, now).run();
    created.push({ index, id });
  }
  return json({ created: created.length, skipped });
}

async function handleAdminDelete(request, env, spotId) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  const existing = await env.DB.prepare('SELECT id FROM spots WHERE id = ?').bind(spotId).first();
  if (!existing) return fail(404, 'No such spot.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reports WHERE spot_id = ?').bind(spotId),
    env.DB.prepare('DELETE FROM spots WHERE id = ?').bind(spotId),
  ]);
  return json({ ok: true });
}

export async function handleSpotsRequest(request, env, now = Date.now()) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (!env.DB) return fail(501, 'Spot collections are not enabled on this deployment.');

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  try {
    if (path === '/api/spots/manifest') return method === 'GET' ? await handleManifest(env) : fail(405, 'Method not allowed.');
    if (path === '/api/spots/collection') return method === 'GET' ? await handleCollection(request, env, url) : fail(405, 'Method not allowed.');
    if (path === '/api/spots') {
      if (method === 'GET') return await handleList(request, env, url);
      if (method === 'POST') return await handleCreate(request, env, url, now);
      return fail(405, 'Method not allowed.');
    }

    if (path === '/api/spots/import') return method === 'POST' ? await handleAdminImport(request, env, url, now) : fail(405, 'Method not allowed.');

    const reportMatch = path.match(/^\/api\/spots\/([\w-]+)\/report$/);
    if (reportMatch) return method === 'POST' ? await handleReport(request, env, reportMatch[1], now) : fail(405, 'Method not allowed.');

    const spotMatch = path.match(/^\/api\/spots\/([\w-]+)$/);
    if (spotMatch) {
      if (method === 'PATCH') return await handleAdminUpdate(request, env, spotMatch[1], now);
      if (method === 'DELETE') return await handleAdminDelete(request, env, spotMatch[1]);
      return fail(405, 'Method not allowed.');
    }
    return fail(404, 'Not found.');
  } catch (err) {
    console.error('[spots-api] unexpected failure -', err.message);
    return fail(500, 'Something went wrong.');
  }
}
