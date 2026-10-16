// /api/token — the Mac (pi-tracker) shares the connectors with the app without spending
// their rotating refresh tokens: it asks here for a valid access token instead.
// GET  ?provider=garmin|whoop  -> { access_token, expires_at, client_id }  (never the refresh token)
// POST { provider, tokens }    -> stores tokens after a new login made on the Mac
// Auth: "Authorization: Bearer <SYNC_SECRET>".

import { jwtExpiry } from './_garmin.js';
import { garminAccess, whoopAccess } from './_collect.js';
import { sameSecret, send } from './_shared.js';
import { saveTokens } from './_store.js';

const MAX_TOKEN_LENGTH = 8192;
const isToken = (value) => typeof value === 'string' && value.length > 10 && value.length <= MAX_TOKEN_LENGTH;

/** Validates tokens posted by the Mac; returns the stored shape or null. */
export function cleanTokens(provider, raw) {
  if (provider === 'garmin' && isToken(raw?.di_token) && isToken(raw?.di_refresh_token) && isToken(raw?.di_client_id)) {
    return { di_token: raw.di_token, di_refresh_token: raw.di_refresh_token, di_client_id: raw.di_client_id };
  }
  if (provider === 'whoop' && isToken(raw?.access_token) && isToken(raw?.refresh_token) && Number.isFinite(raw?.expires_at)) {
    return { access_token: raw.access_token, refresh_token: raw.refresh_token, expires_at: raw.expires_at };
  }
  return null;
}

async function accessToken(provider) {
  if (provider === 'garmin') {
    const tokens = await garminAccess();
    return { access_token: tokens.di_token, expires_at: jwtExpiry(tokens.di_token), client_id: tokens.di_client_id };
  }
  const tokens = await whoopAccess();
  return { access_token: tokens.access_token, expires_at: tokens.expires_at, client_id: null };
}

export default async function handler(req, res) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(token, process.env.SYNC_SECRET)) return send(res, 401, null, 'Non autorisé');
  try {
    if (req.method === 'GET') {
      const provider = String(req.query?.provider || '');
      if (provider !== 'garmin' && provider !== 'whoop') return send(res, 400, null, 'provider : garmin ou whoop');
      return send(res, 200, await accessToken(provider));
    }
    if (req.method === 'POST') {
      const provider = String(req.body?.provider || '');
      const tokens = cleanTokens(provider, req.body?.tokens);
      if (!tokens) return send(res, 400, null, 'Jetons invalides');
      await saveTokens(provider, tokens);
      return send(res, 200, { provider });
    }
    return send(res, 405, null, 'Méthode non autorisée');
  } catch (error) {
    console.error('Token endpoint failed', error);
    return send(res, 502, null, error.message || 'Jeton indisponible');
  }
}
