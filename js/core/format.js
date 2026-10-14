// Formatting helpers (French locale), shared by every view. Pure functions.

export const paceText = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

export const kmText = (km, digits = 1) => km.toLocaleString('fr-FR', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

export function durationText(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}

/** YYYY-MM-DD in the phone's local time zone. */
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(key, days) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function dayLabel(key, today = dateKey()) {
  if (key === today) return "Aujourd'hui";
  if (key === addDays(today, 1)) return 'Demain';
  const text = new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function longDate(date = new Date()) {
  const text = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "il y a 3 h" style age of an ISO timestamp. */
export function ageText(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}
