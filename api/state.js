// GET /api/state — what the phone shows: Kotcha workouts, WHOOP days, home.
// Auth: "X-Course-Code: <APP_CODE>" (entered once on the phone, kept in localStorage).

import { get } from '@vercel/blob';
import { STATE_PATH, sameSecret, send } from './_shared.js';

const EMPTY = { received_at: null, workouts: [], whoop: [], home: null };

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, null, 'Méthode non autorisée');
  if (!sameSecret(String(req.headers['x-course-code'] || ''), process.env.APP_CODE)) {
    return send(res, 401, null, 'Code d’accès incorrect');
  }
  try {
    const blob = await get(STATE_PATH, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200) return send(res, 200, EMPTY);
    const body = await new Response(blob.stream).text();
    return send(res, 200, JSON.parse(body));
  } catch (error) {
    if (error?.name === 'BlobNotFoundError') return send(res, 200, EMPTY);
    console.error('Blob read failed', error);
    return send(res, 500, null, 'Lecture des données impossible');
  }
}
