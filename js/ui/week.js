// "Semaine": the next 7 days of Kotcha sessions + the loops traced on this phone.

import { dayLabel, durationText, kmText, paceText } from '../core/format.js';
import { KIND_LABELS, canUseWorkout } from '../core/session.js';
import { weekPlan, weekTotals } from '../core/workouts.js';
import { esc, icon } from './dom.js';

function workoutRow(workout, today) {
  const facts = [
    workout.distance_km ? `${kmText(workout.distance_km)} km` : '',
    workout.duration_min ? durationText(workout.duration_min) : '',
    workout.pace_s ? `${paceText(workout.pace_s)}/km` : '',
  ].filter(Boolean).join(' · ');
  const usable = canUseWorkout(workout) && workout.date === today;
  return `<div class="w-item kind-${esc(workout.kind)}">
    <span class="w-dot" aria-hidden="true"></span>
    <div class="w-text"><b>${esc(workout.title)}</b><span class="muted">${esc(KIND_LABELS[workout.kind] || '')}${facts ? ` · ${esc(facts)}` : ''}</span></div>
    ${usable ? `<button type="button" class="btn btn-small btn-tinted" data-action="plan-workout" data-date="${esc(workout.date)}">Boucle</button>` : ''}
    ${workout.kind === 'fractionne' ? `<span class="chip chip-court">${icon('court')}Stade</span>` : ''}
  </div>`;
}

function dayRow({ date, workouts }, today) {
  const body = workouts.length ? workouts.map((w) => workoutRow(w, today)).join('') : '<div class="w-item rest"><span class="w-dot" aria-hidden="true"></span><span class="muted">Repos</span></div>';
  return `<li class="day${date === today ? ' is-today' : ''}"><span class="day-label">${esc(dayLabel(date, today))}</span>${body}</li>`;
}

function historyCard(history) {
  if (!history.length) return '';
  const rows = history.map((plan, index) => `<li><button type="button" class="h-row" data-action="open-history" data-index="${index}">
    <div class="w-text"><b>${esc(plan.session.label)} · ${kmText(plan.route.distanceM / 1000)} km</b>
    <span class="muted">${esc(new Date(plan.createdAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))} · ${esc(plan.origin.label)}${plan.kotcha ? ` · ${esc(plan.kotcha)}` : ''}</span></div>
    ${icon('chevron', 'chev')}</button></li>`).join('');
  return `<h2 class="section-title">Boucles tracées</h2><article class="card list-card"><ul class="h-list">${rows}</ul></article>`;
}

export function renderWeek(state, today) {
  const workouts = state.data?.workouts || [];
  const totals = weekTotals(workouts, today);
  return `<article class="card totals">
      <div class="metric"><span class="metric-value num">${totals.count}</span><span class="metric-label">Séances</span></div>
      <div class="metric"><span class="metric-value num">${kmText(totals.km)}<small>km</small></span><span class="metric-label">Distance</span></div>
      <div class="metric"><span class="metric-value num">${durationText(totals.minutes)}</span><span class="metric-label">Durée</span></div>
    </article>
    <article class="card list-card"><ul class="days">${weekPlan(workouts, today).map((day) => dayRow(day, today)).join('')}</ul></article>
    ${historyCard(state.history)}`;
}
