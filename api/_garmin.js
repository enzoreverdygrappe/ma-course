// Kotcha workouts read from the Garmin Connect training calendar (Kotcha has no API: it
// pushes planned sessions there). Ported from pi-tracker's scripts/garmin_workouts.py and the
// DI OAuth2 calls of the `garminconnect` 0.3.x Python library (Android app headers).

const CONNECT_API = 'https://connectapi.garmin.com';
const DI_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const NATIVE_HEADERS = {
  'User-Agent': 'GCM-Android-5.23',
  'X-Garmin-User-Agent': 'com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0',
  'X-Garmin-Paired-App-Version': '10861',
  'X-Garmin-Client-Platform': 'Android',
  'X-App-Ver': '10861',
  'X-Lang': 'en',
  'X-GCExperience': 'GC5',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'application/json',
};
const REQUEST_TIMEOUT_MS = 15000;
export const REFRESH_MARGIN_S = 3600;     // the library refreshes 15 min before expiry; we keep more slack

export const LOOKAHEAD_DAYS = 7;
const DEFAULT_EASY_PACE_S = 360;          // pace used for a step without a target
const OPEN_STEP_S = 600;                  // "until lap" step without a duration: counted 10 min…
const OPEN_WARMUP_S = 1500;               // …except the warm-up: 25 min, as Kotcha shows it
const LONG_RUN_MIN = 75;
const LONG_RUN_WORDS = ['longue', 'long run', 'long'];

/* ------------------------------------------------------------ pure logic */

export function addDaysIso(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Planned workouts from today to today+days, deduplicated, sorted. */
export function upcomingItems(calendars, today, days = LOOKAHEAD_DAYS) {
  const last = addDaysIso(today, days);
  const seen = new Map();
  for (const calendar of calendars) {
    for (const item of calendar?.calendarItems || []) {
      if (item?.itemType !== 'workout' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) continue;
      const key = `${item.workoutId}|${item.date}`;
      if (item.date >= today && item.date <= last && !seen.has(key)) seen.set(key, item);
    }
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const isPositive = (value) => typeof value === 'number' && value > 0;

/** Target pace (s/km) in the middle of the zone; Garmin gives it in m/s. */
function targetPace(step) {
  const speeds = [step.targetValueOne, step.targetValueTwo];
  if (step.targetType?.workoutTargetTypeKey !== 'pace.zone' || !speeds.every(isPositive)) return null;
  return speeds.reduce((sum, speed) => sum + 1000 / speed, 0) / 2;
}

/** Totals { seconds, meters, hasRepeat } of a list of steps. */
function walk(steps, fallbackPace, repeat = 1) {
  let seconds = 0;
  let meters = 0;
  let hasRepeat = false;
  for (const step of steps || []) {
    if (step.type === 'RepeatGroupDTO') {
      const inner = walk(step.workoutSteps, fallbackPace, Number(step.numberOfIterations) || 1);
      seconds += inner.seconds;
      meters += inner.meters;
      hasRepeat = true;
      continue;
    }
    const pace = targetPace(step) || fallbackPace;
    const condition = step.endCondition?.conditionTypeKey;
    let value = step.endConditionValue;
    if (condition === 'distance' && typeof value === 'number') {
      meters += value;
      seconds += (value / 1000) * pace;
      continue;
    }
    if (!(condition === 'time' && typeof value === 'number')) {
      value = step.stepType?.stepTypeKey === 'warmup' ? OPEN_WARMUP_S : OPEN_STEP_S;
    }
    seconds += value;
    meters += (value / pace) * 1000;
  }
  return { seconds: seconds * repeat, meters: meters * repeat, hasRepeat };
}

/** Summary of a Garmin workout: kind, km, duration, average pace. */
export function summarizeWorkout(workout, fallbackPace = DEFAULT_EASY_PACE_S) {
  const steps = (workout.workoutSegments || []).flatMap((segment) => segment.workoutSteps || []);
  const walked = walk(steps, fallbackPace);
  const hasEstimate = typeof workout.estimatedDurationInSecs === 'number' && isPositive(workout.estimatedDistanceInMeters);
  const seconds = hasEstimate ? workout.estimatedDurationInSecs : walked.seconds;
  const meters = hasEstimate ? workout.estimatedDistanceInMeters : walked.meters;
  const { hasRepeat } = walked;
  const name = String(workout.workoutName || 'Séance');
  const durationMin = seconds > 0 ? Math.round(seconds / 60) : null;
  const lower = name.toLowerCase();
  let kind = 'footing';
  if (hasRepeat) kind = 'fractionne';
  else if (LONG_RUN_WORDS.some((word) => lower.includes(word)) || (durationMin || 0) >= LONG_RUN_MIN) kind = 'sortie_longue';
  return {
    title: name,
    description: String(workout.description || ''),
    kind,
    duration_min: durationMin,
    distance_km: meters > 0 ? Math.round(meters / 10) / 100 : null,
    pace_s: meters > 0 ? Math.round((seconds / meters) * 1000) : null,
  };
}

/** Seconds since epoch at which a JWT expires (unverified payload), or 0. */
export function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp : 0;
  } catch {
    return 0;
  }
}

function jwtClientId(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).client_id || null;
  } catch {
    return null;
  }
}

export const needsRefresh = (tokens, nowS) => !tokens?.di_token || jwtExpiry(tokens.di_token) - REFRESH_MARGIN_S < nowS;

/* ---------------------------------------------------------------- network */

/** New token set from the rotating refresh token (the old one stops working). */
export async function refreshTokens(tokens, fetchImpl = fetch) {
  if (!tokens?.di_refresh_token || !tokens?.di_client_id) throw new Error('Garmin : jeton de rafraîchissement absent');
  const response = await fetchImpl(DI_TOKEN_URL, {
    method: 'POST',
    headers: {
      ...NATIVE_HEADERS,
      Authorization: `Basic ${Buffer.from(`${tokens.di_client_id}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: tokens.di_client_id, refresh_token: tokens.di_refresh_token,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Garmin : rafraîchissement refusé (HTTP ${response.status})`);
  const body = await response.json();
  if (!body.access_token) throw new Error('Garmin : réponse de jeton inattendue');
  return {
    di_token: body.access_token,
    di_refresh_token: body.refresh_token || tokens.di_refresh_token,
    di_client_id: jwtClientId(body.access_token) || tokens.di_client_id,
  };
}

async function connectApi(path, accessToken, fetchImpl) {
  const response = await fetchImpl(`${CONNECT_API}${path}`, {
    headers: { ...NATIVE_HEADERS, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 204) return {};
  if (!response.ok) throw new Error(`Garmin : HTTP ${response.status} sur ${path.split('/')[1]}`);
  return response.json();
}

/** Kotcha workouts of the next 7 days, summarised. */
export async function fetchWorkouts(accessToken, today, fetchImpl = fetch) {
  const months = new Set([today.slice(0, 7), addDaysIso(today, LOOKAHEAD_DAYS).slice(0, 7)]);
  // Garmin's calendar months are 0-indexed.
  const calendars = await Promise.all([...months].sort().map((ym) => {
    const [year, month] = ym.split('-').map(Number);
    return connectApi(`/calendar-service/year/${year}/month/${month - 1}`, accessToken, fetchImpl);
  }));
  const items = upcomingItems(calendars, today);
  const details = await Promise.all(items.map((item) => (
    /^\d+$/.test(String(item.workoutId ?? ''))
      ? connectApi(`/workout-service/workout/${item.workoutId}`, accessToken, fetchImpl)
      : Promise.resolve({ workoutName: item.title })
  )));
  return items.map((item, index) => ({ date: item.date, ...summarizeWorkout(details[index] || { workoutName: item.title }) }));
}
