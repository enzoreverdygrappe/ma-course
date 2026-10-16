import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_RECENT_PLACES, isSameOrigin, knownPoint, originLabel, restoreOrigin, restorePlaces, withRecentPlace } from '../js/core/origin.js';
import { normalizePlaces } from '../js/services/geocode.js';

const rivoli = { label: '10 Rue de Rivoli', detail: '75004 Paris', lat: 48.8555, lon: 2.36041 };

test('restoreOrigin migrates old prefs and rejects broken places', () => {
  assert.deepEqual(restoreOrigin('home'), { type: 'home' });
  assert.deepEqual(restoreOrigin('here'), { type: 'here' });
  assert.deepEqual(restoreOrigin(undefined), { type: 'here' });
  assert.deepEqual(restoreOrigin({ type: 'place', label: 'x', lat: 200, lon: 2 }), { type: 'here' });
  assert.deepEqual(restoreOrigin({ type: 'place', ...rivoli, extra: 1 }), { type: 'place', ...rivoli });
});

test('recent places: newest first, no duplicates, capped', () => {
  let places = [];
  for (let i = 0; i < MAX_RECENT_PLACES + 2; i += 1) places = withRecentPlace(places, { ...rivoli, label: `P${i}`, lat: 48 + i / 100 });
  assert.equal(places.length, MAX_RECENT_PLACES);
  assert.equal(places[0].label, `P${MAX_RECENT_PLACES + 1}`);
  const again = withRecentPlace(places, { ...places[3] });
  assert.equal(again.length, MAX_RECENT_PLACES);
  assert.equal(again[0].label, places[3].label);
  assert.deepEqual(restorePlaces('nope'), []);
});

test('labels and points per origin type', () => {
  const home = { lat: 48.86, lon: 2.35, label: 'Maison' };
  const place = restoreOrigin({ type: 'place', ...rivoli });
  assert.equal(originLabel({ type: 'here' }, home), 'Ma position');
  assert.equal(originLabel({ type: 'home' }, null), 'Maison');
  assert.equal(originLabel(place, home), '10 Rue de Rivoli');
  assert.deepEqual(knownPoint(place, home, null), [48.8555, 2.36041]);
  assert.deepEqual(knownPoint({ type: 'home' }, home, null), [48.79, 2.39]);
  assert.equal(knownPoint({ type: 'here' }, home, null), null);
  assert.equal(isSameOrigin(place, restoreOrigin({ type: 'place', ...rivoli, label: 'autre' })), true);
  assert.equal(isSameOrigin(place, { type: 'here' }), false);
});

test('normalizePlaces keeps street name + city, or the full label for a town', () => {
  const places = normalizePlaces({ features: [
    { geometry: { coordinates: [2.36041, 48.8555] }, properties: { type: 'housenumber', label: '10 Rue de Rivoli 75004 Paris', name: '10 Rue de Rivoli', postcode: '75004', city: 'Paris' } },
    { geometry: { coordinates: [2.39, 48.79] }, properties: { type: 'municipality', label: 'Vitry-sur-Seine', context: '94, Val-de-Marne' } },
    { geometry: { coordinates: [2.374677, 48.844162] }, properties: { _type: 'poi', name: ['Gare de Lyon'], category: ['gare voyageurs uniquement', 'transport'], city: ['Paris'] } },
    { geometry: { coordinates: [] }, properties: { label: 'broken' } },
  ] });
  assert.deepEqual(places, [rivoli, { label: 'Vitry-sur-Seine', detail: '94, Val-de-Marne', lat: 48.86, lon: 2.35 },
    { label: 'Gare de Lyon', detail: 'gare voyageurs uniquement · Paris', lat: 48.844162, lon: 2.374677 }]);
});
