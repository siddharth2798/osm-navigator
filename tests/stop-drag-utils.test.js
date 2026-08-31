import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopDragPromoteTarget } from '../lib/stop-drag-utils.js';

const fromRect = { top: 100, height: 40 }; // midpoint 120
const toRect = { top: 500, height: 40 }; // midpoint 520

test('above the starting-point row\'s midpoint promotes to "from"', () => {
  assert.equal(stopDragPromoteTarget(50, fromRect, toRect), 'from');
  assert.equal(stopDragPromoteTarget(119, fromRect, toRect), 'from');
});

test('below the destination row\'s midpoint promotes to "to"', () => {
  assert.equal(stopDragPromoteTarget(521, fromRect, toRect), 'to');
  assert.equal(stopDragPromoteTarget(900, fromRect, toRect), 'to');
});

test('between the two midpoints is an ordinary reorder — no promotion', () => {
  assert.equal(stopDragPromoteTarget(120, fromRect, toRect), null);
  assert.equal(stopDragPromoteTarget(300, fromRect, toRect), null);
  assert.equal(stopDragPromoteTarget(520, fromRect, toRect), null);
});
