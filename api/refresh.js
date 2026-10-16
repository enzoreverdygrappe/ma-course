// /api/refresh — Vercel fetches Kotcha workouts (Garmin) and WHOOP itself, no Mac needed.
// POST from the phone ("X-Course-Code: <APP_CODE>"), GET from the daily Vercel cron
// ("Authorization: Bearer <CRON_SECRET>", sent by Vercel).

import { collect } from './_collect.js';
import { sameSecret, send } from './_shared.js';
import { STATE_PATH, readJson } from './_store.js';

const MIN_INTERVAL_MS = 60_000;   // a burst of taps re-reads the state instead of calling Garmin again

function isAllowed(req) {
  if (req.method === 'POST') return sameSecret(String(req.headers['x-course-code'] || ''), process.env.APP_CODE);
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return req.method === 'GET' && sameSecret(token, process.env.CRON_SECRET);
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return send(res, 405, null, 'Méthode non autorisée');
  if (!isAllowed(req)) return send(res, 401, null, 'Code d’accès incorrect');
  try {
    const previous = await readJson(STATE_PATH);
    const age = Date.now() - Date.parse(previous?.received_at || 0);
    if (previous && age < MIN_INTERVAL_MS) return send(res, 200, previous);
    return send(res, 200, await collect());
  } catch (error) {
    console.error('Refresh failed', error);
    return send(res, 500, null, 'Actualisation impossible pour le moment');
  }
}
