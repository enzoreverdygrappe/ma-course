// Running loop of a given distance from home and back, ported from pi-tracker's run_route.py.
// Three waypoints on a circle through home; the foot router does the streets; the radius is
// rescaled until the route lands within ±4 % of the target.

export const EARTH_RADIUS_M = 6_371_000;
const INSCRIBED_SQUARE_RATIO = 4 * Math.SQRT2; // perimeter / radius of the inscribed square
const INITIAL_DETOUR = 1.25;                   // streets vs crow flight, first try
export const DISTANCE_TOLERANCE = 0.04;
const MAX_ATTEMPTS = 6;
const GOLDEN_ANGLE_DEG = 137.5;                // seed -> well spread orientations

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (value) => (value * 180) / Math.PI;

/** Haversine distance in metres between [lat, lon] points. */
export function distanceM(a, b) {
  const [lat1, lon1, lat2, lon2] = [...a, ...b].map(rad);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Point reached from origin after `distance` metres heading `bearingDeg`. */
export function destination(origin, distance, bearingDeg) {
  const [lat1, lon1] = origin.map(rad);
  const bearing = rad(bearingDeg);
  const angular = distance / EARTH_RADIUS_M;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lat2), deg(lon2)];
}

/** Three corners of a square inscribed in a circle through home (home is the fourth). */
export function loopWaypoints(home, radiusM, bearingDeg) {
  const center = destination(home, radiusM, bearingDeg);
  return [-90, 0, 90].map((offset) => destination(center, radiusM, bearingDeg + offset));
}

export const bearingForSeed = (seed) => (seed * GOLDEN_ANGLE_DEG) % 360;

/** Best loop within tolerance (or the closest try). `router(points)` → { distanceM, coords }. */
export async function planLoop(home, targetM, seed, router) {
  const bearing = bearingForSeed(seed);
  let radius = targetM / (INSCRIBED_SQUARE_RATIO * INITIAL_DETOUR);
  let best = null;
  const errorOf = (route) => Math.abs(route.distanceM - targetM) / targetM;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const waypoints = loopWaypoints(home, radius, bearing);
    const route = await router([home, ...waypoints, home]);
    const candidate = { ...route, waypoints, bearing: Math.round(bearing * 10) / 10 };
    if (!best || errorOf(candidate) < errorOf(best)) best = candidate;
    if (errorOf(route) <= DISTANCE_TOLERANCE || route.distanceM <= 0) break;
    radius *= targetM / route.distanceM;
  }
  return best;
}

const fmt = ([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

/** Google Maps walking directions: home -> 3 waypoints -> home (3 points max on mobile). */
export function googleMapsUrl(home, waypoints) {
  const query = new URLSearchParams({
    api: '1',
    origin: fmt(home),
    destination: fmt(home),
    waypoints: waypoints.map(fmt).join('|'),
    travelmode: 'walking',
  });
  return `https://www.google.com/maps/dir/?${query}`;
}
