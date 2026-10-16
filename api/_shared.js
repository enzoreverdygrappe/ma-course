// Shared by the serverless functions: auth checks and the whitelist of stored fields.
// Files starting with "_" are not exposed as routes by Vercel.

import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_WORKOUTS = 60;
const MAX_WHOOP_DAYS = 14;
const MAX_TEXT = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WORKOUT_KINDS = new Set(['footing', 'sortie_longue', 'fractionne']);
const WHOOP_FIELDS = ['recovery_pct', 'sleep_hours', 'sleep_performance_pct', 'hrv_ms', 'rhr_bpm', 'spo2_pct', 'respiratory_rate'];

/** Constant-time comparison (hashing first so lengths always match). */
export function sameSecret(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export function send(res, status, data, error = null) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ success: error === null, data, error });
}

const text = (value) => String(value ?? '').slice(0, MAX_TEXT);
const finite = (value) => (Number.isFinite(value) ? value : null);

function cleanWorkout(raw) {
  if (!raw || !DATE_RE.test(raw.date) || !WORKOUT_KINDS.has(raw.kind)) return null;
  return {
    date: raw.date,
    title: text(raw.title) || 'Séance',
    description: text(raw.description),
    kind: raw.kind,
    duration_min: finite(raw.duration_min),
    distance_km: finite(raw.distance_km),
    pace_s: finite(raw.pace_s),
  };
}

function cleanWhoopDay(raw) {
  if (!raw || !DATE_RE.test(raw.date)) return null;
  return { date: raw.date, ...Object.fromEntries(WHOOP_FIELDS.map((field) => [field, finite(raw[field])])) };
}

function cleanHome(raw) {
  const lat = finite(raw?.lat);
  const lon = finite(raw?.lon);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, label: text(raw.label) || 'Maison' };
}

/** Whitelists what gets stored and shown; throws on a payload that is not the expected shape. */
export function cleanState(payload, receivedAt) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.workouts)) {
    throw new Error('Payload invalide : "workouts" manquant');
  }
  const iso = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null);
  return {
    received_at: receivedAt,
    workouts: payload.workouts.slice(0, MAX_WORKOUTS).map(cleanWorkout).filter(Boolean),
    workouts_updated_at: iso(payload.workouts_updated_at),
    whoop: (Array.isArray(payload.whoop) ? payload.whoop : []).slice(-MAX_WHOOP_DAYS).map(cleanWhoopDay).filter(Boolean),
    whoop_updated_at: iso(payload.whoop_updated_at),
    home: cleanHome(payload.home),
  };
}
