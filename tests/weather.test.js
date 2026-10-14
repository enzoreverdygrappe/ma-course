import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeWeather, normalizeWeather } from '../js/services/weather.js';

test('normalizes Open-Meteo: current conditions and the next hours only', () => {
  const now = new Date('2026-10-14T09:20:00');
  const weather = normalizeWeather({
    current: { temperature_2m: 14.2, apparent_temperature: 12.9, weather_code: 3, wind_speed_10m: 11, is_day: 1 },
    hourly: {
      time: ['2026-10-14T08:00', '2026-10-14T09:00', '2026-10-14T10:00'],
      temperature_2m: [13, 14, 15], weather_code: [3, 3, 61], precipitation_probability: [0, 10, 80],
    },
    daily: { sunset: ['2026-10-14T18:52', '2026-10-15T18:50'] },
  }, now);
  assert.equal(weather.current.tempC, 14.2);
  assert.deepEqual(weather.hourly.map((h) => h.time), ['2026-10-14T09:00', '2026-10-14T10:00']);
  assert.equal(weather.hourly[1].precipProb, 80);
  assert.equal(weather.sunset, '2026-10-14T18:52');
});

test('maps WMO codes to French labels and day/night icons', () => {
  assert.deepEqual(describeWeather(0, true), { label: 'Ensoleillé', icon: 'sun' });
  assert.deepEqual(describeWeather(0, false), { label: 'Ensoleillé', icon: 'moon' });
  assert.equal(describeWeather(63).label, 'Pluie');
  assert.equal(describeWeather(999).label, '—');
});
