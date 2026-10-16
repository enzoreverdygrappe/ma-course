// Course — app shell: state, routing between tabs, data loading and actions.

import { dateKey, longDate } from './core/format.js';
import { analyze, freshWhoop } from './core/analysis.js';
import { canUseWorkout, deriveSession, formFromWorkout, stepForm } from './core/session.js';
import { googleMapsUrl, planLoop } from './core/loop.js';
import { knownPoint, originLabel, placeOrigin, withRecentPlace } from './core/origin.js';
import { AuthError, cachedState, fetchState, getCode, isStale, refreshState, setCode } from './services/api.js';
import { MIN_QUERY, searchPlaces } from './services/geocode.js';
import { fetchWeather } from './services/weather.js';
import { osrmRoute } from './services/router.js';
import { loadHistory, loadPrefs, saveHistory, savePrefs, withPlan } from './services/history.js';
import { $, icon, toast } from './ui/dom.js';
import { renderToday } from './ui/today.js';
import { badgeHtml, loopShell, renderLoopPanel } from './ui/loop-view.js';
import { renderWeek } from './ui/week.js';
import { renderLock, renderSettings } from './ui/settings.js';
import { renderOriginSheet, renderResults } from './ui/origin-sheet.js';
import { drawPlan, mountMap, refreshMap, unmountMap } from './ui/map.js';

const ROUTES = {
  today: { title: "Aujourd'hui", tab: 'today', icon: 'today', label: "Aujourd'hui" },
  loop: { title: 'Boucle', tab: 'loop', icon: 'map', label: 'Boucle' },
  week: { title: 'Semaine', tab: 'week', icon: 'week', label: 'Semaine' },
};
const GEO_TIMEOUT_MS = 10000;
const REFRESH_EVERY_MS = 10 * 60 * 1000;
const REPEAT_DELAY_MS = 420;
const REPEAT_EVERY_MS = 90;
const FALLBACK_CENTER = [48.8566, 2.3522];
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_SEARCH = { query: '', results: [], loading: false, error: '' };

const prefs = loadPrefs();
const history = loadHistory();
let state = {
  route: 'today',
  locked: false,
  lockMessage: '',
  data: cachedState(),
  dataError: '',
  weather: null,
  weatherError: '',
  form: prefs.form,
  origin: prefs.origin,
  places: prefs.places,
  here: null,
  refreshing: false,
  sheet: null,
  search: EMPTY_SEARCH,
  plan: history[0] || null,
  history,
  busy: false,
  planError: '',
};

function setState(patch) {
  state = { ...state, ...patch };
}

const today = () => dateKey();
const homePoint = () => (state.data?.home ? [state.data.home.lat, state.data.home.lon] : null);
/** Start point when known without asking the GPS (selected address, home, last position). */
const startPoint = () => knownPoint(state.origin, state.data?.home, state.here);
const weatherPoint = () => startPoint() || state.here || homePoint() || FALLBACK_CENTER;

/* ---------------------------------------------------------------- render */

function renderTabs() {
  $('#tabs').innerHTML = Object.entries(ROUTES).map(([id, route]) => `
    <a href="#/${id}" class="tab${state.route === id ? ' active' : ''}" aria-current="${state.route === id ? 'page' : 'false'}">
      ${icon(route.icon)}<span>${route.label}</span></a>`).join('');
}

function renderHeader() {
  const route = ROUTES[state.route];
  $('#title').textContent = route.title;
  $('#subtitle').textContent = state.route === 'today' ? longDate() : '';
}

function renderLoop() {
  if (!$('#map-card')) {
    unmountMap();
    $('#view').innerHTML = loopShell();
    mountMap($('#map'), startPoint() || homePoint() || FALLBACK_CENTER);
    drawPlan(state.plan, startPoint());
  }
  $('#loop-panel').innerHTML = renderLoopPanel(state, today());
  const badge = $('#map-badge');
  badge.innerHTML = badgeHtml(state.plan);
  badge.hidden = !state.plan;
}

function render() {
  document.body.classList.toggle('is-locked', state.locked);
  if (state.locked) {
    unmountMap();
    $('#view').innerHTML = renderLock(state.lockMessage);
    $('#lock-input')?.focus();
    return;
  }
  renderHeader();
  renderTabs();
  $('#view').dataset.route = state.route;
  if (state.route === 'loop') return renderLoop();
  unmountMap();
  $('#view').innerHTML = state.route === 'week'
    ? renderWeek(state, today())
    : renderToday(state, today(), new Date());
}

/* ------------------------------------------------------------------ data */

async function loadWeather() {
  const point = weatherPoint();
  try {
    setState({ weather: await fetchWeather(point), weatherError: '' });
  } catch (error) {
    setState({ weatherError: state.weather ? '' : 'Météo indisponible pour le moment.' });
    console.warn('Weather failed', error);
  }
  if (state.route !== 'loop') render();
}

function lockOut(error) {
  setCode(null);
  setState({ locked: true, lockMessage: error.message, refreshing: false });
  render();
}

/** Re-renders whatever shows the data: the current view and an open settings sheet. */
function renderData() {
  render();
  if (state.sheet === 'settings') $('#settings').innerHTML = settingsHtml();
}

async function loadData() {
  if (!getCode()) {
    setState({ locked: true });
    return render();
  }
  try {
    setState({ data: await fetchState(), dataError: '', locked: false });
  } catch (error) {
    if (error instanceof AuthError) return lockOut(error);
    setState({ dataError: state.data ? 'Hors ligne : dernières données connues' : error.message });
  }
  render();
  loadWeather();
  if (!state.dataError && isStale(state.data)) refresh();
}

/** Vercel fetches Garmin (Kotcha) and WHOOP now; takes a few seconds. */
async function refresh() {
  if (state.refreshing || state.locked) return;
  setState({ refreshing: true });
  renderData();
  try {
    setState({ data: await refreshState(), dataError: '', refreshing: false });
  } catch (error) {
    if (error instanceof AuthError) return lockOut(error);
    setState({ refreshing: false });
    toast(error.message || 'Actualisation impossible');
  }
  renderData();
}

/* --------------------------------------------------------------- actions */

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Localisation indisponible sur cet appareil'));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      () => reject(new Error('Position refusée ou introuvable : autorise la localisation')),
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 60000 },
    );
  });
}

async function originPoint() {
  const label = originLabel(state.origin, state.data?.home);
  if (state.origin.type === 'here') {
    const point = await locate();
    setState({ here: point });
    return { point, label };
  }
  const point = startPoint();
  if (!point) throw new Error('Départ « Maison » inconnu : choisis une adresse ou « Ma position »');
  return { point, label };
}

async function tracePlan(seed, kotcha = null) {
  if (state.busy) return;
  let session;
  try {
    session = deriveSession(state.form);
  } catch (error) {
    setState({ planError: error.message });
    return render();
  }
  setState({ busy: true, planError: '' });
  render();
  try {
    const origin = await originPoint();
    const loop = await planLoop(origin.point, session.distanceKm * 1000, seed, osrmRoute);
    const whoop = freshWhoop(state.data?.whoop?.at(-1), today());
    const plan = {
      createdAt: new Date().toISOString(),
      seed,
      session,
      kotcha,
      origin,
      route: { distanceM: Math.round(loop.distanceM), coords: loop.coords, waypoints: loop.waypoints },
      url: googleMapsUrl(origin.point, loop.waypoints),
      notes: analyze(session, whoop, state.weather, new Date()),
    };
    const nextHistory = withPlan(state.history, plan);
    saveHistory(nextHistory);
    setState({ plan, history: nextHistory, busy: false });
    if (state.route === 'loop') drawPlan(plan);
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Le calcul a pris trop de temps : réessaie.' : error.message;
    setState({ busy: false, planError: message || 'Itinéraire indisponible' });
  }
  render();
}

function updateForm(form) {
  setState({ form });
  savePrefs(state);
  if (state.route === 'loop') $('#loop-panel').innerHTML = renderLoopPanel(state, today());
}

function useWorkout(date) {
  const workout = (state.data?.workouts || []).find((w) => w.date === date && canUseWorkout(w));
  if (!workout) return;
  updateForm(formFromWorkout(state.form, workout));
  if (location.hash !== '#/loop') location.hash = '#/loop';
  tracePlan(0, workout.title);
}

const settingsHtml = () => renderSettings({ ...state, originLabel: originLabel(state.origin, state.data?.home) }, today());

function openSheet(kind) {
  const sheet = $('#settings');
  setState({ sheet: kind, search: kind === 'origin' ? EMPTY_SEARCH : state.search });
  sheet.innerHTML = kind === 'origin' ? renderOriginSheet(state) : settingsHtml();
  sheet.setAttribute('aria-label', kind === 'origin' ? 'Départ' : 'Réglages');
  sheet.hidden = false;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => sheet.classList.add('open'));
  $('#scrim').hidden = false;
}

const openSettings = () => openSheet('settings');

function closeSettings() {
  const sheet = $('#settings');
  setState({ sheet: null });
  sheet.classList.remove('open');
  $('#scrim').hidden = true;
  setTimeout(() => { if (!state.sheet) sheet.hidden = true; }, 320);
}

/* ------------------------------------------------------- start picker */

let searchTimer = null;
let searchSeq = 0;

function showResults() {
  const box = $('#origin-results');
  if (box) box.innerHTML = renderResults(state.search, state.origin);
}

async function runSearch(query) {
  const seq = ++searchSeq;
  setState({ search: { ...state.search, query, loading: true, error: '' } });
  showResults();
  try {
    const results = await searchPlaces(query, state.here || startPoint() || homePoint());
    if (seq !== searchSeq) return;   // a newer search already answered
    setState({ search: { query, results, loading: false, error: '' } });
  } catch (error) {
    if (seq !== searchSeq) return;
    const message = error.name === 'TimeoutError' ? 'La recherche a pris trop de temps : réessaie.' : 'Recherche d’adresse indisponible pour le moment.';
    setState({ search: { query, results: [], loading: false, error: message } });
  }
  showResults();
}

function onSearchInput(event) {
  if (event.target.id !== 'origin-search') return;
  const query = event.target.value;
  clearTimeout(searchTimer);
  if (query.trim().length < MIN_QUERY) {
    searchSeq += 1;
    setState({ search: { ...EMPTY_SEARCH, query } });
    return showResults();
  }
  searchTimer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
}

function chooseOrigin(origin, place = null) {
  const places = place ? withRecentPlace(state.places, place) : state.places;
  // A new start point makes the current loop stale: the map shows the new start instead.
  const moved = !state.plan || origin.type === 'here' || state.plan.origin.label !== originLabel(origin, state.data?.home);
  setState({ origin, places, plan: moved ? null : state.plan, planError: '' });
  savePrefs(state);
  closeSettings();
  if (state.route === 'loop') {
    drawPlan(state.plan, startPoint());
    renderLoop();
  } else {
    render();
  }
  loadWeather();
}

function pickOrigin(el) {
  const index = Number(el.dataset.index);
  const kind = el.dataset.kind;
  if (kind === 'here') return chooseOrigin({ type: 'here' });
  if (kind === 'home') return chooseOrigin({ type: 'home' });
  const place = kind === 'recent' ? state.places[index] : state.search.results[index];
  if (place) chooseOrigin(placeOrigin(place), place);
}

const ACTIONS = {
  'plan': () => tracePlan(0, state.plan?.kotcha || null),
  'reroll': () => tracePlan((state.plan?.seed || 0) + 1, state.plan?.kotcha || null),
  'plan-workout': (el) => useWorkout(el.dataset.date),
  'goto-loop': () => { location.hash = '#/loop'; },
  'open-settings': openSettings,
  'open-origin': () => openSheet('origin'),
  'pick-origin': pickOrigin,
  'refresh': () => refresh(),
  'close-settings': closeSettings,
  'open-history': (el) => {
    setState({ plan: state.history[Number(el.dataset.index)] || state.plan });
    location.hash = '#/loop';
    if (state.route === 'loop') { drawPlan(state.plan); render(); }
  },
  'logout': () => {
    setCode(null);
    closeSettings();
    setState({ locked: true, lockMessage: '' });
    render();
  },
};

function onClick(event) {
  const seg = event.target.closest('[data-seg]');
  if (seg) {
    const { seg: group, value } = seg.dataset;
    if (group === 'kind' || group === 'mode') updateForm({ ...state.form, [group]: value });
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = ACTIONS[target.dataset.action];
  if (action) action(target);
}

/** Press and hold − / + to scroll the value. */
function setupSteppers() {
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };
  const step = (field, direction) => {
    const next = stepForm(state.form, field, direction);
    if (next.values[next.kind][field] === state.form.values[state.form.kind][field]) return false;
    updateForm(next);
    return true;
  };
  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    event.preventDefault();
    const { step: field, dir } = button.dataset;
    if (!step(field, Number(dir))) return;
    const repeat = () => { if (step(field, Number(dir))) timer = setTimeout(repeat, REPEAT_EVERY_MS); };
    timer = setTimeout(repeat, REPEAT_DELAY_MS);
  });
  ['pointerup', 'pointercancel'].forEach((type) => document.addEventListener(type, stop));
}

function onSubmit(event) {
  if (event.target.id === 'origin-form') {
    event.preventDefault();
    clearTimeout(searchTimer);
    $('#origin-search')?.blur();
    const { query } = state.search;
    if (query.trim().length >= MIN_QUERY) runSearch(query);
    return;
  }
  if (event.target.id !== 'lock-form') return;
  event.preventDefault();
  setCode($('#lock-input').value);
  setState({ lockMessage: '' });
  loadData();
}

/* ------------------------------------------------------------------ boot */

function readRoute() {
  const id = location.hash.replace(/^#\/?/, '');
  return ROUTES[id] ? id : 'today';
}

/** A link like https://…/#code=XXXX logs the phone in once, then the code leaves the URL. */
function acceptCodeFromUrl() {
  const match = location.hash.match(/code=([^&]+)/);
  if (!match) return;
  setCode(decodeURIComponent(match[1]));
  replaceHash('#/today');
}

function replaceHash(hash) {
  window.history.replaceState(null, '', `${location.pathname}${hash}`);
}

function boot() {
  acceptCodeFromUrl();
  setState({ route: readRoute() });
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onSearchInput);
  $('#scrim').addEventListener('click', closeSettings);
  setupSteppers();
  window.addEventListener('hashchange', () => {
    setState({ route: readRoute() });
    render();
    window.scrollTo({ top: 0 });
  });
  window.addEventListener('resize', refreshMap);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !state.locked) loadData();
  });
  setInterval(() => { if (!state.locked && document.visibilityState === 'visible') loadData(); }, REFRESH_EVERY_MS);
  render();
  loadData();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('SW registration failed', error));
  }
}

boot();
