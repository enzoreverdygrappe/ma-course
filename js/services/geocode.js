// Address search for the start point: French national address base (BAN, Géoplateforme IGN).
// Free, no key, CORS open; addresses and places (stations, parks…), the ones near the
// current point first.

const SEARCH_URL = 'https://data.geopf.fr/geocodage/search';
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 6;
export const MIN_QUERY = 3;

const first = (value) => (Array.isArray(value) ? value[0] : value) || '';

/** Label and detail line of a BAN address or an IGN point of interest. */
function describe(props) {
  if (props._type === 'poi') {
    return { label: props.toponym || first(props.name), detail: [first(props.category), first(props.city)].filter(Boolean).join(' · ') };
  }
  if (props.type === 'housenumber' || props.type === 'street') {
    return { label: props.name, detail: [props.postcode, props.city].filter(Boolean).join(' ') };
  }
  return { label: props.label, detail: props.context || '' };
}

/** Places from a GeoJSON answer: { label, detail, lat, lon } (pure). */
export function normalizePlaces(geojson) {
  return (geojson?.features || []).flatMap((feature) => {
    const [lon, lat] = feature?.geometry?.coordinates || [];
    const { label, detail } = describe(feature?.properties || {});
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !label) return [];
    return [{ label: String(label), detail: String(detail), lat, lon }];
  }).slice(0, MAX_RESULTS);
}

export async function searchPlaces(query, near = null) {
  const text = String(query || '').trim();
  if (text.length < MIN_QUERY) return [];
  const params = new URLSearchParams({ q: text, limit: String(MAX_RESULTS), autocomplete: '1', index: 'address,poi' });
  if (near) {
    params.set('lat', near[0].toFixed(4));
    params.set('lon', near[1].toFixed(4));
  }
  const response = await fetch(`${SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Recherche d’adresse indisponible (HTTP ${response.status})`);
  return normalizePlaces(await response.json());
}
