// Backend de developpement local.
//
// Reproduit les routes HTTP du backend Base44 que le SDK appelle, de sorte que
// `npm run dev:local` fasse tourner l'application sans compte ni reseau. Les
// fonctions ne sont pas simulees : ce sont celles de base44/functions qui
// s'executent, via les substituts de devserver/shims.
//
// Lance par devserver/dev.mjs, ou seul avec :
//   node --experimental-strip-types devserver/server.mjs

import { createServer } from 'node:http';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

register(pathToFileURL(join(import.meta.dirname, 'loader.mjs')));

const { DEV_USER, store } = await import('./store.mjs');
const { invokeFunction, listFunctions } = await import('./functions.mjs');
const { seed } = await import('./seed.mjs');

const PORT = Number(process.env.DEV_API_PORT || 8787);
const HOST = process.env.DEV_API_HOST || '127.0.0.1';

function send(res, status, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function queryOptions(url) {
  const p = url.searchParams;
  const raw = p.get('q');
  return {
    q: raw ? JSON.parse(raw) : undefined,
    sort: p.get('sort') || undefined,
    limit: p.get('limit') || undefined,
    skip: p.get('skip') || undefined,
    fields: p.get('fields') ? p.get('fields').split(',') : undefined,
  };
}

function publicSettings(appId) {
  return {
    id: appId,
    name: 'FeelGood Drive (developpement)',
    public_settings: {
      app_name: 'FeelGood Drive',
      auth_required: false,
      allow_signup: true,
      theme: 'light',
    },
  };
}

async function route(req, res, url) {
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  // Attendu : api / apps / <appId|public> / ...
  if (parts[0] !== 'api' || parts[1] !== 'apps') {
    if (parts[0] === '__dev') return devRoute(req, res, parts.slice(1));
    return send(res, 404, { error: `Route non geree: ${url.pathname}` });
  }

  const scope = parts[2];

  if (scope === 'public' && url.pathname.includes('/public-settings/by-id/')) {
    return send(res, 200, publicSettings(parts.at(-1)));
  }

  if (scope === 'auth' && parts[3] === 'logout') {
    const from = url.searchParams.get('from_url') || '/';
    res.writeHead(302, { Location: from });
    return res.end();
  }

  const section = parts[3];

  if (section === 'entities') {
    return entitiesRoute(req, res, url, parts.slice(4));
  }

  if (section === 'functions') {
    const name = parts[4];
    const payload = await readJson(req);
    const headers = {};
    if (req.headers['x-service-key']) headers['x-service-key'] = req.headers['x-service-key'];
    const started = Date.now();
    const { status, data } = await invokeFunction(name, payload, headers);
    console.log(`[dev-api] fonction ${name} -> ${status} (${Date.now() - started} ms)`);
    return send(res, status, data);
  }

  return send(res, 404, { error: `Route non geree: ${url.pathname}` });
}

async function entitiesRoute(req, res, url, rest) {
  const [entity, tail] = rest;

  if (entity === 'User' && tail === 'me') {
    if (req.method === 'PUT') {
      Object.assign(DEV_USER, await readJson(req));
    }
    return send(res, 200, DEV_USER);
  }

  if (!entity) return send(res, 404, { error: 'Entite manquante' });

  switch (req.method) {
    case 'GET': {
      if (tail) {
        const rec = store.get(entity, tail);
        return rec ? send(res, 200, rec) : send(res, 404, { error: `${entity} ${tail} introuvable` });
      }
      return send(res, 200, store.query(entity, queryOptions(url)));
    }
    case 'POST': {
      const body = await readJson(req);
      if (tail === 'bulk') return send(res, 200, store.bulkCreate(entity, body));
      return send(res, 201, store.create(entity, body));
    }
    case 'PUT': {
      const body = await readJson(req);
      if (tail === 'bulk') return send(res, 200, store.bulkUpdate(entity, body));
      const rec = store.update(entity, tail, body);
      return rec ? send(res, 200, rec) : send(res, 404, { error: `${entity} ${tail} introuvable` });
    }
    case 'PATCH': {
      const body = await readJson(req);
      if (tail === 'update-many') {
        return send(res, 200, store.updateMany(entity, body?.query, body?.data));
      }
      return send(res, 404, { error: 'PATCH non gere' });
    }
    case 'DELETE': {
      if (tail) {
        return store.remove(entity, tail)
          ? send(res, 200, { ok: true })
          : send(res, 404, { error: `${entity} ${tail} introuvable` });
      }
      return send(res, 200, store.deleteMany(entity, await readJson(req)));
    }
    default:
      return send(res, 405, { error: `Methode ${req.method} non geree` });
  }
}

async function devRoute(req, res, parts) {
  if (parts[0] === 'state') {
    return send(res, 200, { user: DEV_USER, counts: store.counts(), functions: listFunctions() });
  }
  if (parts[0] === 'reseed') {
    await seed({ force: true });
    return send(res, 200, { ok: true, counts: store.counts() });
  }
  return send(res, 404, { error: 'Route de dev inconnue' });
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  route(req, res, url).catch((e) => {
    console.error('[dev-api] erreur non rattrapee:', e);
    send(res, 500, { error: e.message });
  });
});

await seed();

server.listen(PORT, HOST, () => {
  const counts = store.counts();
  console.log(`[dev-api] pret sur http://${HOST}:${PORT}`);
  console.log(`[dev-api] entites: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') || '(vide)'}`);
  console.log(`[dev-api] fonctions: ${listFunctions().join(', ')}`);
});
