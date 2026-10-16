// Settings sheet and the access-code screen.

import { ageText, dayLabel } from '../core/format.js';
import { esc, icon } from './dom.js';

function row(label, value) {
  return `<div class="s-row"><span>${label}</span><span class="muted">${value}</span></div>`;
}

export function renderSettings(state, today) {
  const data = state.data || {};
  const lastWhoop = data.whoop?.at(-1);
  const age = (iso) => (iso ? esc(ageText(iso)) : 'jamais');
  return `<div class="sheet-grabber" aria-hidden="true"></div>
    <header class="sheet-head"><h2>Réglages</h2>
      <button type="button" class="icon-btn glass" data-action="close-settings" aria-label="Fermer">${icon('close')}</button></header>
    <h3 class="section-title">Synchronisation</h3>
    <div class="card list-card">
      ${row('Dernière mise à jour', age(data.received_at))}
      ${row('Séances Kotcha', data.errors?.garmin ? `<span class="s-warn">${esc(data.errors.garmin)}</span>` : `${(data.workouts || []).length} · ${age(data.workouts_updated_at)}`)}
      ${row('WHOOP', data.errors?.whoop ? `<span class="s-warn">${esc(data.errors.whoop)}</span>` : (lastWhoop ? `${esc(dayLabel(lastWhoop.date, today))} · ${age(data.whoop_updated_at)}` : 'aucune donnée'))}
      <button type="button" class="s-row s-action" data-action="refresh" ${state.refreshing ? 'disabled' : ''}>${state.refreshing ? '<span class="spinner" aria-hidden="true"></span>Mise à jour…' : `${icon('refresh')}Actualiser maintenant`}</button>
    </div>
    <p class="footnote">Kotcha → Garmin Connect → Vercel, sans le Mac : à chaque ouverture de l’app (si les données ont plus de 20 min) et chaque matin. Le WHOOP aussi.</p>
    <h3 class="section-title">Départ</h3>
    <div class="card list-card">
      ${row(`${icon('location')}Départ actuel`, esc(state.originLabel || 'Ma position'))}
      <button type="button" class="s-row s-action" data-action="open-origin">${icon('search')}Choisir une adresse</button>
    </div>
    <p class="footnote">« Ma position » utilise le GPS de l’iPhone. Les adresses viennent de la Base Adresse Nationale (IGN).</p>
    <h3 class="section-title">Sources</h3>
    <div class="card list-card">
      ${row('Itinéraires', 'OpenStreetMap · OSRM')}
      ${row('Météo', 'Open-Meteo')}
      ${row('Adresses', 'Géoplateforme IGN')}
    </div>
    <div class="card list-card">
      <button type="button" class="s-row s-danger" data-action="logout">${icon('lock')}Oublier le code sur cet appareil</button>
    </div>
    <p class="footnote center">Ajoute l’app à l’écran d’accueil : Partager → « Sur l’écran d’accueil ».</p>`;
}

export function renderLock(message = '') {
  return `<div class="lock">
    <img src="icons/icon-180.png" alt="" class="lock-icon" width="88" height="88">
    <h1>Course</h1>
    <p class="muted">Saisis ton code d’accès pour retrouver tes séances Kotcha et ta forme WHOOP.</p>
    <form id="lock-form" class="lock-form" autocomplete="off">
      <input id="lock-input" class="field" type="password" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="Code d’accès" aria-label="Code d’accès" required>
      <button type="submit" class="btn btn-primary">Continuer</button>
    </form>
    ${message ? `<p class="error-line">${icon('warn')}${esc(message)}</p>` : ''}
  </div>`;
}
