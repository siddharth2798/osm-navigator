#!/usr/bin/env node
// One-off build tool — NOT shipped app code, not run by the deployed app or
// the Cloudflare Worker. Rerun this whenever KMRL republishes their GTFS
// (e.g. once they extend the calendar past its current 2025-12-31 end date)
// and commit the regenerated vendor/kochi-metro.json.
//
// Downloads Kochi Metro Rail Limited's real, official static GTFS feed
// (https://kochimetro.org/open-data/, required attribution: "Contains data
// provided by Kochi Metro Rail Limited") and distills it down to just what
// the client-side Kochi transit planner (app.js) needs: the ordered station
// list with coordinates, real per-station cumulative travel-time offsets
// (from an actual scheduled trip, not a guess), and real trip start times
// for weekday vs weekend service — small enough to bundle, unlike the full
// ~500KB feed.
//
// Confirmed (2026-08): this is a single line (route R1, 25 stations, Aluva
// <-> Tripunithura, no branches) — that's WHY the planner in app.js can use
// a plain ordered-array lookup instead of general graph search. If KMRL ever
// opens a second line, trips.txt will show more than one route_id/shape_id
// pair and this script's single-line assumption needs revisiting.
//
// The feed's own calendar.txt end date (currently 2025-12-31) is stale, but
// harmless here: this script only extracts the recurring weekday/weekend
// SCHEDULE PATTERN (which stations, in what order, roughly how often), not
// literal calendar service-day validity — that pattern doesn't stop being
// true just because the feed's publisher hasn't refreshed the date range.

import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GTFS_URL = 'http://kochimetro.org/opendata/KMRLOpenData.zip';
const OUTPUT_PATH = join(import.meta.dirname, '..', 'vendor', 'kochi-metro.json');

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

function timeToSeconds(hhmmss) {
  const [h, m, s] = hhmmss.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'kmrl-gtfs-'));
  try {
    console.log(`Downloading ${GTFS_URL} ...`);
    execSync(`curl -sL -o feed.zip "${GTFS_URL}" -A "osm-navigator (personal project; https://github.com/siddharth2798/osm-navigator)"`, { cwd: workDir });
    execSync('unzip -o -q feed.zip -d extracted', { cwd: workDir });

    const extracted = join(workDir, 'extracted');
    const stops = parseCsv(readFileSync(join(extracted, 'stops.txt'), 'utf8'));
    const trips = parseCsv(readFileSync(join(extracted, 'trips.txt'), 'utf8'));
    const routes = parseCsv(readFileSync(join(extracted, 'routes.txt'), 'utf8'));
    const stopTimes = parseCsv(readFileSync(join(extracted, 'stop_times.txt'), 'utf8'));
    const feedInfo = parseCsv(readFileSync(join(extracted, 'feed_info.txt'), 'utf8'))[0];

    if (new Set(routes.map((r) => r.route_id)).size > 1) {
      throw new Error(`Expected a single route (single line) — found ${routes.length}. This script's ordered-array assumption no longer holds; needs a real graph model instead.`);
    }
    const shapeIds = new Set(trips.map((t) => t.shape_id));
    if (shapeIds.size > 2) {
      // Exactly one shape per direction (0/1) is the single-line case; more
      // than that would mean branches.
      throw new Error(`Expected 2 shapes (one per direction) — found ${shapeIds.size}. Possible branch line; needs a real graph model instead.`);
    }

    const tripsById = new Map(trips.map((t) => [t.trip_id, t]));

    // direction_id 0's stop sequence is the canonical station order —
    // direction 1 is confirmed to be the exact reverse (same station set).
    const directionZeroTripId = trips.find((t) => t.direction_id === '0').trip_id;
    const canonicalStopTimes = stopTimes
      .filter((st) => st.trip_id === directionZeroTripId)
      .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));

    const stopsById = new Map(stops.map((s) => [s.stop_id, s]));
    const t0 = timeToSeconds(canonicalStopTimes[0].departure_time);
    const stations = canonicalStopTimes.map((st) => {
      const stop = stopsById.get(st.stop_id);
      return {
        id: st.stop_id,
        name: stop.stop_name,
        lat: Number(stop.stop_lat),
        lon: Number(stop.stop_lon),
        // Seconds from the first station's departure, on a real scheduled
        // trip — travel time between any two stations is just the
        // difference of their offsets. Direction 1 (reverse) travel time
        // between the same two stations is treated as symmetric, which
        // this feed's own timings confirm is very close to true (checked:
        // total direction-0 and direction-1 trip durations both ~55min).
        offsetS: timeToSeconds(st.arrival_time) - t0,
      };
    });

    // Real trip START times (not a guessed average headway) per
    // service/direction, used to estimate "next train after time T" —
    // service_id 'WK' (Mon-Fri) vs 'WE' (Sat-Sun, confirmed from this
    // feed's own calendar.txt) is looked up by day-of-week at query time
    // in app.js, not baked in here.
    function startTimesFor(serviceId, directionId) {
      return trips
        .filter((t) => t.service_id === serviceId && t.direction_id === directionId)
        .map((t) => {
          const first = stopTimes.find((st) => st.trip_id === t.trip_id && st.stop_sequence === '1');
          return first.departure_time;
        })
        .sort();
    }

    const schedule = {
      weekday: { direction0: startTimesFor('WK', '0'), direction1: startTimesFor('WK', '1') },
      weekend: { direction0: startTimesFor('WE', '0'), direction1: startTimesFor('WE', '1') },
    };

    const output = {
      source: 'Kochi Metro Rail Limited open data (https://kochimetro.org/open-data/)',
      attribution: 'Contains data provided by Kochi Metro Rail Limited',
      feedVersion: feedInfo.feed_version,
      feedDateRange: [feedInfo.feed_start_date, feedInfo.feed_end_date],
      builtAt: new Date().toISOString(),
      // direction 0 = stations[0] -> stations[last]; direction 1 = reverse.
      stations,
      schedule,
    };

    writeFileSync(OUTPUT_PATH, JSON.stringify(output));
    console.log(`Wrote ${OUTPUT_PATH} — ${stations.length} stations, ${schedule.weekday.direction0.length + schedule.weekday.direction1.length} weekday trips, ${schedule.weekend.direction0.length + schedule.weekend.direction1.length} weekend trips.`);
    console.log(`Feed date range: ${feedInfo.feed_start_date} - ${feedInfo.feed_end_date} (stale end date is fine — see this script's header comment).`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
