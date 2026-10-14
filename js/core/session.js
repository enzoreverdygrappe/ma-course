// Run session entered on the phone (easy run / long run), mirrors pi-tracker's run_plan.py.

export const KINDS = Object.freeze({ footing: 'Footing', sortie_longue: 'Sortie longue' });
export const KIND_LABELS = Object.freeze({ ...KINDS, fractionne: 'Fractionné' });

export const DEFAULTS = Object.freeze({
  footing: Object.freeze({ minutes: 45, km: 8, pace: 360 }),
  sortie_longue: Object.freeze({ minutes: 90, km: 15, pace: 380 }),
});
export const STEP = Object.freeze({ minutes: 5, km: 0.5, pace: 5 });
export const LIMITS = Object.freeze({ minutes: [10, 300], km: [1, 45], pace: [180, 600] });

const KM_ROUND = 0.1;
const PACE_ROUND = 5;

export const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

export function initialForm() {
  return {
    kind: 'footing',
    mode: 'duration',
    values: { footing: { ...DEFAULTS.footing }, sortie_longue: { ...DEFAULTS.sortie_longue } },
  };
}

/** Validated session: kind, pace and both distance and duration. Throws on bad input. */
export function deriveSession(form) {
  if (!KINDS[form.kind]) throw new Error('Type de séance inconnu');
  const values = form.values[form.kind];
  const pace = values.pace;
  if (!(pace >= LIMITS.pace[0] && pace <= LIMITS.pace[1])) throw new Error('Allure hors limites');
  if (form.mode === 'distance') {
    if (!(values.km >= LIMITS.km[0] && values.km <= LIMITS.km[1])) throw new Error('Distance hors limites');
    return { kind: form.kind, label: KINDS[form.kind], paceS: pace, distanceKm: values.km, durationMin: Math.round((values.km * pace) / 60) };
  }
  if (!(values.minutes >= LIMITS.minutes[0] && values.minutes <= LIMITS.minutes[1])) throw new Error('Durée hors limites');
  const distanceKm = Math.round(((values.minutes * 60) / pace) * 100) / 100;
  return { kind: form.kind, label: KINDS[form.kind], paceS: pace, distanceKm, durationMin: values.minutes };
}

/** New form with one field moved by one step (within limits). */
export function stepForm(form, field, direction) {
  const values = form.values[form.kind];
  const raw = values[field] + direction * STEP[field];
  const next = Math.round(clamp(raw, LIMITS[field]) * 10) / 10;
  return { ...form, values: { ...form.values, [form.kind]: { ...values, [field]: next } } };
}

export const canUseWorkout = (workout) => Boolean(workout && KINDS[workout.kind] && workout.distance_km);

/** New form pre-filled from a Kotcha workout (distance mode, rounded like the steppers). */
export function formFromWorkout(form, workout) {
  if (!canUseWorkout(workout)) return form;
  const values = form.values[workout.kind];
  const km = clamp(Number((Math.round(workout.distance_km / KM_ROUND) * KM_ROUND).toFixed(1)), LIMITS.km);
  const pace = workout.pace_s ? clamp(Math.round(workout.pace_s / PACE_ROUND) * PACE_ROUND, LIMITS.pace) : values.pace;
  return { ...form, kind: workout.kind, mode: 'distance', values: { ...form.values, [workout.kind]: { ...values, km, pace } } };
}

/** Restores a saved form, ignoring anything malformed. */
export function restoreForm(saved) {
  const base = initialForm();
  if (!saved || typeof saved !== 'object' || !saved.values) return base;
  const pick = (kind) => {
    const source = saved.values[kind] || {};
    const fields = Object.fromEntries(Object.keys(LIMITS)
      .filter((field) => Number.isFinite(source[field]))
      .map((field) => [field, clamp(source[field], LIMITS[field])]));
    return { ...DEFAULTS[kind], ...fields };
  };
  return {
    kind: KINDS[saved.kind] ? saved.kind : base.kind,
    mode: saved.mode === 'distance' ? 'distance' : 'duration',
    values: { footing: pick('footing'), sortie_longue: pick('sortie_longue') },
  };
}
