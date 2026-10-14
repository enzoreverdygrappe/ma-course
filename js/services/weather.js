// Weather from Open-Meteo (free, no key), normalised for the analysis and the Today screen.

const API = 'https://api.open-meteo.com/v1/forecast';
const HOURS_AHEAD = 12;

export async function fetchWeather([lat, lon]) {
  const query = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    forecast_days: '2',
  });
  const response = await fetch(`${API}?${query}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Météo indisponible (HTTP ${response.status})`);
  return normalizeWeather(await response.json(), new Date());
}

/** Open-Meteo payload -> { current, hourly (next 12 h), sunset }. Pure. */
export function normalizeWeather(raw, now) {
  const current = raw.current || {};
  const hours = raw.hourly || {};
  const startOfHour = new Date(now);
  startOfHour.setMinutes(0, 0, 0);
  const hourly = (hours.time || [])
    .map((time, index) => ({
      time,
      tempC: hours.temperature_2m?.[index],
      code: hours.weather_code?.[index],
      precipProb: hours.precipitation_probability?.[index] ?? 0,
    }))
    .filter((hour) => Date.parse(hour.time) >= startOfHour.getTime())
    .slice(0, HOURS_AHEAD);
  const sunset = (raw.daily?.sunset || []).find((time) => Date.parse(time) > now.getTime()) || null;
  return {
    current: {
      tempC: current.temperature_2m,
      feelsC: current.apparent_temperature,
      code: current.weather_code,
      windKmh: current.wind_speed_10m,
      isDay: current.is_day !== 0,
    },
    hourly,
    sunset,
  };
}

const LABELS = [
  [[0], 'Ensoleillé', 'sun', 'moon'],
  [[1, 2], 'Éclaircies', 'cloudSun', 'cloudMoon'],
  [[3], 'Couvert', 'cloud'],
  [[45, 48], 'Brouillard', 'fog'],
  [[51, 53, 55, 56, 57], 'Bruine', 'drizzle'],
  [[61, 63, 66, 80, 81], 'Pluie', 'rain'],
  [[65, 67, 82], 'Forte pluie', 'heavyRain'],
  [[71, 73, 75, 77, 85, 86], 'Neige', 'snow'],
  [[95, 96, 99], 'Orage', 'storm'],
];

/** WMO code -> { label, icon } (icon names from js/ui/icons.js). */
export function describeWeather(code, isDay = true) {
  const match = LABELS.find(([codes]) => codes.includes(code));
  if (!match) return { label: '—', icon: 'cloud' };
  const [, label, dayIcon, nightIcon] = match;
  return { label, icon: !isDay && nightIcon ? nightIcon : dayIcon };
}
