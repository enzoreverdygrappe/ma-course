// Foot routing via the public OSRM server of OpenStreetMap Germany (free, no key, CORS open).

const ROUTER_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
const TIMEOUT_MS = 15000;

/** [[lat, lon], ...] -> { distanceM, coords: [[lat, lon], ...] } */
export async function osrmRoute(points) {
  const path = points.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const response = await fetch(`${ROUTER_URL}${path}?overview=full&geometries=geojson`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Itinéraire indisponible (HTTP ${response.status})`);
  const payload = await response.json();
  if (payload.code !== 'Ok' || !payload.routes?.length) throw new Error('Aucun itinéraire trouvé ici');
  const [route] = payload.routes;
  return { distanceM: route.distance, coords: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]) };
}
