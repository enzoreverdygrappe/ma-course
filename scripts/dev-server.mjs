// Local dev server: static files + fake /api/state and /api/refresh built from pi-tracker's local data.
// Usage: npm run dev  ->  http://localhost:5191  (code d'accès : "dev")

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { homedir } from 'node:os';

const PORT = 5191;
const ROOT = new URL('..', import.meta.url).pathname;
const PI_DATA = join(homedir(), 'pi-tracker', 'data');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

async function devState() {
  const read = async (name) => JSON.parse(await readFile(join(PI_DATA, `${name}.json`), 'utf8').catch(() => '{"entries":[]}'));
  const [workouts, whoop] = await Promise.all([read('kotcha_workouts'), read('whoop')]);
  return {
    received_at: new Date().toISOString(),
    workouts: workouts.entries,
    workouts_updated_at: workouts.updated_at,
    whoop: whoop.entries.slice(-14),
    whoop_updated_at: whoop.updated_at,
    home: { lat: 48.85660, lon: 2.35220, label: 'Maison' },
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/api/state' || url.pathname === '/api/refresh') {
    const ok = req.headers['x-course-code'] === 'dev';
    if (url.pathname === '/api/refresh') await new Promise((resolve) => { setTimeout(resolve, 600); });
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(ok ? { success: true, data: await devState(), error: null } : { success: false, data: null, error: 'Code d’accès incorrect' }));
  }
  const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!path.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => process.stdout.write(`http://localhost:${PORT}\n`));
