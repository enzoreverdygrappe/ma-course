// Private Vercel Blob storage: the app state and the connector tokens.
// Garmin and WHOOP refresh tokens rotate on every refresh, so they live only here and a
// short lock stops two invocations from spending the same refresh token.

import { BlobNotFoundError, del, get, put } from '@vercel/blob';

export const STATE_PATH = 'course/state.json';
const TOKENS_PATH = (provider) => `course/tokens/${provider}.json`;
const LOCK_PATH = (provider) => `course/locks/${provider}.json`;
const LOCK_STALE_MS = 45_000;
const LOCK_WAIT_MS = 400;
const LOCK_ATTEMPTS = 20;

const PUT_OPTIONS = { access: 'private', addRandomSuffix: false, contentType: 'application/json' };

export async function readJson(path) {
  try {
    const blob = await get(path, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200) return null;
    return JSON.parse(await new Response(blob.stream).text());
  } catch (error) {
    if (error instanceof BlobNotFoundError || error?.name === 'BlobNotFoundError') return null;
    throw error;
  }
}

export async function writeJson(path, value) {
  await put(path, JSON.stringify(value), { ...PUT_OPTIONS, allowOverwrite: true });
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Runs `task` while holding the provider's lock (create-only blob, stale after 45 s). */
async function withLock(provider, task) {
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      await put(LOCK_PATH(provider), JSON.stringify({ at: Date.now() }), { ...PUT_OPTIONS, allowOverwrite: false });
    } catch (error) {
      if (!/already exists/i.test(error?.message || '')) throw error;
      const lock = await readJson(LOCK_PATH(provider)).catch(() => null);
      if (lock && Date.now() - (lock.at || 0) > LOCK_STALE_MS) await del(LOCK_PATH(provider)).catch(() => {});
      await sleep(LOCK_WAIT_MS);
      continue;
    }
    try {
      return await task();
    } finally {
      await del(LOCK_PATH(provider)).catch((error) => console.error(`Lock release failed (${provider})`, error));
    }
  }
  throw new Error(`Connexion ${provider} occupée, réessaie dans un instant`);
}

export const readTokens = (provider) => readJson(TOKENS_PATH(provider));
export const saveTokens = (provider, tokens) => withLock(provider, () => writeJson(TOKENS_PATH(provider), tokens));

/**
 * Valid tokens for a provider, refreshed (and saved) when about to expire.
 * `needsRefresh(tokens, nowS)` and `refresh(tokens)` come from the provider module.
 */
export async function freshTokens(provider, needsRefresh, refresh) {
  const current = await readTokens(provider);
  if (!current) throw new Error(`${provider} non connecté : lance l'autorisation depuis le Mac`);
  if (!needsRefresh(current, Date.now() / 1000)) return current;
  return withLock(provider, async () => {
    const latest = await readTokens(provider);   // another invocation may have refreshed meanwhile
    if (!needsRefresh(latest, Date.now() / 1000)) return latest;
    const refreshed = await refresh(latest);
    await writeJson(TOKENS_PATH(provider), refreshed);
    return refreshed;
  });
}
