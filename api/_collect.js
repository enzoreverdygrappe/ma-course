// Fetches Kotcha workouts (Garmin Connect) and WHOOP days, then stores the new app state.
// Each source is independent: when one fails, the other is still updated and the last known
// data of the failing one is kept, with its error shown in the app.

import * as garmin from './_garmin.js';
import * as whoop from './_whoop.js';
import { cleanState } from './_shared.js';
import { STATE_PATH, freshTokens, readJson, writeJson } from './_store.js';

/** Today's date in Paris ("YYYY-MM-DD"), whatever the server's time zone. */
export const parisToday = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

export const garminAccess = () => freshTokens('garmin', garmin.needsRefresh, (tokens) => garmin.refreshTokens(tokens));

const whoopClient = () => ({ clientId: process.env.WHOOP_CLIENT_ID, clientSecret: process.env.WHOOP_CLIENT_SECRET });
export const whoopAccess = () => freshTokens('whoop', whoop.needsRefresh, (tokens) => whoop.refreshTokens(tokens, whoopClient()));

async function attempt(label, task) {
  try {
    return { value: await task(), error: null };
  } catch (error) {
    console.error(`${label} failed`, error);
    return { value: null, error: error.message || `${label} indisponible` };
  }
}

/** New state from the previous one and the results of both sources (pure). */
export function mergeState(previous, results, nowIso) {
  const prev = previous || {};
  const { workouts, whoopDays } = results;
  return {
    ...cleanState({
      workouts: workouts.value ?? prev.workouts ?? [],
      workouts_updated_at: workouts.value ? nowIso : prev.workouts_updated_at,
      whoop: whoopDays.value ?? prev.whoop ?? [],
      whoop_updated_at: whoopDays.value ? nowIso : prev.whoop_updated_at,
      home: prev.home,
    }, nowIso),
    errors: { garmin: workouts.error, whoop: whoopDays.error },
  };
}

export async function collect(now = new Date()) {
  const [previous, workouts, whoopDays] = await Promise.all([
    readJson(STATE_PATH),
    attempt('Garmin', async () => garmin.fetchWorkouts((await garminAccess()).di_token, parisToday(now))),
    attempt('WHOOP', async () => whoop.fetchDays((await whoopAccess()).access_token)),
  ]);
  const state = mergeState(previous, { workouts, whoopDays }, now.toISOString());
  await writeJson(STATE_PATH, state);
  return state;
}
