// App data stored on Vercel (Kotcha workouts via Garmin Connect, WHOOP, home).
// Kept in localStorage so the app still opens with the last known data offline.

const CODE_KEY = 'ma-course:code';
const CACHE_KEY = 'ma-course:state';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable: nothing remembered */ }
}

export const getCode = () => read(CODE_KEY) || '';
export const setCode = (code) => write(CODE_KEY, code ? code.trim() : null);

export function cachedState() {
  try { return JSON.parse(read(CACHE_KEY) || 'null'); } catch { return null; }
}

export class AuthError extends Error {}

async function call(path, method) {
  const code = getCode();
  if (!code) throw new AuthError('Code d’accès requis');
  const response = await fetch(path, { method, headers: { 'X-Course-Code': code }, cache: 'no-store' });
  if (response.status === 401) throw new AuthError('Code d’accès incorrect');
  const payload = await response.json().catch(() => null);
  if (!payload?.success) throw new Error(payload?.error || `Serveur indisponible (HTTP ${response.status})`);
  write(CACHE_KEY, JSON.stringify(payload.data));
  return payload.data;
}

/** Last stored data (fast). */
export const fetchState = () => call('/api/state', 'GET');

/** Asks Vercel to fetch Garmin and WHOOP now (a few seconds), then returns the new data. */
export const refreshState = () => call('/api/refresh', 'POST');

const STALE_AFTER_MS = 20 * 60 * 1000;
/** True when the stored data is old enough to be worth refreshing. */
export const isStale = (data, now = Date.now()) => !data?.received_at || now - Date.parse(data.received_at) > STALE_AFTER_MS;
