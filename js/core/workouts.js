// Kotcha workouts (read from Garmin Connect by pi-tracker on the Mac). Pure functions.

import { addDays } from './format.js';

export const WEEK_DAYS = 7;

/** Today's workout, otherwise the next one. */
export function nextWorkout(workouts, today) {
  return [...(workouts || [])].sort((a, b) => a.date.localeCompare(b.date)).find((w) => w.date >= today) || null;
}

export const todaysWorkouts = (workouts, today) => (workouts || []).filter((w) => w.date === today);

/** The next 7 days, rest days included: [{ date, workouts: [...] }]. */
export function weekPlan(workouts, today) {
  return Array.from({ length: WEEK_DAYS }, (_, index) => {
    const date = addDays(today, index);
    return { date, workouts: (workouts || []).filter((w) => w.date === date) };
  });
}

export function weekTotals(workouts, today) {
  const last = addDays(today, WEEK_DAYS - 1);
  const inWeek = (workouts || []).filter((w) => w.date >= today && w.date <= last);
  return {
    count: inWeek.length,
    km: Math.round(inWeek.reduce((sum, w) => sum + (w.distance_km || 0), 0) * 10) / 10,
    minutes: inWeek.reduce((sum, w) => sum + (w.duration_min || 0), 0),
  };
}
