// Run advice from WHOOP recovery and the weather, ported from pi-tracker's run_plan.py.
// Pure: `now` is injected. Notes are { tone: summary|good|info|warn, text }.

import { durationText, kmText, paceText } from './format.js';

export const RECOVERY_LOW = 34;
export const RECOVERY_HIGH = 67;
const SHORT_SLEEP_H = 6;
const WHOOP_MAX_AGE_DAYS = 1;
const HOT_C = 25;
const COLD_C = 3;
const RAIN_PROBABILITY = 60;
const RAIN_CODES = new Set([
  ...range(51, 67), ...range(80, 82), ...range(95, 99),
]);
const LONG_RUN_MIN = 75;
const GEL_RUN_MIN = 90;
const DAY_MS = 86_400_000;

function range(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

const oneDecimal = (value) => value.toFixed(1).replace('.', ',');
export const isRainCode = (code) => RAIN_CODES.has(code);

/** WHOOP recovery zone, same thresholds as the WHOOP app. */
export function recoveryZone(pct) {
  if (!Number.isFinite(pct)) return 'none';
  if (pct < RECOVERY_LOW) return 'red';
  if (pct < RECOVERY_HIGH) return 'yellow';
  return 'green';
}

/** Latest WHOOP day, only if it is today's or yesterday's. */
export function freshWhoop(whoop, today) {
  if (!whoop || !whoop.date) return null;
  const age = (Date.parse(`${today}T12:00:00`) - Date.parse(`${whoop.date}T12:00:00`)) / DAY_MS;
  return age >= 0 && age <= WHOOP_MAX_AGE_DAYS ? whoop : null;
}

function recoveryNotes(whoop) {
  if (!whoop) return [];
  const notes = [];
  const pct = whoop.recovery_pct;
  const zone = recoveryZone(pct);
  if (zone === 'red') notes.push({ tone: 'warn', text: `Récupération basse (${Math.round(pct)} %) : reste en endurance fondamentale, quitte à raccourcir.` });
  if (zone === 'yellow') notes.push({ tone: 'info', text: `Récupération moyenne (${Math.round(pct)} %) : allure facile, sans forcer.` });
  if (zone === 'green') notes.push({ tone: 'good', text: `Bonne récupération (${Math.round(pct)} %) : feu vert.` });
  if (Number.isFinite(whoop.sleep_hours) && whoop.sleep_hours < SHORT_SLEEP_H) {
    notes.push({ tone: 'warn', text: `Nuit courte (${oneDecimal(whoop.sleep_hours)} h) : écoute tes sensations.` });
  }
  return notes;
}

/** First rainy hour between now and the end of the run (plus a margin). */
export function rainHour(weather, now, durationMin) {
  const horizonH = Math.max(3, durationMin / 60 + 3);
  const slot = (weather?.hourly || []).find((hour) => {
    const ahead = (Date.parse(hour.time) - now.getTime()) / 3_600_000;
    const wet = isRainCode(hour.code) || hour.precipProb >= RAIN_PROBABILITY;
    return ahead > -1 && ahead <= horizonH && wet;
  });
  return slot ? new Date(slot.time).getHours() : null;
}

function weatherNotes(weather, now, durationMin) {
  if (!weather) return [];
  const notes = [];
  const temp = weather.current?.tempC;
  if (Number.isFinite(temp) && temp >= HOT_C) notes.push({ tone: 'warn', text: `Chaud (${Math.round(temp)}°) : hydrate-toi, cours tôt ou en fin de journée.` });
  else if (Number.isFinite(temp) && temp <= COLD_C) notes.push({ tone: 'info', text: `Froid (${Math.round(temp)}°) : couvre mains et oreilles.` });
  const hour = rainHour(weather, now, durationMin);
  if (hour !== null) notes.push({ tone: 'info', text: hour === now.getHours() ? 'Il pleut en ce moment : prévois un coupe-vent.' : `Pluie prévue vers ${hour} h.` });
  return notes;
}

export function summaryText(session) {
  return `${session.label} de ${durationText(session.durationMin)} à ${paceText(session.paceS)}/km : ${kmText(session.distanceKm)} km.`;
}

export function analyze(session, whoop, weather, now) {
  const notes = [{ tone: 'summary', text: summaryText(session) }];
  notes.push(...recoveryNotes(whoop));
  notes.push(...weatherNotes(weather, now, session.durationMin));
  if (session.durationMin >= LONG_RUN_MIN) {
    const gel = session.durationMin >= GEL_RUN_MIN ? ' et un gel au-delà de 1 h 30' : '';
    notes.push({ tone: 'info', text: `Sortie longue : prends de l'eau${gel}.` });
  }
  return notes;
}

/** One-line verdict for the Today screen. */
export function verdict(whoop) {
  const zone = recoveryZone(whoop?.recovery_pct);
  return {
    green: { tone: 'good', title: 'Feu vert', text: 'Ton corps est prêt : la séance prévue est faite pour aujourd’hui.' },
    yellow: { tone: 'info', title: 'Tranquille', text: 'Récupération moyenne : garde une allure facile.' },
    red: { tone: 'warn', title: 'Lève le pied', text: 'Récupération basse : endurance fondamentale, ou raccourcis.' },
    none: { tone: 'info', title: 'Pas de données WHOOP', text: 'Écoute tes sensations.' },
  }[zone];
}
