#!/usr/bin/env node
// One-off build tool — NOT shipped app code. Rerun this occasionally
// (e.g. if watermetro.co.in adds more jetties/lines) and commit the
// regenerated vendor/kochi-water-metro.json.
//
// Kochi Water Metro has no published GTFS or open-data feed anywhere
// (checked: KMRL's own open-data page, Transitland, and the independent
// KochiTransport dataset, which explicitly excludes Water Metro). But
// https://watermetro.co.in/api/schedule?from=X&to=Y is a real, live,
// unauthenticated JSON endpoint returning genuine per-sailing departure/
// arrival times — confirmed live during this feature's research (2026-08).
// This is UNDOCUMENTED and UNOFFICIAL, not a published feed — it could
// change or disappear without notice, and it's their own site's backend,
// not a public API meant for third-party load, so this script is
// deliberately gentle: sequential requests with a real delay, run once in a
// while by a human, never polled by the deployed app itself.
//
// The true route graph is discovered empirically (probe every ordered pair
// among the known terminal names, keep only non-empty results) rather than
// trusted from the site's own minified bundle, which turned out to contain
// an internally inconsistent route list (self-referential entries that
// can't be real direct routes) when inspected during research.
//
// Jetty coordinates aren't returned by the schedule API at all, and a plain
// Nominatim text search for "<name> Water Metro Terminal" turns up nothing
// (checked live) — these small jetty structures aren't indexed that way.
// Instead: each terminal's own page on watermetro.co.in (e.g.
// /terminal/vypin) embeds a real "Get Directions" Google Maps short link
// (goo.gl/maps or maps.app.goo.gl) pointing at the exact jetty — first-party
// data straight from the operator, not a guess. This script fetches each
// terminal page, extracts that link, follows the redirect, and parses the
// resolved Google Maps URL's own `!3d<lat>!4d<lon>` coordinate encoding.
// Needs a realistic browser User-Agent — Google's redirect resolution
// behaves differently (or shows an interstitial) for an obviously
// non-browser UA, confirmed while researching this.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STATIONS = [
  { name: 'South Chittoor', slug: 'south-chittoor' },
  { name: 'Cheranalloor', slug: 'cheranalloor' },
  { name: 'Eloor', slug: 'eloor' },
  { name: 'Fort Kochi', slug: 'fort-kochi' },
  { name: 'Willingdon Island', slug: 'willingdon-island' },
  { name: 'Mattancherry', slug: 'mattancherry' },
  { name: 'HighCourt', slug: 'highcourt' },
  { name: 'Kakkanad', slug: 'kakkanad' },
  { name: 'Vytilla', slug: 'vytilla' },
  { name: 'Vypin', slug: 'vypin' },
];

const SCHEDULE_API = 'https://watermetro.co.in/api/schedule';
const REQUEST_DELAY_MS = 600; // gentle pacing — see header comment
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 osm-navigator-build-script (https://github.com/siddharth2798/osm-navigator)';

const OUTPUT_PATH = join(import.meta.dirname, '..', 'vendor', 'kochi-water-metro.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchScheduleFor(from, to) {
  const url = `${SCHEDULE_API}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data : null;
}

async function jettyCoordinates(slug) {
  const pageRes = await fetch(`https://watermetro.co.in/terminal/${slug}`, { headers: { 'User-Agent': UA } });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();
  const linkMatch = html.match(/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9]+/);
  if (!linkMatch) return null;
  const resolvedRes = await fetch(linkMatch[0], { headers: { 'User-Agent': UA }, redirect: 'follow' });
  const coordMatch = resolvedRes.url.match(/!3d(-?[0-9.]+)!4d(-?[0-9.]+)/);
  if (!coordMatch) return null;
  return { lat: Number(coordMatch[1]), lon: Number(coordMatch[2]), source: resolvedRes.url };
}

async function main() {
  const names = STATIONS.map((s) => s.name);
  console.log(`Probing ${names.length * (names.length - 1)} ordered station pairs against ${SCHEDULE_API} ...`);
  const routes = [];
  for (const from of names) {
    for (const to of names) {
      if (from === to) continue;
      const sailings = await fetchScheduleFor(from, to);
      await sleep(REQUEST_DELAY_MS);
      if (!sailings || !sailings.length) continue;
      const times = sailings
        .map((s) => ({ departure: s.departure, arrival: s.arrival }))
        .sort((a, b) => a.departure.localeCompare(b.departure));
      routes.push({ from, to, sailings: times });
      console.log(`  ${from} -> ${to}: ${times.length} sailing(s)`);
    }
  }

  console.log('\nFetching jetty coordinates from each terminal page\'s own "Get Directions" link (manually spot-check before trusting)...');
  const stations = [];
  for (const { name, slug } of STATIONS) {
    const coords = await jettyCoordinates(slug);
    await sleep(REQUEST_DELAY_MS);
    console.log(`  ${name}: ${coords ? `${coords.lat},${coords.lon}` : 'NO RESULT — needs manual coordinates'}`);
    stations.push({
      name,
      lat: coords ? coords.lat : null,
      lon: coords ? coords.lon : null,
      coordSource: coords ? coords.source : null,
    });
  }

  const output = {
    source: 'watermetro.co.in (unofficial, undocumented API — see this script\'s header comment)',
    builtAt: new Date().toISOString(),
    stations,
    routes,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`\nWrote ${OUTPUT_PATH} — ${stations.length} stations, ${routes.length} direct route(s).`);
  const missing = stations.filter((s) => s.lat == null);
  if (missing.length) {
    console.log(`\nWARNING: ${missing.length} station(s) need manual coordinates: ${missing.map((s) => s.name).join(', ')}`);
  }
}

main();
