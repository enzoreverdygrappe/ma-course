// Start point of the loop: the phone's position, "Maison" (synced) or an address picked on the phone.

export const MAX_RECENT_PLACES = 6;
const HERE = { type: 'here' };

const isPoint = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Valid stored origin, or "Ma position" (also migrates the old 'home' / 'here' strings). */
export function restoreOrigin(raw) {
  if (raw === 'home' || raw?.type === 'home') return { type: 'home' };
  if (raw?.type === 'place' && isPoint(raw.lat, raw.lon) && raw.label) {
    return { type: 'place', label: String(raw.label).slice(0, 120), detail: String(raw.detail || '').slice(0, 120), lat: raw.lat, lon: raw.lon };
  }
  return HERE;
}

export const placeOrigin = (place) => restoreOrigin({ ...place, type: 'place' });

const samePlace = (a, b) => Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;

/** New recents list with `place` first, without duplicates, capped. */
export function withRecentPlace(places, place) {
  const clean = restoreOrigin({ ...place, type: 'place' });
  if (clean.type !== 'place') return places;
  return [clean, ...places.filter((other) => !samePlace(other, clean))].slice(0, MAX_RECENT_PLACES);
}

export const restorePlaces = (raw) => (Array.isArray(raw) ? raw.map(placeOrigin).filter((p) => p.type === 'place').slice(0, MAX_RECENT_PLACES) : []);

/** Label shown for the selected origin. */
export function originLabel(origin, home) {
  if (origin.type === 'place') return origin.label;
  if (origin.type === 'home') return home?.label || 'Maison';
  return 'Ma position';
}

export function isSameOrigin(a, b) {
  if (a.type !== b.type) return false;
  return a.type !== 'place' || samePlace(a, b);
}

/** Known point of the origin without asking the GPS (null for "Ma position" not located yet). */
export function knownPoint(origin, home, here) {
  if (origin.type === 'place') return [origin.lat, origin.lon];
  if (origin.type === 'home') return home ? [home.lat, home.lon] : null;
  return here;
}
