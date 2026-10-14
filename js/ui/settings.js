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
      ${row('Reçu du Mac', age(data.received_at))}
      ${row('Séances Kotcha', `${(data.workouts || []).length} · ${age(data.workouts_updated_at)}`)}
      ${row('WHOOP', lastWhoop ? `${esc(dayLabel(lastWhoop.date, today))} · ${age(data.whoop_updated_at)}` : 'aucune donnée')}
    </div>
    <p class="footnote">Kotcha → Garmin Connect → Mac (pi-tracker, chaque heure) → cette app. Le WHOOP passe aussi par le Mac.</p>
    <h3 class="section-title">Départ</h3>
    <div class="card list-card">
      ${row(`${icon('house')}${esc(data.home?.label || 'Maison')}`, data.home ? 'reçu du Mac' : 'non configuré')}
    </div>
    <p class="footnote">Le départ « Maison » vient de RUN_HOME_* dans le .env de pi-tracker. « Ma position » utilise le GPS de l’iPhone.</p>
    <h3 class="section-title">Sources</h3>
    <div class="card list-card">
      ${row('Itinéraires', 'OpenStreetMap · OSRM')}
      ${row('Météo', 'Open-Meteo')}
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
