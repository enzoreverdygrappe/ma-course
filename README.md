# Course

App iPhone (PWA, vanilla JS, sans build) issue de l'onglet Course de `~/pi-tracker` :
séance Kotcha du jour, forme WHOOP, météo, conseils, et boucle de la bonne distance
au départ de la position GPS, de la maison ou d'une adresse cherchée (BAN / IGN),
ouverte ensuite dans Google Maps.

Prod : https://ma-course-six.vercel.app (code d'accès : `APP_CODE` dans `.env.local`,
ou le lien `https://ma-course-six.vercel.app/#code=<APP_CODE>` à ouvrir une fois sur l'iPhone).

## Flux de données

```
Kotcha → Garmin Connect ─┐
WHOOP API ───────────────┤ Vercel /api/refresh : à l'ouverture de l'app (données > 20 min),
                         │ bouton « Actualiser », cron quotidien 4 h UTC → Vercel Blob privé
iPhone → GET /api/state (X-Course-Code) ; OSRM, Open-Meteo, Géoplateforme appelés directement
Mac (pi-tracker) → GET /api/token (Bearer SYNC_SECRET) : jeton d'accès prêté, jamais le refresh
```

Les jetons de rafraîchissement Garmin et WHOOP changent à chaque utilisation : ils ne vivent
que dans le Blob (`course/tokens/*.json`), protégés par un verrou (`course/locks/`). Après
un nouveau `garmin_workouts.py auth` ou `whoop.py auth` sur le Mac, les jetons sont envoyés
ici (POST /api/token) et supprimés du Mac.

## Fichiers

- `js/core/` : logique pure (séance, analyse, boucle, semaine) — portée de `run_plan.py` / `run_route.py`
- `js/services/` : API, OSRM, Open-Meteo, historique local
- `js/ui/` : vues Aujourd'hui / Boucle / Semaine / Réglages, carte Leaflet (vendored)
- `api/` : fonctions Vercel `state` (lecture), `refresh` (Garmin + WHOOP), `token` (pour le Mac) ;
  `_garmin.js` / `_whoop.js` portés de pi-tracker, `_store.js` (Blob + verrou)

## Dev

```bash
npm install
npm run dev          # http://localhost:5191, code « dev », données lues dans ~/pi-tracker/data
npm test             # tests unitaires
node tests/e2e/app.e2e.mjs <dossierCaptures> [url] [code]   # e2e iPhone (Playwright)
```

Déployer : incrémenter `VERSION` dans `sw.js`, puis `vercel deploy --prod`.
Variables Vercel : `APP_CODE`, `SYNC_SECRET`, `CRON_SECRET`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`,
`BLOB_READ_WRITE_TOKEN` (store privé `ma-course-data`, cdg1).
