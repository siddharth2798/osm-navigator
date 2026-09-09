#!/usr/bin/env node
// One-off build tool — NOT shipped app code. Rerun this occasionally (e.g.
// once every few months, or if the Flight Tracking Mode's airport panel
// looks stale/wrong for some airport) and commit the regenerated
// vendor/airports.json + vendor/runways.json. Same "human-run, never part
// of any build step, never polled by the deployed app itself" convention
// as build-water-metro-data.mjs right next to this file.
//
// Source: OurAirports' own public, free, keyless CSV exports
// (https://ourairports.com/data/) — the same dataset the `aurora` project
// seeds its Postgres tables from (see apps/api/internal/db/seed.go there).
// No API, no key, just two flat CSVs republished on GitHub Pages.
//
// vendor/airports.json's existing filter (confirmed by reverse-engineering
// the checked-in file against a live CSV pull: exactly large_airport/
// medium_airport rows, no IATA-code requirement — some entries there
// legitimately have iata: null) is preserved as-is; this script only ADDS
// fields (city/country/elevationFt) that weren't captured before, plus a
// new vendor/runways.json filtered to the same airport set. `icao` is
// icao_code when present, falling back to the CSV's own `ident` column for
// smaller fields that never got a real 4-letter ICAO code (confirmed live:
// e.g. "07FA" Ocean Reef Club Airport has no icao_code at all) — runways.json
// is keyed by that exact same value so the two files join cleanly.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AIRPORTS_CSV_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RUNWAYS_CSV_URL = 'https://davidmegginson.github.io/ourairports-data/runways.csv';
const UA = 'osm-navigator-build-script (personal project; https://github.com/siddharth2798/osm-navigator)';

const AIRPORTS_OUTPUT_PATH = join(import.meta.dirname, '..', 'vendor', 'airports.json');
const RUNWAYS_OUTPUT_PATH = join(import.meta.dirname, '..', 'vendor', 'runways.json');

/** Minimal RFC4180 CSV parser (handles quoted fields with embedded commas/
 * quotes/newlines) — OurAirports' export needs this; airport/runway names
 * routinely contain commas. No dependency pulled in for a script this small. */
function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(rows) {
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const objects = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    objects.push({ get: (col) => row[idx[col]] });
  }
  return objects;
}

function numOrNull(str) {
  if (str === undefined || str === null || str === '') return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

async function fetchCsv(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return rowsToObjects(parseCsv(await res.text()));
}

async function main() {
  console.log(`Fetching ${AIRPORTS_CSV_URL} ...`);
  const airportRows = await fetchCsv(AIRPORTS_CSV_URL);
  console.log(`  ${airportRows.length} total airport rows`);

  const matched = airportRows.filter((r) => r.get('type') === 'large_airport' || r.get('type') === 'medium_airport');
  console.log(`  ${matched.length} large/medium airports kept`);

  const identToIcao = new Map(); // CSV `ident` -> the icao value we're shipping, for joining runways below
  const airports = matched.map((r) => {
    const ident = r.get('ident');
    const icao = r.get('icao_code') || ident;
    identToIcao.set(ident, icao);
    return {
      icao,
      iata: r.get('iata_code') || null,
      name: r.get('name'),
      lat: numOrNull(r.get('latitude_deg')),
      lon: numOrNull(r.get('longitude_deg')),
      large: r.get('type') === 'large_airport',
      city: r.get('municipality') || null,
      country: r.get('iso_country') || null,
      elevationFt: numOrNull(r.get('elevation_ft')),
    };
  });
  writeFileSync(AIRPORTS_OUTPUT_PATH, JSON.stringify(airports));
  console.log(`Wrote ${AIRPORTS_OUTPUT_PATH} — ${airports.length} airports.`);

  console.log(`\nFetching ${RUNWAYS_CSV_URL} ...`);
  const runwayRows = await fetchCsv(RUNWAYS_CSV_URL);
  console.log(`  ${runwayRows.length} total runway rows globally`);

  const runways = [];
  for (const r of runwayRows) {
    const icao = identToIcao.get(r.get('airport_ident'));
    if (!icao) continue; // not one of the airports we bundle — skip, keeps the file small
    runways.push({
      a: icao,
      len: numOrNull(r.get('length_ft')),
      w: numOrNull(r.get('width_ft')),
      surf: r.get('surface') || null,
      lit: r.get('lighted') === '1',
      closed: r.get('closed') === '1',
      le: r.get('le_ident') || null,
      leHdg: numOrNull(r.get('le_heading_degT')),
      he: r.get('he_ident') || null,
      heHdg: numOrNull(r.get('he_heading_degT')),
    });
  }
  writeFileSync(RUNWAYS_OUTPUT_PATH, JSON.stringify(runways));
  const coveredAirports = new Set(runways.map((rw) => rw.a)).size;
  console.log(`Wrote ${RUNWAYS_OUTPUT_PATH} — ${runways.length} runways covering ${coveredAirports}/${airports.length} bundled airports.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
