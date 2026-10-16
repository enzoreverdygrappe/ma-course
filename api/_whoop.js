// WHOOP developer API v2 (OAuth2): recovery and sleep of the last days.
// Ported from pi-tracker's scripts/whoop.py (only the fields the app shows).

const API_BASE = 'https://api.prod.whoop.com/developer';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
// Cloudflare (error 1010) rejects some default user agents.
const USER_AGENT = 'ma-course/1.0 (personal app)';
const REQUEST_TIMEOUT_MS = 15000;
export const REFRESH_MARGIN_S = 300;
export const COLLECT_DAYS = 14;
const PAGE_LIMIT = 25;
const MAX_PAGES = 10;
const MS_PER_HOUR = 3_600_000;

/* ------------------------------------------------------------ pure logic */

const dateOf = (iso) => (typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : '');
const round1 = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 10) / 10);

/**
 * Daily entries from the two collections, sorted by date. Sleep counts for the wake-up day,
 * recovery for the day it was computed (created_at); naps are ignored.
 */
export function buildDailyRecords(recoveries, sleeps) {
  const days = new Map();
  const merge = (date, fields) => days.set(date, { ...(days.get(date) || { date }), ...fields });

  for (const sleep of sleeps) {
    const date = dateOf(sleep?.end);
    const score = sleep?.score;
    if (sleep?.nap || !date || !score) continue;
    const stages = score.stage_summary || {};
    merge(date, {
      sleep_hours: round1(((stages.total_in_bed_time_milli || 0) - (stages.total_awake_time_milli || 0)) / MS_PER_HOUR),
      sleep_performance_pct: score.sleep_performance_percentage ?? null,
      respiratory_rate: round1(score.respiratory_rate),
    });
  }
  for (const recovery of recoveries) {
    const date = dateOf(recovery?.created_at);
    const score = recovery?.score;
    if (!date || !score) continue;
    merge(date, {
      recovery_pct: score.recovery_score ?? null,
      hrv_ms: round1(score.hrv_rmssd_milli),
      rhr_bpm: score.resting_heart_rate ?? null,
      spo2_pct: round1(score.spo2_percentage),
    });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const needsRefresh = (tokens, nowS) => !tokens?.access_token || (tokens.expires_at || 0) - REFRESH_MARGIN_S < nowS;

/* ---------------------------------------------------------------- network */

/** New token set from the rotating refresh token (the old one stops working). */
export async function refreshTokens(tokens, { clientId, clientSecret }, fetchImpl = fetch) {
  if (!clientId || !clientSecret) throw new Error('WHOOP : WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET manquants');
  if (!tokens?.refresh_token) throw new Error('WHOOP : jeton de rafraîchissement absent');
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: tokens.refresh_token,
      client_id: clientId, client_secret: clientSecret, scope: 'offline',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`WHOOP : rafraîchissement refusé (HTTP ${response.status})`);
  const body = await response.json();
  if (!body.access_token) throw new Error('WHOOP : réponse de jeton inattendue');
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || tokens.refresh_token,
    expires_at: Date.now() / 1000 + Number(body.expires_in || 3600),
  };
}

async function fetchCollection(path, accessToken, startIso, fetchImpl) {
  let records = [];
  let nextToken = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT), start: startIso });
    if (nextToken) params.set('nextToken', nextToken);
    const response = await fetchImpl(`${API_BASE}${path}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 429) throw new Error('WHOOP : trop de requêtes, réessaie plus tard');
    if (!response.ok) throw new Error(`WHOOP : HTTP ${response.status} sur ${path}`);
    const body = await response.json();
    records = [...records, ...(body.records || [])];
    nextToken = body.next_token || '';
    if (!nextToken) break;
  }
  return records;
}

/** Daily WHOOP entries of the last `days` days. */
export async function fetchDays(accessToken, days = COLLECT_DAYS, fetchImpl = fetch) {
  const startIso = new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const [recoveries, sleeps] = await Promise.all([
    fetchCollection('/v2/recovery', accessToken, startIso, fetchImpl),
    fetchCollection('/v2/activity/sleep', accessToken, startIso, fetchImpl),
  ]);
  return buildDailyRecords(recoveries, sleeps).slice(-days);
}
