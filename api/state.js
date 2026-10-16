// GET /api/state — what the phone shows: Kotcha workouts, WHOOP days, home.
// Auth: "X-Course-Code: <APP_CODE>" (entered once on the phone, kept in localStorage).

import { sameSecret, send } from './_shared.js';
import { STATE_PATH, readJson } from './_store.js';

const EMPTY = { received_at: null, workouts: [], whoop: [], home: null };

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, null, 'Méthode non autorisée');
  if (!sameSecret(String(req.headers['x-course-code'] || ''), process.env.APP_CODE)) {
    return send(res, 401, null, 'Code d’accès incorrect');
  }
  try {
    return send(res, 200, (await readJson(STATE_PATH)) || EMPTY);
  } catch (error) {
    console.error('Blob read failed', error);
    return send(res, 500, null, 'Lecture des données impossible');
  }
}
