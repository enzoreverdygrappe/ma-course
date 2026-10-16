// "Départ" sheet: Ma position, Maison, recent addresses and an address search (BAN / IGN).

import { isSameOrigin, placeOrigin } from '../core/origin.js';
import { MIN_QUERY } from '../services/geocode.js';
import { esc, icon } from './dom.js';

function option({ kind, index = 0, iconName, label, detail = '', selected = false }) {
  return `<button type="button" class="s-row place-row${selected ? ' selected' : ''}" data-action="pick-origin" data-kind="${kind}" data-index="${index}" aria-pressed="${selected}">
    <span class="place-icon">${icon(iconName)}</span>
    <span class="place-text"><b>${esc(label)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</span>
    ${selected ? icon('check', 'place-check') : ''}
  </button>`;
}

function shortcuts(state) {
  const { origin, places } = state;
  const home = state.data?.home;
  const rows = [
    option({ kind: 'here', iconName: 'location', label: 'Ma position', detail: 'GPS de l’iPhone', selected: origin.type === 'here' }),
    home ? option({ kind: 'home', iconName: 'house', label: home.label || 'Maison', detail: 'Départ enregistré', selected: origin.type === 'home' }) : '',
  ];
  const recent = places.map((place, index) => option({
    kind: 'recent', index, iconName: 'clock', label: place.label, detail: place.detail, selected: isSameOrigin(origin, place),
  }));
  return `<div class="card list-card">${rows.join('')}</div>
    ${recent.length ? `<h3 class="section-title">Récents</h3><div class="card list-card">${recent.join('')}</div>` : ''}`;
}

/** Search results block (also used alone while typing). */
export function renderResults(search, origin) {
  if (search.query.trim().length < MIN_QUERY) return '';
  if (search.error) return `<p class="error-line">${icon('warn')}${esc(search.error)}</p>`;
  if (search.loading && !search.results.length) return '<p class="footnote"><span class="spinner" aria-hidden="true"></span>Recherche…</p>';
  if (!search.results.length) return '<p class="footnote">Aucune adresse trouvée.</p>';
  return `<div class="card list-card">${search.results.map((place, index) => option({
    kind: 'result', index, iconName: 'location', label: place.label, detail: place.detail, selected: isSameOrigin(origin, placeOrigin(place)),
  })).join('')}</div>`;
}

export function renderOriginSheet(state) {
  return `<div class="sheet-grabber" aria-hidden="true"></div>
    <header class="sheet-head"><h2>Départ</h2>
      <button type="button" class="icon-btn glass" data-action="close-settings" aria-label="Fermer">${icon('close')}</button></header>
    <form id="origin-form" class="search-field" role="search" autocomplete="off">
      ${icon('search')}
      <input id="origin-search" type="search" enterkeyhint="search" placeholder="Adresse, gare, parc…" aria-label="Rechercher une adresse" value="${esc(state.search.query)}" autocapitalize="off" spellcheck="false">
    </form>
    <div id="origin-results">${renderResults(state.search, state.origin)}</div>
    <div id="origin-shortcuts">${shortcuts(state)}</div>`;
}
