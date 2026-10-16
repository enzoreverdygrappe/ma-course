// "Boucle": session form + loop on the map + Google Maps hand-off.

import { durationText, kmText, paceText } from '../core/format.js';
import { KINDS, canUseWorkout, deriveSession } from '../core/session.js';
import { originLabel } from '../core/origin.js';
import { todaysWorkouts } from '../core/workouts.js';
import { esc, icon, segmented } from './dom.js';

const KIND_OPTIONS = Object.entries(KINDS).map(([id, label]) => ({ id, label }));
const MODE_OPTIONS = [{ id: 'duration', label: 'Durée' }, { id: 'distance', label: 'Distance' }];
const NOTE_ICONS = { summary: 'flag', good: 'good', info: 'info', warn: 'warn' };

export const loopShell = () => `
  <div class="card map-card" id="map-card">
    <div id="map" class="map"></div>
    <div class="map-badge glass" id="map-badge" hidden></div>
  </div>
  <div id="loop-panel" class="stack"></div>`;

function stepper(field, value, unit, label) {
  return `<div class="stepper-row">
    <span class="stepper-label">${label}</span>
    <div class="stepper">
      <button type="button" class="step-btn" data-step="${field}" data-dir="-1" aria-label="${label} moins">${icon('minus')}</button>
      <span class="stepper-value num">${value}<small>${unit}</small></span>
      <button type="button" class="step-btn" data-step="${field}" data-dir="1" aria-label="${label} plus">${icon('plus')}</button>
    </div>
  </div>`;
}

function kotchaBanner(state, today) {
  const [workout] = todaysWorkouts(state.data?.workouts || [], today).filter(canUseWorkout);
  if (!workout) return '';
  const used = state.plan?.kotcha === workout.title;
  return `<div class="banner">
    <div class="banner-text"><span class="eyebrow">Kotcha · Aujourd'hui</span>
      <b>${esc(workout.title)}</b><span class="muted">${kmText(workout.distance_km)} km${workout.pace_s ? ` · ${paceText(workout.pace_s)}/km` : ''}</span></div>
    <button type="button" class="btn btn-small ${used ? 'btn-ghost' : 'btn-tinted'}" data-action="plan-workout" data-date="${esc(workout.date)}" ${state.busy ? 'disabled' : ''}>${used ? 'Retracer' : 'Utiliser'}</button>
  </div>`;
}

function formCard(state) {
  const { form } = state;
  const values = form.values[form.kind];
  let session = null;
  try { session = deriveSession(form); } catch { /* shown as the error line */ }
  const main = form.mode === 'distance'
    ? stepper('km', kmText(values.km), 'km', 'Distance')
    : stepper('minutes', String(values.minutes), 'min', 'Durée');
  const result = session ? (form.mode === 'distance' ? `≈ ${durationText(session.durationMin)}` : `≈ ${kmText(session.distanceKm)} km`) : '';
  return `<article class="card form-card">
    ${segmented('kind', KIND_OPTIONS, form.kind)}
    ${segmented('mode', MODE_OPTIONS, form.mode)}
    ${main}
    ${stepper('pace', paceText(values.pace), '/km', 'Allure')}
    <div class="form-result"><span class="muted">Estimation</span><span class="num">${result}</span></div>
    <button type="button" class="origin-row" data-action="open-origin" aria-label="Choisir le départ">
      <span class="stepper-label">${icon(state.origin.type === 'home' ? 'house' : 'location')}Départ</span>
      <span class="origin-value">${esc(originLabel(state.origin, state.data?.home))}</span>${icon('chevron', 'origin-chevron')}
    </button>
  </article>`;
}

function actions(state) {
  const plan = state.plan;
  const trace = `<button type="button" class="btn ${plan ? 'btn-secondary' : 'btn-primary'}" data-action="plan" ${state.busy ? 'disabled' : ''}>
    ${state.busy ? '<span class="spinner" aria-hidden="true"></span>Calcul de la boucle…' : `${icon('map')}${plan ? 'Recalculer' : 'Tracer la boucle'}`}</button>`;
  const error = state.planError ? `<p class="error-line">${icon('warn')}${esc(state.planError)}</p>` : '';
  if (!plan) return `${error}${trace}`;
  return `${error}
    <a class="btn btn-primary" href="${esc(plan.url)}" target="_blank" rel="noopener" data-action="open-maps">${icon('external')}Ouvrir dans Google Maps</a>
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-action="reroll" ${state.busy ? 'disabled' : ''}>${icon('shuffle')}Autre boucle</button>
      ${trace}
    </div>`;
}

function notesCard(plan) {
  if (!plan) return '';
  return `<article class="card">
    <h3 class="card-title">Analyse</h3>
    <ul class="notes">${plan.notes.map((note) => `<li class="note tone-${note.tone}">${icon(NOTE_ICONS[note.tone] || 'info')}<span>${esc(note.text)}</span></li>`).join('')}</ul>
  </article>`;
}

export function renderLoopPanel(state, today) {
  return `${kotchaBanner(state, today)}${formCard(state)}<div class="actions">${actions(state)}</div>${notesCard(state.plan)}`;
}

export function badgeHtml(plan) {
  if (!plan) return '';
  return `<span class="eyebrow">${esc(plan.origin.label)}</span><span class="badge-km num">${kmText(plan.route.distanceM / 1000)}<small>km</small></span>`;
}
