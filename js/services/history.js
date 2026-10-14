// Loops traced on this phone and the form preferences (localStorage, per device).

import { restoreForm } from '../core/session.js';

const HISTORY_KEY = 'ma-course:history';
const PREFS_KEY = 'ma-course:prefs';
export const MAX_HISTORY = 12;

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export function loadHistory() {
  const list = load(HISTORY_KEY);
  return Array.isArray(list) ? list.filter((plan) => plan?.route?.coords && plan?.session) : [];
}

/** New list with the plan first, capped. */
export function withPlan(history, plan) {
  return [plan, ...history].slice(0, MAX_HISTORY);
}

export const saveHistory = (history) => save(HISTORY_KEY, history);

export function loadPrefs() {
  const prefs = load(PREFS_KEY) || {};
  return { form: restoreForm(prefs.form), origin: prefs.origin === 'here' ? 'here' : 'home' };
}

export const savePrefs = ({ form, origin }) => save(PREFS_KEY, { form, origin });
