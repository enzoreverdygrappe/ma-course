// Leaflet map of the loop (Leaflet 1.9.4 vendored, OSM tiles toned down in CSS).

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '© OpenStreetMap';
const DEFAULT_ZOOM = 14;
const FIT_PADDING = [36, 36];

let map = null;
let layers = [];
let host = null;

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function mountMap(element, center) {
  if (!window.L || !element) return null;
  if (map && host === element) return map;
  map?.remove();
  host = element;
  map = window.L.map(element, { zoomControl: false, attributionControl: true }).setView(center, DEFAULT_ZOOM);
  window.L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  map.attributionControl.setPrefix(false);
  return map;
}

export function unmountMap() {
  map?.remove();
  map = null;
  host = null;
  layers = [];
}

function startMarker(point) {
  return window.L.marker(point, {
    interactive: false,
    icon: window.L.divIcon({ className: 'start-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
  });
}

/** Draws the route (or just the start point when there is no plan yet). */
export function drawPlan(plan, origin) {
  if (!map) return;
  layers.forEach((layer) => layer.remove());
  layers = [];
  map.invalidateSize();
  if (!plan) {
    if (origin) {
      layers = [startMarker(origin).addTo(map)];
      map.setView(origin, DEFAULT_ZOOM);
    }
    return;
  }
  const color = cssVar('--route', '#34c759');
  const halo = window.L.polyline(plan.route.coords, { color, weight: 12, opacity: 0.22, interactive: false });
  const line = window.L.polyline(plan.route.coords, { color, weight: 5, opacity: 1, lineJoin: 'round', lineCap: 'round', interactive: false });
  layers = [halo, line, startMarker(plan.origin.point)].map((layer) => layer.addTo(map));
  map.fitBounds(line.getBounds(), { padding: FIT_PADDING });
}

export const refreshMap = () => map?.invalidateSize();
