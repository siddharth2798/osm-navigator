import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDistance, formatDuration, formatWaitText, formatWaitsText, formatBytes, formatFareINR } from '../lib/format-utils.js';

test('formatDistance shows meters under 950m, km above', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(500), '500 m');
  assert.equal(formatDistance(949), '949 m');
  assert.equal(formatDistance(950), '0.9 km'); // 950/1000 = 0.95, and 0.95 isn't exactly representable in binary floating point — toFixed(1) rounds it down to '0.9', not up to '1.0'
  assert.equal(formatDistance(1500), '1.5 km');
});

test('formatDuration renders minutes, hours+minutes, and the <1 min floor', () => {
  assert.equal(formatDuration(10), '<1 min');
  assert.equal(formatDuration(90), '2 min');
  assert.equal(formatDuration(59 * 60), '59 min');
  assert.equal(formatDuration(60 * 60), '1 h 0 min');
  assert.equal(formatDuration(65 * 60), '1 h 5 min');
  assert.equal(formatDuration(125 * 60), '2 h 5 min');
});

test('formatWaitText: null passthrough and the <1 minute floor', () => {
  assert.equal(formatWaitText(null), null);
  assert.equal(formatWaitText(20), 'in under a minute'); // round(20/60) = round(0.33) = 0
  assert.equal(formatWaitText(30), 'in 1 min'); // round(30/60) = round(0.5) = 1 — Math.round rounds .5 up
  assert.equal(formatWaitText(120), 'in 2 min');
});

test('formatWaitsText: empty/null, single wait delegates to formatWaitText, multiple joins', () => {
  assert.equal(formatWaitsText(null), null);
  assert.equal(formatWaitsText([]), null);
  assert.equal(formatWaitsText([120]), 'in 2 min');
  assert.equal(formatWaitsText([20, 120, 300]), 'in <1, 2, 5 min');
});

test('formatBytes: zero/falsy, MB range, GB range', () => {
  assert.equal(formatBytes(0), '0 MB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(1500 * 1024 * 1024), '1.46 GB');
});

test('formatFareINR: exact amount, and the "from ₹X" partial-total form', () => {
  assert.equal(formatFareINR(80), '₹80');
  assert.equal(formatFareINR(80, false), '₹80');
  assert.equal(formatFareINR(80, true), 'from ₹80');
});
