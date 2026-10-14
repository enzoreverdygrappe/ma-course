# Course

App iPhone (PWA, vanilla JS, sans build) issue de l'onglet Course de `~/pi-tracker` :
séance Kotcha du jour, forme WHOOP, météo, conseils, et boucle de la bonne distance
au départ de la maison ou de la position GPS, ouverte ensuite dans Google Maps.

Prod : https://ma-course-six.vercel.app (code d'accès : `APP_CODE` dans `.env.local`,
ou le lien `https://ma-course-six.vercel.app/#code=<APP_CODE>` à ouvrir une fois sur l'iPhone).

## Flux de données

```
Kotcha → Garmin Connect ─┐
WHOOP API ───────────────┤ pi-tracker sur le Mac (cron, jetons OAuth locaux)
                         └→ scripts/publish_course.py (cron :15) → POST /api/sync
                                                              → Vercel Blob privé
iPhone → GET /api/state (X-Course-Code) ; OSRM + Open-Meteo appelés directement
```

Les connecteurs restent dans pi-tracker : les jetons Garmin et WHOOP tournent à chaque
rafraîchissement, ils ne doivent vivre qu'à un seul endroit.

## Fichiers

- `js/core/` : logique pure (séance, analyse, boucle, semaine) — portée de `run_plan.py` / `run_route.py`
- `js/services/` : API, OSRM, Open-Meteo, historique local
- `js/ui/` : vues Aujourd'hui / Boucle / Semaine / Réglages, carte Leaflet (vendored)
- `api/` : fonctions Vercel `state` (lecture) et `sync` (écriture, `Bearer SYNC_SECRET`)

## Dev

```bash
npm install
npm run dev          # http://localhost:5191, code « dev », données lues dans ~/pi-tracker/data
npm test             # tests unitaires
node tests/e2e/app.e2e.mjs <dossierCaptures> [url] [code]   # e2e iPhone (Playwright)
```

Déployer : incrémenter `VERSION` dans `sw.js`, puis `vercel deploy --prod`.
Variables Vercel : `APP_CODE`, `SYNC_SECRET`, `BLOB_READ_WRITE_TOKEN` (store privé `ma-course-data`, cdg1).
