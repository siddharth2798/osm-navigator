// Owner-only bulk import of spots into a collection (see docs/SPOT_COLLECTIONS.md).
//
//   ADMIN_TOKEN=... node scripts/import-spots.mjs places.json --collection food --api https://your-worker.workers.dev
//   ADMIN_TOKEN=... node scripts/import-spots.mjs links.txt   --collection food --api https://... --category street-food
//   node scripts/import-spots.mjs places.json --collection food --dry-run      (no token or --api needed)
//
// places.json  → an array of { name, category, note?, url?, lat?, lon?, maps? }. Give lat+lon, or a Google Maps
//                link in "maps" (name is then optional — it is read from the link).
// links.txt    → one Google Maps link per line, optionally `link | category | note`. Lines starting with # are skipped.
// The token is read from the ADMIN_TOKEN environment variable (not a flag) so it stays out of shell history.
import { readFile } from 'node:fs/promises';
import { parseLinkLines, resolveImportEntry } from '../lib/spot-import.js';

const BATCH_SIZE = 100; // well under the API's 200-per-request cap

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: ADMIN_TOKEN=... node scripts/import-spots.mjs <file.json|file.txt> --collection <id> --api <base url> [--category <id>] [--dry-run]');
  process.exit(1);
}

/** Follows a short link's redirects and returns the final URL (Google often puts the coordinates only there). */
async function followRedirect(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (spot import script)' } });
  return res.url;
}

const args = parseArgs(process.argv.slice(2));
const file = args._[0];
if (!file) usage('Give the file to import.');
if (!args.collection) usage('Missing --collection <id>.');
const token = process.env.ADMIN_TOKEN;
if (!args.dryRun) {
  if (!args.api) usage('Missing --api <base url> (or use --dry-run).');
  if (!token) usage('Set the ADMIN_TOKEN environment variable.');
}

const raw = await readFile(file, 'utf8');
let entries;
if (file.toLowerCase().endsWith('.json')) {
  try { entries = JSON.parse(raw); } catch (err) { usage(`${file} is not valid JSON (${err.message}).`); }
  if (!Array.isArray(entries)) usage('The JSON file must be an array of places.');
} else {
  entries = parseLinkLines(raw, args.category);
}

const drafts = [];
const problems = [];
for (let i = 0; i < entries.length; i++) {
  const result = await resolveImportEntry(entries[i], { followRedirect, defaultCategory: args.category });
  if (result.draft) {
    drafts.push(result.draft);
    console.log(`  ok  ${result.draft.name} (${result.draft.lat.toFixed(5)}, ${result.draft.lon.toFixed(5)}) [${result.draft.category || 'no category'}]`);
  } else {
    problems.push({ index: i + 1, error: result.error });
    console.log(`  --  entry ${i + 1}: ${result.error}`);
  }
}
console.log(`\n${drafts.length} ready, ${problems.length} could not be resolved.`);
if (args.dryRun || drafts.length === 0) process.exit(problems.length && !drafts.length ? 1 : 0);

let created = 0;
let rejected = 0;
for (let start = 0; start < drafts.length; start += BATCH_SIZE) {
  const batch = drafts.slice(start, start + BATCH_SIZE);
  const res = await fetch(`${args.api.replace(/\/$/, '')}/api/spots/import?c=${encodeURIComponent(args.collection)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ spots: batch }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`Import failed (HTTP ${res.status}): ${(data && data.error) || 'unknown error'}`);
    process.exit(1);
  }
  created += data.created;
  rejected += data.skipped.length;
  data.skipped.forEach((s) => console.log(`  skipped ${batch[s.index].name}: ${s.reason}`));
}
console.log(`Done: ${created} added, ${rejected} skipped by the server.`);
