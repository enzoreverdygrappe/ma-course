import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchWorkouts, jwtExpiry, needsRefresh as garminNeedsRefresh, refreshTokens, summarizeWorkout, upcomingItems } from '../api/_garmin.js';
import { buildDailyRecords, needsRefresh as whoopNeedsRefresh, refreshTokens as whoopRefresh } from '../api/_whoop.js';
import { mergeState, parisToday } from '../api/_collect.js';
import { cleanTokens } from '../api/token.js';

const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('upcomingItems keeps the next 7 days of workouts, once each, sorted', () => {
  const calendars = [
    { calendarItems: [
      { itemType: 'workout', date: '2026-10-18', workoutId: 2 },
      { itemType: 'workout', date: '2026-10-15', workoutId: 1 },
      { itemType: 'activity', date: '2026-10-16', workoutId: 9 },
      { itemType: 'workout', date: '2026-10-14', workoutId: 0 },
      { itemType: 'workout', date: '2026-10-30', workoutId: 3 },
    ] },
    { calendarItems: [{ itemType: 'workout', date: '2026-10-15', workoutId: 1 }] },
  ];
  assert.deepEqual(upcomingItems(calendars, '2026-10-15').map((item) => item.workoutId), [1, 2]);
});

test('summarizeWorkout: estimates win, long names make a long run, repeats make intervals', () => {
  const easy = summarizeWorkout({ workoutName: '1h Easy Run', estimatedDurationInSecs: 3600, estimatedDistanceInMeters: 7692 });
  assert.deepEqual([easy.kind, easy.duration_min, easy.distance_km, easy.pace_s], ['footing', 60, 7.69, 468]);
  assert.equal(summarizeWorkout({ workoutName: '1h45 Long Run', estimatedDurationInSecs: 6300, estimatedDistanceInMeters: 13460 }).kind, 'sortie_longue');

  const intervals = summarizeWorkout({ workoutName: 'VMA', workoutSegments: [{ workoutSteps: [
    { stepType: { stepTypeKey: 'warmup' } },
    { type: 'RepeatGroupDTO', numberOfIterations: 6, workoutSteps: [
      { endCondition: { conditionTypeKey: 'distance' }, endConditionValue: 400, targetType: { workoutTargetTypeKey: 'pace.zone' }, targetValueOne: 4, targetValueTwo: 4 },
    ] },
  ] }] });
  assert.equal(intervals.kind, 'fractionne');
  assert.equal(intervals.duration_min, 25 + 10);   // 25 min open warm-up + 6 × 100 s
  assert.equal(intervals.distance_km, 6.57);       // 1500 s at 6:00/km + 2.4 km
});

test('Garmin tokens refresh an hour before the JWT expires', () => {
  const token = jwt({ exp: 10_000, client_id: 'C' });
  assert.equal(jwtExpiry(token), 10_000);
  assert.equal(garminNeedsRefresh({ di_token: token }, 5000), false);
  assert.equal(garminNeedsRefresh({ di_token: token }, 7000), true);
  assert.equal(garminNeedsRefresh(null, 0), true);
  assert.equal(jwtExpiry('not-a-jwt'), 0);
});

test('Garmin refresh sends the rotating refresh token and keeps the new one', async () => {
  let sent = null;
  const fake = async (url, options) => { sent = { url, body: String(options.body), auth: options.headers.Authorization }; return json({ access_token: jwt({ exp: 1, client_id: 'NEW' }), refresh_token: 'R2' }); };
  const next = await refreshTokens({ di_token: 'x', di_refresh_token: 'R1', di_client_id: 'OLD' }, fake);
  assert.match(sent.url, /diauth\.garmin\.com/);
  assert.match(sent.body, /refresh_token=R1/);
  assert.equal(sent.auth, `Basic ${Buffer.from('OLD:').toString('base64')}`);
  assert.deepEqual([next.di_refresh_token, next.di_client_id], ['R2', 'NEW']);
  await assert.rejects(refreshTokens({ di_refresh_token: 'R1', di_client_id: 'C' }, async () => json({}, 400)), /HTTP 400/);
});

test('fetchWorkouts asks Garmin for 0-indexed months and summarises each workout', async () => {
  const paths = [];
  const fake = async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path.startsWith('/calendar-service/year/2026/month/9')) return json({ calendarItems: [{ itemType: 'workout', date: '2026-10-28', workoutId: 77 }] });
    if (path.startsWith('/calendar-service')) return json({ calendarItems: [] });
    return json({ workoutName: '1h Easy Run', estimatedDurationInSecs: 3600, estimatedDistanceInMeters: 7692 });
  };
  const workouts = await fetchWorkouts('token', '2026-10-27', fake);
  assert.deepEqual(paths.filter((p) => p.startsWith('/calendar')).sort(), ['/calendar-service/year/2026/month/10', '/calendar-service/year/2026/month/9']);
  assert.deepEqual(workouts, [{ date: '2026-10-28', title: '1h Easy Run', description: '', kind: 'footing', duration_min: 60, distance_km: 7.69, pace_s: 468 }]);
});

test('buildDailyRecords merges sleep (wake-up day) and recovery, ignoring naps', () => {
  const days = buildDailyRecords(
    [{ created_at: '2026-10-14T06:10:00Z', score: { recovery_score: 63, hrv_rmssd_milli: 97.52, resting_heart_rate: 55, spo2_percentage: 96.04 } }],
    [
      { end: '2026-10-14T06:00:00Z', score: { stage_summary: { total_in_bed_time_milli: 28_800_000, total_awake_time_milli: 2_520_000 }, sleep_performance_percentage: 81, respiratory_rate: 15.23 } },
      { nap: true, end: '2026-10-14T14:00:00Z', score: { stage_summary: { total_in_bed_time_milli: 1 } } },
      { end: '2026-10-13T06:00:00Z', score: null },
    ],
  );
  assert.deepEqual(days, [{ date: '2026-10-14', sleep_hours: 7.3, sleep_performance_pct: 81, respiratory_rate: 15.2, recovery_pct: 63, hrv_ms: 97.5, rhr_bpm: 55, spo2_pct: 96 }]);
});

test('WHOOP refresh needs the app credentials and rotates the refresh token', async () => {
  assert.equal(whoopNeedsRefresh({ access_token: 'a', expires_at: 1000 }, 500), false);
  assert.equal(whoopNeedsRefresh({ access_token: 'a', expires_at: 1000 }, 800), true);
  await assert.rejects(whoopRefresh({ refresh_token: 'R' }, {}), /WHOOP_CLIENT_ID/);
  const next = await whoopRefresh({ refresh_token: 'R1' }, { clientId: 'id', clientSecret: 'secret' },
    async () => json({ access_token: 'A2', refresh_token: 'R2', expires_in: 3600 }));
  assert.deepEqual([next.access_token, next.refresh_token], ['A2', 'R2']);
  assert.ok(next.expires_at > Date.now() / 1000);
});

test('mergeState keeps the last known data of a failing source and the home', () => {
  const previous = {
    workouts: [{ date: '2026-10-15', title: 'Easy', kind: 'footing' }], workouts_updated_at: '2026-10-14T10:00:00Z',
    whoop: [{ date: '2026-10-13', recovery_pct: 50 }], whoop_updated_at: '2026-10-14T10:00:00Z',
    home: { lat: 48.8, lon: 2.3, label: 'Maison' },
  };
  const state = mergeState(previous, {
    workouts: { value: null, error: 'Garmin : HTTP 403' },
    whoopDays: { value: [{ date: '2026-10-15', recovery_pct: 70 }], error: null },
  }, '2026-10-15T07:00:00Z');
  assert.equal(state.workouts[0].title, 'Easy');
  assert.equal(state.workouts_updated_at, '2026-10-14T10:00:00Z');
  assert.equal(state.whoop[0].recovery_pct, 70);
  assert.equal(state.whoop_updated_at, '2026-10-15T07:00:00Z');
  assert.deepEqual(state.errors, { garmin: 'Garmin : HTTP 403', whoop: null });
  assert.equal(state.home.label, 'Maison');
  assert.equal(mergeState(null, { workouts: { value: [], error: null }, whoopDays: { value: null, error: 'x' } }, 'n').whoop.length, 0);
});

test('parisToday follows the Paris calendar day', () => {
  assert.equal(parisToday(new Date('2026-10-15T22:30:00Z')), '2026-10-16');
  assert.equal(parisToday(new Date('2026-10-15T21:30:00Z')), '2026-10-15');
});

test('cleanTokens accepts only complete token sets', () => {
  assert.deepEqual(cleanTokens('garmin', { di_token: 'a'.repeat(20), di_refresh_token: 'b'.repeat(20), di_client_id: 'GARMIN_CONNECT_X', extra: 1 }),
    { di_token: 'a'.repeat(20), di_refresh_token: 'b'.repeat(20), di_client_id: 'GARMIN_CONNECT_X' });
  assert.equal(cleanTokens('garmin', { di_token: 'a'.repeat(20) }), null);
  assert.equal(cleanTokens('whoop', { access_token: 'a'.repeat(20), refresh_token: 'b'.repeat(20), expires_at: 'soon' }), null);
  assert.equal(cleanTokens('strava', {}), null);
});
