// End-to-end check on an iPhone-sized viewport, with real OSRM routing and Open-Meteo.
// Usage: node tests/e2e/app.e2e.mjs <screenshotsDir> [baseUrl] [code]
// Locally: npm run dev (code "dev"). /api/state is mocked when a workout must be "today".

import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const [shots, BASE = 'http://localhost:5191/', CODE = 'dev'] = process.argv.slice(2);
if (!shots) throw new Error('Usage: app.e2e.mjs <screenshotsDir> [baseUrl] [code]');

const browser = await chromium.launch();
const errors = [];

async function newPage(colorScheme) {
  const context = await browser.newContext({
    ...devices['iPhone 13'], colorScheme, locale: 'fr-FR', timezoneId: 'Europe/Paris',
    geolocation: { latitude: 48.8566, longitude: 2.3522 }, permissions: ['geolocation'],
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|status of 401/.test(m.text())) errors.push(m.text()); });
  return page;
}

async function step(name, fn) {
  await fn();
  process.stdout.write(`✓ ${name}\n`);
}

const page = await newPage('dark');
const shot = (name, p = page) => p.screenshot({ path: `${shots}/${name}.png` });
await page.goto(BASE);

await step('asks for the access code and rejects a wrong one', async () => {
  await page.getByPlaceholder('Code d’accès').waitFor();
  await shot('01-code');
  await page.fill('#lock-input', 'mauvais');
  await page.click('#lock-form button');
  await page.getByText('Code d’accès incorrect').waitFor();
});

await step('opens Today with WHOOP, advice and weather', async () => {
  await page.fill('#lock-input', CODE);
  await page.click('#lock-form button');
  await page.locator('.hero').waitFor();
  await page.locator('.weather-temp').waitFor({ timeout: 15000 });
  assert.ok(await page.locator('.ring-text').textContent());
  await shot('02-aujourdhui');
});

await step('traces a loop of the right distance and links Google Maps', async () => {
  await page.click('a[href="#/loop"]');
  await page.locator('.form-card').waitFor();
  await page.click('[data-seg="mode"][data-value="distance"]');
  await page.click('[data-seg="origin"][data-value="home"]');
  const target = Number((await page.locator('.stepper-value').first().textContent()).replace(/[^\d,]/g, '').replace(',', '.'));
  await page.click('[data-action="plan"]');
  await page.locator('#map-badge:not([hidden])').waitFor({ timeout: 60000 });
  const km = Number((await page.locator('.badge-km').textContent()).replace(/[^\d,]/g, '').replace(',', '.'));
  assert.ok(Math.abs(km - target) / target < 0.1, `loop ${km} km for ${target} km`);
  const href = await page.locator('[data-action="open-maps"]').getAttribute('href');
  assert.equal(new URL(href).searchParams.get('waypoints').split('|').length, 3);
  await page.waitForTimeout(1200);
  await shot('03-boucle');
  await page.click('[data-action="reroll"]');
  await page.waitForFunction((old) => document.querySelector('[data-action="open-maps"]')?.href !== old, href, { timeout: 60000 });
  process.stdout.write(`  boucle de ${km} km pour ${target} km demandés\n`);
});

await step('loop from the current GPS position', async () => {
  await page.click('[data-seg="origin"][data-value="here"]');
  await page.click('[data-action="plan"]');
  await page.locator('.map-badge .eyebrow', { hasText: 'Ma position' }).waitFor({ timeout: 60000 });
});

await step('week lists 7 days and the traced loops', async () => {
  await page.click('a[href="#/week"]');
  await page.locator('.day').first().waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.day').count(), 7);
  assert.ok(await page.locator('.h-row').count() >= 2);
  await shot('04-semaine');
});

await step('settings sheet shows sync status', async () => {
  await page.click('[data-action="open-settings"]');
  await page.locator('.sheet.open').waitFor();
  await page.waitForTimeout(400);
  await page.getByText('Reçu du Mac', { exact: true }).waitFor();
  await shot('05-reglages');
  await page.click('[data-action="close-settings"]');
});

await step('a Kotcha workout today pre-fills the loop in one tap (light mode)', async () => {
  const light = await newPage('light');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  await light.route('**/api/state', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, error: null, data: {
      received_at: new Date().toISOString(),
      workouts: [{ date: today, title: '50min Easy Run', kind: 'footing', duration_min: 50, distance_km: 6.41, pace_s: 468 }],
      whoop: [{ date: today, recovery_pct: 82, sleep_hours: 7.8, sleep_performance_pct: 88, hrv_ms: 101, rhr_bpm: 52 }],
      home: { lat: 48.85660, lon: 2.35220, label: 'Maison' },
    } }),
  }));
  await light.goto(`${BASE}#code=${CODE}`);
  await light.getByText('50min Easy Run').waitFor();
  await light.getByText('Feu vert').waitFor();
  await light.locator('.weather-temp').waitFor({ timeout: 15000 });
  await shot('06-seance-clair', light);
  await light.click('.hero [data-action="plan-workout"]');
  await light.locator('#map-badge:not([hidden])').waitFor({ timeout: 60000 });
  assert.match(await light.locator('.stepper-value').first().textContent(), /6,4/);
  assert.match(await light.locator('.stepper-value').nth(1).textContent(), /7:50/);
  await light.waitForTimeout(1200);
  await shot('07-boucle-clair', light);
  assert.equal(new URL(light.url()).hash, '#/loop', 'the code left the URL');
});

assert.deepEqual(errors, []);
process.stdout.write('✓ aucune erreur console\n');
await browser.close();
