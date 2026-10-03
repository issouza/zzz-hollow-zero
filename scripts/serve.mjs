// Zero-dependency static server for the app (ES modules + OCR wasm need http://),
// plus POST /api/resonia, which rewrites src/resonia-db.js from the app's
// "Update database" button (a backup of the previous file goes to data/backups/).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '../src/ocr-core.js';
import { serializeDb } from './db-format.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const port = Number(process.env.PORT) || 5174;
const DB_FILE = path.join(root, 'src', 'resonia-db.js');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.traineddata': 'application/octet-stream',
};

const isText = (v, max) => typeof v === 'string' && v.length <= max;

function validCard(c) {
  return c && isText(c.name, 80) && c.name.trim()
    && CATEGORIES.includes(c.category)
    && (c.subtype == null || isText(c.subtype, 40))
    && ['A', 'B', 'S'].includes(c.rarity)
    && Number.isInteger(c.price) && c.price > 0 && c.price <= 10000
    && isText(c.effect, 600)
    && (c.extraTags == null || (Array.isArray(c.extraTags) && c.extraTags.length <= 10 && c.extraTags.every((t) => isText(t, 20))));
}

function updateDb(req, res) {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!loopback) { res.writeHead(403).end('Only from this computer'); return; }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) req.destroy();
  });
  req.on('end', () => {
    let cards;
    try { cards = JSON.parse(body).cards; } catch { res.writeHead(400).end('Bad JSON'); return; }
    const names = new Set();
    const ok = Array.isArray(cards) && cards.length > 0 && cards.length <= 500 && cards.every((c) => {
      if (!validCard(c)) return false;
      const key = c.name.trim().toLowerCase();
      if (names.has(key)) return false;
      names.add(key);
      return true;
    });
    if (!ok) { res.writeHead(422).end('Invalid card list'); return; }
    const backups = path.join(root, 'data', 'backups');
    fs.mkdirSync(backups, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_FILE, path.join(backups, `resonia-db.${stamp}.js`));
    fs.writeFileSync(DB_FILE, serializeDb(cards));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, count: cards.length }));
  });
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/api/resonia' && req.method === 'POST') { updateDb(req, res); return; }
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    // no-cache: always revalidate, so edits to the app show up on a normal reload.
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(port, () => console.log(`Hollow Zero shop advisor: http://localhost:${port}`));
