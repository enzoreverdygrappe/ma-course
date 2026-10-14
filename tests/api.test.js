import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanState, sameSecret } from '../api/_shared.js';

test('secrets compare in constant time and refuse empty expectations', () => {
  assert.equal(sameSecret('abc', 'abc'), true);
  assert.equal(sameSecret('abd', 'abc'), false);
  assert.equal(sameSecret('', ''), false);
  assert.equal(sameSecret(undefined, 'abc'), false);
});

test('cleanState whitelists fields and drops malformed entries', () => {
  const state = cleanState({
    workouts: [
      { date: '2026-10-15', title: '1h Easy Run', kind: 'footing', duration_min: 60, distance_km: 7.69, pace_s: 468, extra: 'x' },
      { date: 'demain', kind: 'footing' },
      { date: '2026-10-16', kind: 'yoga' },
    ],
    whoop: [{ date: '2026-10-14', recovery_pct: 63, sleep_hours: 7.3, hrv_ms: 97.5, secret: 'no' }],
    home: { lat: 48.86, lon: 2.35, label: 'Maison' },
    workouts_updated_at: '2026-10-14T16:05:02+00:00',
  }, '2026-10-14T16:10:00Z');
  assert.equal(state.workouts.length, 1);
  assert.equal(state.workouts[0].extra, undefined);
  assert.equal(state.whoop[0].secret, undefined);
  assert.equal(state.whoop[0].recovery_pct, 63);
  assert.deepEqual(state.home, { lat: 48.86, lon: 2.35, label: 'Maison' });
  assert.equal(state.received_at, '2026-10-14T16:10:00Z');
});

test('cleanState rejects a payload without workouts and bad homes', () => {
  assert.throws(() => cleanState({}, 'now'), /workouts/);
  assert.equal(cleanState({ workouts: [], home: { lat: 200, lon: 2 } }, 'now').home, null);
});
