import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, dayLabel, durationText, kmText, paceText, ageText } from '../js/core/format.js';
import { deriveSession, formFromWorkout, initialForm, restoreForm, stepForm } from '../js/core/session.js';
import { nextWorkout, weekPlan, weekTotals } from '../js/core/workouts.js';
import { analyze, freshWhoop, rainHour, recoveryZone, verdict } from '../js/core/analysis.js';
import { destination, distanceM, googleMapsUrl, loopWaypoints, planLoop } from '../js/core/loop.js';

const HOME = [48.85660, 2.35220];

test('formats pace, distance and duration in French', () => {
  assert.equal(paceText(368), '6:08');
  assert.equal(kmText(7.69), '7,7');
  assert.equal(durationText(45), '45 min');
  assert.equal(durationText(105), '1 h 45');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(dayLabel('2026-10-14', '2026-10-14'), "Aujourd'hui");
  assert.equal(dayLabel('2026-10-15', '2026-10-14'), 'Demain');
  assert.equal(ageText('2026-10-14T10:00:00Z', Date.parse('2026-10-14T13:00:00Z')), 'il y a 3 h');
});

test('derives distance from duration and duration from distance', () => {
  const form = initialForm();
  assert.deepEqual(deriveSession(form), { kind: 'footing', label: 'Footing', paceS: 360, distanceKm: 7.5, durationMin: 45 });
  const byDistance = { ...form, mode: 'distance', values: { ...form.values, footing: { minutes: 45, km: 10, pace: 330 } } };
  assert.equal(deriveSession(byDistance).durationMin, 55);
});

test('rejects out-of-range sessions', () => {
  const form = initialForm();
  const bad = { ...form, values: { ...form.values, footing: { minutes: 5, km: 8, pace: 360 } } };
  assert.throws(() => deriveSession(bad), /Durée/);
  assert.throws(() => deriveSession({ ...form, kind: 'sprint' }), /Type/);
});

test('steps a field within limits without mutating the form', () => {
  const form = initialForm();
  const next = stepForm(form, 'minutes', 1);
  assert.equal(next.values.footing.minutes, 50);
  assert.equal(form.values.footing.minutes, 45);
  const floor = stepForm({ ...form, values: { ...form.values, footing: { minutes: 10, km: 8, pace: 180 } } }, 'pace', -1);
  assert.equal(floor.values.footing.pace, 180);
});

test('pre-fills the form from a Kotcha workout, rounded like the steppers', () => {
  const form = formFromWorkout(initialForm(), { date: '2026-10-18', kind: 'sortie_longue', distance_km: 13.46, pace_s: 468 });
  assert.equal(form.kind, 'sortie_longue');
  assert.equal(form.mode, 'distance');
  assert.deepEqual(form.values.sortie_longue, { minutes: 90, km: 13.5, pace: 470 });
  const interval = { kind: 'fractionne', distance_km: 6 };
  assert.deepEqual(formFromWorkout(form, interval), form, 'intervals are run at the track, no loop');
});

test('restores saved preferences and ignores garbage', () => {
  assert.deepEqual(restoreForm(null), initialForm());
  const restored = restoreForm({ kind: 'sortie_longue', mode: 'distance', values: { sortie_longue: { km: 999, pace: 'x' } } });
  assert.equal(restored.kind, 'sortie_longue');
  assert.equal(restored.values.sortie_longue.km, 45);
  assert.equal(restored.values.sortie_longue.pace, 380);
});

const WORKOUTS = [
  { date: '2026-10-18', title: '1h45 Long Run', kind: 'sortie_longue', duration_min: 105, distance_km: 13.46, pace_s: 468 },
  { date: '2026-10-15', title: '1h Easy Run', kind: 'footing', duration_min: 60, distance_km: 7.69, pace_s: 468 },
  { date: '2026-10-13', title: 'Past', kind: 'footing', duration_min: 30, distance_km: 5, pace_s: 360 },
];

test('picks the next workout and builds the week with rest days', () => {
  assert.equal(nextWorkout(WORKOUTS, '2026-10-14').title, '1h Easy Run');
  assert.equal(nextWorkout(WORKOUTS, '2026-10-19'), null);
  const week = weekPlan(WORKOUTS, '2026-10-14');
  assert.equal(week.length, 7);
  assert.equal(week[1].workouts[0].title, '1h Easy Run');
  assert.equal(week[0].workouts.length, 0);
  assert.deepEqual(weekTotals(WORKOUTS, '2026-10-14'), { count: 2, km: 21.2, minutes: 165 });
});

test('uses WHOOP zones and ignores stale recovery', () => {
  assert.equal(recoveryZone(20), 'red');
  assert.equal(recoveryZone(63), 'yellow');
  assert.equal(recoveryZone(80), 'green');
  assert.equal(recoveryZone(undefined), 'none');
  assert.equal(freshWhoop({ date: '2026-10-13' }, '2026-10-14').date, '2026-10-13');
  assert.equal(freshWhoop({ date: '2026-10-11' }, '2026-10-14'), null);
  assert.equal(verdict({ recovery_pct: 80 }).title, 'Feu vert');
});

test('analysis summarises the run then adds recovery, weather and long-run advice', () => {
  const session = { kind: 'sortie_longue', label: 'Sortie longue', paceS: 380, distanceKm: 15, durationMin: 95 };
  const now = new Date('2026-10-14T09:00:00');
  const weather = { current: { tempC: 27 }, hourly: [{ time: '2026-10-14T11:00', code: 61, precipProb: 80 }] };
  const notes = analyze(session, { date: '2026-10-14', recovery_pct: 30, sleep_hours: 5.2 }, weather, now);
  assert.equal(notes[0].tone, 'summary');
  assert.match(notes[0].text, /Sortie longue de 1 h 35 à 6:20\/km : 15,0 km/);
  assert.deepEqual(notes.slice(1).map((n) => n.tone), ['warn', 'warn', 'warn', 'info', 'info']);
  assert.ok(notes.some((n) => n.text === 'Pluie prévue vers 11 h.'));
  assert.ok(notes.some((n) => /gel/.test(n.text)));
});

test('rain outside the run window is ignored', () => {
  const now = new Date('2026-10-14T09:00:00');
  assert.equal(rainHour({ hourly: [{ time: '2026-10-14T20:00', code: 63 }] }, now, 45), null);
  assert.equal(rainHour({ hourly: [{ time: '2026-10-14T10:00', code: 1, precipProb: 70 }] }, now, 45), 10);
});

test('geometry: destination and haversine agree, waypoints sit on the circle', () => {
  const point = destination(HOME, 1000, 90);
  assert.ok(Math.abs(distanceM(HOME, point) - 1000) < 0.5);
  const waypoints = loopWaypoints(HOME, 800, 45);
  assert.equal(waypoints.length, 3);
  const center = destination(HOME, 800, 45);
  waypoints.forEach((wp) => assert.ok(Math.abs(distanceM(center, wp) - 800) < 1));
});

test('planLoop rescales the radius until the route is within tolerance', async () => {
  const calls = [];
  // Fake router: streets are 1.6x the straight polyline.
  const router = async (points) => {
    calls.push(points);
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += distanceM(points[i - 1], points[i]);
    return { distanceM: total * 1.6, coords: points };
  };
  const loop = await planLoop(HOME, 8000, 0, router);
  assert.ok(Math.abs(loop.distanceM - 8000) / 8000 <= 0.04, `got ${loop.distanceM}`);
  assert.ok(calls.length >= 2, 'a second attempt corrected the radius');
  assert.equal(loop.waypoints.length, 3);
  assert.deepEqual(calls[0][0], HOME);
  assert.deepEqual(calls[0].at(-1), HOME);
});

test('google maps link goes home -> 3 waypoints -> home on foot', () => {
  const url = new URL(googleMapsUrl(HOME, [[48.8, 2.4], [48.81, 2.41], [48.8, 2.42]]));
  assert.equal(url.searchParams.get('origin'), '48.856600,2.352200');
  assert.equal(url.searchParams.get('destination'), '48.856600,2.352200');
  assert.equal(url.searchParams.get('waypoints').split('|').length, 3);
  assert.equal(url.searchParams.get('travelmode'), 'walking');
});
