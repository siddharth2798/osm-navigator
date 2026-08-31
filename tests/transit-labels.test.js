import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kochiItineraryBaseParts, buildTransitItineraryLabels } from '../lib/transit-labels.js';

function itin(modes, toName) {
  return { legs: modes.map((mode) => ({ mode, to: { name: toName } })) };
}

test('kochiItineraryBaseParts: metro-only, water-metro-only, both, and neither', () => {
  assert.deepEqual(kochiItineraryBaseParts(itin(['WALK', 'SUBWAY'])), ['Metro']);
  assert.deepEqual(kochiItineraryBaseParts(itin(['WALK', 'FERRY'])), ['Water Metro']);
  assert.deepEqual(kochiItineraryBaseParts(itin(['SUBWAY', 'WALK', 'FERRY'])), ['Metro', 'Water Metro']);
  assert.deepEqual(kochiItineraryBaseParts(itin(['WALK', 'CAR'])), []);
});

test('buildTransitItineraryLabels: unique labels pass through unchanged', () => {
  const itineraries = [itin(['SUBWAY']), itin(['FERRY'])];
  assert.deepEqual(buildTransitItineraryLabels(itineraries), ['Metro', 'Water Metro']);
});

test('buildTransitItineraryLabels: duplicate labels get disambiguated with "(via StationName)"', () => {
  const itineraries = [
    itin(['SUBWAY'], 'Edapally Metro Station'),
    itin(['SUBWAY'], 'Kalamassery Metro Station'),
  ];
  assert.deepEqual(buildTransitItineraryLabels(itineraries), [
    'Metro (via Edapally Metro Station)',
    'Metro (via Kalamassery Metro Station)',
  ]);
});

test('buildTransitItineraryLabels: duplicate label with no ride leg "to" name falls back to the plain label', () => {
  const itineraries = [
    { legs: [{ mode: 'SUBWAY', to: null }] },
    { legs: [{ mode: 'SUBWAY', to: null }] },
  ];
  assert.deepEqual(buildTransitItineraryLabels(itineraries), ['Metro', 'Metro']);
});
