// "Aujourd'hui": today's Kotcha session, WHOOP readiness, weather and advice.

import { ageText, dayLabel, kmText, paceText } from '../core/format.js';
import { KIND_LABELS, canUseWorkout } from '../core/session.js';
import { analyze, freshWhoop, recoveryZone, verdict } from '../core/analysis.js';
import { nextWorkout, todaysWorkouts } from '../core/workouts.js';
import { describeWeather } from '../services/weather.js';
import { esc, icon, ring } from './dom.js';

const NOTE_ICONS = { good: 'good', info: 'info', warn: 'warn' };
const HOURLY_SHOWN = 8;

function metric(value, unit, label) {
  return `<div class="metric"><span class="metric-value num">${value}<small>${unit}</small></span><span class="metric-label">${label}</span></div>`;
}

/** 45 -> ['45', 'min'] ; 105 -> ['1:45', 'h'] */
export function durationParts(minutes) {
  const total = Math.round(minutes);
  return total < 60 ? [String(total), 'min'] : [`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`, 'h'];
}

function workoutMetrics(workout) {
  return `<div class="metrics">
    ${workout.distance_km ? metric(kmText(workout.distance_km), 'km', 'Distance') : ''}
    ${workout.duration_min ? metric(...durationParts(workout.duration_min), 'Durée') : ''}
    ${workout.pace_s ? metric(paceText(workout.pace_s), '/km', 'Allure') : ''}
  </div>`;
}

function heroCard(state, today) {
  const workouts = state.data?.workouts || [];
  const [workout] = todaysWorkouts(workouts, today);
  if (workout) {
    const action = canUseWorkout(workout)
      ? `<button type="button" class="btn btn-primary" data-action="plan-workout" data-date="${esc(workout.date)}">${icon('map')}Tracer la boucle</button>`
      : `<div class="chip chip-court">${icon('court')}Au stade : pas de boucle</div>`;
    return `<article class="card hero kind-${esc(workout.kind)}">
      <div class="hero-glow" aria-hidden="true"></div>
      <span class="eyebrow">Kotcha · Aujourd'hui</span>
      <h2 class="hero-title">${esc(workout.title)}</h2>
      <span class="hero-kind">${esc(KIND_LABELS[workout.kind] || workout.kind)}</span>
      ${workoutMetrics(workout)}
      ${action}
    </article>`;
  }
  const next = nextWorkout(workouts, today);
  const nextLine = next
    ? `<p class="hero-next">Prochaine séance : <b>${esc(dayLabel(next.date, today))}</b> · ${esc(next.title)}</p>`
    : '<p class="hero-next">Aucune séance Kotcha prévue cette semaine.</p>';
  return `<article class="card hero hero-rest">
    <div class="hero-glow" aria-hidden="true"></div>
    <span class="eyebrow">Kotcha · Aujourd'hui</span>
    <h2 class="hero-title">Repos</h2>
    ${nextLine}
    <button type="button" class="btn btn-secondary" data-action="goto-loop">${icon('map')}Courir quand même</button>
  </article>`;
}

function recoveryCard(whoop) {
  const zone = recoveryZone(whoop?.recovery_pct);
  const pct = whoop?.recovery_pct;
  return `<article class="card tile zone-${zone}">
    <span class="tile-label">${icon('bolt')}Récupération</span>
    <div class="ring-wrap">${ring(pct)}<span class="ring-text num">${Number.isFinite(pct) ? `${Math.round(pct)}<small>%</small>` : '—'}</span></div>
    <span class="tile-sub">${whoop ? `HRV ${Math.round(whoop.hrv_ms ?? 0)} ms · FC ${Math.round(whoop.rhr_bpm ?? 0)}` : 'WHOOP non synchronisé'}</span>
  </article>`;
}

function sleepCard(whoop) {
  const hours = whoop?.sleep_hours;
  const h = Number.isFinite(hours) ? Math.floor(hours) : null;
  const m = Number.isFinite(hours) ? Math.round((hours - h) * 60) : null;
  const perf = whoop?.sleep_performance_pct;
  return `<article class="card tile tile-sleep">
    <span class="tile-label">${icon('bed')}Sommeil</span>
    <span class="tile-big num">${h === null ? '—' : `${h}<small>h</small>${String(m).padStart(2, '0')}`}</span>
    <div class="bar" style="--v:${Number.isFinite(perf) ? perf / 100 : 0}"><span></span></div>
    <span class="tile-sub">${Number.isFinite(perf) ? `Performance ${Math.round(perf)} %` : 'Pas de nuit enregistrée'}</span>
  </article>`;
}

function adviceCard(state, whoop, today, now) {
  const [workout] = todaysWorkouts(state.data?.workouts || [], today);
  const call = verdict(whoop);
  let notes = [];
  if (workout && canUseWorkout(workout)) {
    const session = { kind: workout.kind, label: KIND_LABELS[workout.kind], paceS: workout.pace_s || 360, distanceKm: workout.distance_km, durationMin: workout.duration_min || Math.round((workout.distance_km * (workout.pace_s || 360)) / 60) };
    notes = analyze(session, whoop, state.weather, now).filter((note) => note.tone !== 'summary' && !/récupération/i.test(note.text));
  } else if (state.weather) {
    notes = analyze({ label: '', durationMin: 45, distanceKm: 0, paceS: 360 }, null, state.weather, now).slice(1);
  }
  return `<article class="card advice tone-${call.tone}">
    <div class="advice-head">${icon(NOTE_ICONS[call.tone])}<div><h3>${esc(call.title)}</h3><p>${esc(call.text)}</p></div></div>
    ${notes.length ? `<ul class="notes">${notes.map((note) => `<li class="note tone-${note.tone}">${icon(NOTE_ICONS[note.tone] || 'info')}<span>${esc(note.text)}</span></li>`).join('')}</ul>` : ''}
  </article>`;
}

function weatherCard(state) {
  if (!state.weather) {
    const message = state.weatherError || (state.data?.home ? 'Chargement de la météo…' : 'Météo dès que le départ est connu.');
    return `<article class="card weather"><span class="tile-label">${icon('cloudSun')}Météo</span><p class="muted">${esc(message)}</p></article>`;
  }
  const { current, hourly } = state.weather;
  const now = describeWeather(current.code, current.isDay);
  const hours = hourly.slice(0, HOURLY_SHOWN).map((hour, index) => {
    const look = describeWeather(hour.code, true);
    const label = index === 0 ? 'Maint.' : `${new Date(hour.time).getHours()} h`;
    return `<li><span class="h-time">${label}</span>${icon(look.icon, `wx wx-${look.icon}`)}<span class="h-temp num">${Math.round(hour.tempC)}°</span>
      <span class="h-rain${hour.precipProb >= 30 ? ' wet' : ''}">${hour.precipProb >= 30 ? `${hour.precipProb} %` : ''}</span></li>`;
  }).join('');
  return `<article class="card weather">
    <div class="weather-now">
      ${icon(now.icon, `wx wx-big wx-${now.icon}`)}
      <div><span class="weather-temp num">${Math.round(current.tempC)}°</span>
      <span class="weather-desc">${esc(now.label)} · ressenti ${Math.round(current.feelsC)}°</span>
      <span class="weather-desc">${icon('wind')}${Math.round(current.windKmh)} km/h${state.weather.sunset ? ` · coucher ${new Date(state.weather.sunset).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
    </div>
    <ul class="hourly">${hours}</ul>
  </article>`;
}

export function syncLine(state) {
  if (state.dataError) return `<p class="sync-line warn">${icon('wifiOff')}${esc(state.dataError)}</p>`;
  const at = state.data?.received_at;
  return at ? `<p class="sync-line">${icon('refresh')}Synchronisé depuis le Mac ${esc(ageText(at))}</p>` : '';
}

export function renderToday(state, today, now) {
  const whoop = freshWhoop(state.data?.whoop?.at(-1), today);
  return `${heroCard(state, today)}
    <div class="grid-2">${recoveryCard(whoop)}${sleepCard(whoop)}</div>
    ${adviceCard(state, whoop, today, now)}
    ${weatherCard(state)}
    ${syncLine(state)}`;
}
