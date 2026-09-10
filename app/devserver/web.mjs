// Sert le build Vite (écran de connexion + app) depuis le même process que l'API.
// Utilisé sur Render / Docker : un seul HTTPS, pas de démo GitHub Pages.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const WEB_ROOT = resolve(process.env.WEB_ROOT || join(import.meta.dirname, '..', 'dist'));

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function webEnabled() {
  return existsSync(join(WEB_ROOT, 'index.html'));
}

function mime(file) {
  return TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
}

function safePath(urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (!rel) return join(WEB_ROOT, 'index.html');
  const full = resolve(WEB_ROOT, rel);
  if (full !== WEB_ROOT && !full.startsWith(WEB_ROOT + sep)) return null;
  return full;
}

function isAsset(urlPath) {
  return /\.[A-Za-z0-9]{1,8}$/.test(urlPath.split('?')[0]);
}

export function serveWeb(req, res, url, extraHeaders = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (!webEnabled()) return false;

  let file = safePath(url.pathname);
  if (!file) return false;

  try {
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (isAsset(url.pathname)) return false;
      file = join(WEB_ROOT, 'index.html');
    }
    const stats = statSync(file);
    const html = file.endsWith(`${sep}index.html`) || file.endsWith('/index.html');
    res.writeHead(200, {
      'Content-Type': mime(file),
      'Content-Length': stats.size,
      'Cache-Control': html ? 'no-cache' : 'public, max-age=31536000, immutable',
      ...extraHeaders,
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}
