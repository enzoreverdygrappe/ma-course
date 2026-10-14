// POST /api/sync — the Mac (pi-tracker cron) pushes Kotcha workouts, WHOOP days and home.
// Auth: "Authorization: Bearer <SYNC_SECRET>".

import { put } from '@vercel/blob';
import { STATE_PATH, cleanState, sameSecret, send } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, null, 'Méthode non autorisée');
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(token, process.env.SYNC_SECRET)) return send(res, 401, null, 'Non autorisé');

  let state;
  try {
    state = cleanState(req.body, new Date().toISOString());
  } catch (error) {
    return send(res, 400, null, error.message);
  }
  try {
    await put(STATE_PATH, JSON.stringify(state), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    });
  } catch (error) {
    console.error('Blob write failed', error);
    return send(res, 500, null, 'Enregistrement impossible');
  }
  return send(res, 200, { workouts: state.workouts.length, whoop: state.whoop.length });
}
