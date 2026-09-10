// API FeelGood auto-hebergee (production Docker / npm start, et `npm run dev:local`).
//
// L'iPhone n'envoie que le GPS ; analyzeTrip calcule les KPI ici.
// Comptes : e-mail, Google, Facebook, Apple — pas Base44.

import { createServer } from 'node:http';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

register(pathToFileURL(join(import.meta.dirname, 'loader.mjs')));

const { store } = await import('./store.mjs');
const { invokeFunction, listFunctions } = await import('./functions.mjs');
const { seed } = await import('./seed.mjs');
const { requestContext } = await import('./context.mjs');
const auth = await import('./auth.mjs');
const { serveWeb, webEnabled } = await import('./web.mjs');
const {
  scopedQuery,
  canRead,
  canWrite,
  parentLinkPatchAllowed,
  stripOwnership,
} = await import('./rls.mjs');

const PORT = Number(process.env.PORT || process.env.DEV_API_PORT || 8787);
const HOST = process.env.HOST
  || process.env.DEV_API_HOST
  || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const USER_FUNCTIONS = new Set([
  'analyzeTrip',
  'computeCoaching',
  'reanalyzeAllTrips',
  'deleteUserData',
  'prefetchRegion',
  'getOsmFeatures',
  'osmProxy',
  'sendWeeklySummary',
]);

const CRON_FUNCTIONS = new Set([
  'retryPendingOsm',
  'retryPendingDownloads',
  'getPendingDepartements',
  'importGeofabrikTiles',
  'detectDepartementsToPreload',
]);

function hasServiceKey(req) {
  const provided = req.headers['x-service-key'];
  const expected = process.env.FEELGOOD_SERVICE_KEY;
  if (!provided || !expected) return false;
  return provided === expected;
}

function corsHeaders(req) {
  const origin = CORS_ORIGIN === '*' ? (req?.headers?.origin || '*') : CORS_ORIGIN;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    Vary: 'Origin',
  };
}

function send(res, status, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...corsHeaders(res.req),
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, ...corsHeaders(res.req) });
  res.end();
}

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const raw = await readRaw(req);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseForm(raw) {
  return Object.fromEntries(new URLSearchParams(raw));
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
    name: 'FeelGood Conduite',
    public_settings: {
      app_name: 'FeelGood Conduite',
      auth_required: true,
      allow_signup: true,
      theme: 'dark',
    },
  };
}

async function authRoutes(req, res, url, parts) {
  // /api/apps/auth/<provider>/login
  // /api/apps/auth/callback/<provider>
  // /api/apps/auth/logout
  // /api/apps/feelgood/auth/(login|register|providers|logout)
  const scope = parts[2];
  const a = scope === 'auth' ? parts[3] : parts[4];
  const b = scope === 'auth' ? parts[4] : parts[5];

  if (a === 'providers') {
    return send(res, 200, auth.configuredProviders());
  }

  if (a === 'logout') {
    const from = auth.safeFromUrl(url.searchParams.get('from_url'), process.env.APP_PUBLIC_URL || '/', req);
    return redirect(res, from);
  }

  if (a === 'register' && req.method === 'POST') {
    try {
      const user = auth.registerEmailUser(await readJson(req) || {});
      return send(res, 201, { user: auth.publicUser(user), access_token: auth.tokenFor(user) });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (a === 'login' && req.method === 'POST' && scope !== 'auth') {
    try {
      const user = auth.loginEmailUser(await readJson(req) || {});
      return send(res, 200, { user: auth.publicUser(user), access_token: auth.tokenFor(user) });
    } catch (e) {
      return send(res, e.status || 401, { error: e.message });
    }
  }

  const providers = ['google', 'facebook', 'apple'];
  if (providers.includes(a) && b === 'login') {
    if (!auth.configuredProviders()[a]) {
      return send(res, 400, { error: `${a} n’est pas configuré sur ce serveur (variables d’environnement manquantes).` });
    }
    const from = auth.safeFromUrl(url.searchParams.get('from_url'), process.env.APP_PUBLIC_URL, req);
    return redirect(res, auth.oauthStartUrl(req, a, from));
  }

  if (a === 'callback' && providers.includes(b)) {
    let code = url.searchParams.get('code');
    let state = url.searchParams.get('state');
    if (req.method === 'POST') {
      const form = parseForm(await readRaw(req));
      code = form.code || code;
      state = form.state || state;
    }
    if (url.searchParams.get('error')) {
      return send(res, 400, { error: url.searchParams.get('error_description') || 'Connexion annulée' });
    }
    try {
      const result = await auth.finishOAuth(req, b, { code, state });
      return redirect(res, result.redirect);
    } catch (e) {
      console.error(`[api] oauth ${b}:`, e);
      return send(res, e.status || 400, { error: e.message });
    }
  }

  return send(res, 404, { error: 'Route auth inconnue' });
}

async function route(req, res, url) {
  if (url.pathname === '/health' || url.pathname === '/api/health') {
    return send(res, 200, { ok: true, service: 'feelgood-api' });
  }
  if (url.pathname === '/' && req.method === 'GET' && !webEnabled()) {
    return send(res, 200, { ok: true, service: 'feelgood-api', health: '/health' });
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts[0] !== 'api' || parts[1] !== 'apps') {
    if (parts[0] === '__dev') {
      if (process.env.FEELGOOD_DEV_ROUTES !== '1') {
        return send(res, 404, { error: `Route non geree: ${url.pathname}` });
      }
      return devRoute(req, res, parts.slice(1));
    }
    if (serveWeb(req, res, url, corsHeaders(req))) return;
    return send(res, 404, { error: `Route non geree: ${url.pathname}` });
  }

  const scope = parts[2];

  if (scope === 'public' && url.pathname.includes('/public-settings/by-id/')) {
    return send(res, 200, publicSettings(parts.at(-1)));
  }

  const isAuthRoute = scope === 'auth' || parts[3] === 'auth';
  if (isAuthRoute) return authRoutes(req, res, url, parts);

  if (parts[3] === 'integrations' && parts[4] === 'send-email') {
    const user = auth.userFromRequest(req);
    if (!user) return send(res, 401, { error: 'auth_required' });
    const payload = await readJson(req) || {};
    try {
      const result = await auth.sendParentInviteEmail(user, payload);
      return send(res, 200, result);
    } catch (e) {
      return send(res, e.status || 502, { error: e.message });
    }
  }

  const user = auth.userFromRequest(req);
  if (!user) return send(res, 401, { error: 'auth_required', reason: 'auth_required' });

  return requestContext.run({ user }, async () => {
    const section = parts[3];
    if (section === 'entities') {
      return entitiesRoute(req, res, url, parts.slice(4), user);
    }
    if (section === 'functions') {
      const name = parts[4];
      let payload = await readJson(req) || {};
      const privileged = hasServiceKey(req);
      if (CRON_FUNCTIONS.has(name) && !privileged) {
        return send(res, 403, { error: 'fonction reservee au serveur' });
      }
      if (!privileged && !USER_FUNCTIONS.has(name) && !CRON_FUNCTIONS.has(name)) {
        return send(res, 404, { error: `Fonction inconnue: ${name}` });
      }
      if (!privileged && name === 'sendWeeklySummary') {
        payload = {};
      }
      if (name === 'analyzeTrip' && payload?.tripId) {
        const trip = store.get('Trip', payload.tripId);
        if (!canRead('Trip', trip, user)) {
          return send(res, 404, { error: 'Trajet introuvable' });
        }
      }
      if (name === 'computeCoaching' && payload?.tripId) {
        const trip = store.get('Trip', payload.tripId);
        if (!canRead('Trip', trip, user)) {
          return send(res, 404, { error: 'Trajet introuvable' });
        }
      }
      const started = Date.now();
      const { status, data } = await invokeFunction(name, payload, {});
      console.log(`[api] fonction ${name} user=${user.email} -> ${status} (${Date.now() - started} ms)`);
      return send(res, status, data);
    }
    return send(res, 404, { error: `Route non geree: ${url.pathname}` });
  });
}

async function entitiesRoute(req, res, url, rest, user) {
  const [entity, tail] = rest;

  if (entity === 'User' && tail === 'me') {
    if (req.method === 'PUT') {
      const patch = await readJson(req) || {};
      delete patch.id;
      delete patch.email;
      delete patch.password_hash;
      delete patch.role;
      store.update('User', user.id, patch);
    }
    return send(res, 200, auth.publicUser(store.get('User', user.id) || user));
  }

  if (entity === 'User') {
    return send(res, 403, { error: 'Liste des comptes interdite' });
  }

  if (!entity) return send(res, 404, { error: 'Entite manquante' });

  switch (req.method) {
    case 'GET': {
      if (tail) {
        const rec = store.get(entity, tail);
        return canRead(entity, rec, user)
          ? send(res, 200, rec)
          : send(res, 404, { error: `${entity} ${tail} introuvable` });
      }
      const opts = queryOptions(url);
      opts.q = scopedQuery(entity, user, opts.q);
      return send(res, 200, store.query(entity, opts));
    }
    case 'POST': {
      const body = stripOwnership(await readJson(req)) || {};
      if (entity === 'ParentLink') body.young_driver_email = user.email;
      if (tail === 'bulk') {
        const rows = (Array.isArray(body) ? body : [body]).map((row) => {
          const next = stripOwnership(row);
          if (entity === 'ParentLink') next.young_driver_email = user.email;
          return next;
        });
        return send(res, 200, store.bulkCreate(entity, rows, user));
      }
      return send(res, 201, store.create(entity, body, user));
    }
    case 'PUT': {
      const body = stripOwnership(await readJson(req)) || {};
      if (tail === 'bulk') {
        const allowed = (Array.isArray(body) ? body : [])
          .map((row) => ({ ...stripOwnership(row), id: row.id }))
          .filter((row) => canWrite(entity, store.get(entity, row.id), user));
        return send(res, 200, store.bulkUpdate(entity, allowed));
      }
      const rec = store.get(entity, tail);
      if (!canWrite(entity, rec, user)) return send(res, 404, { error: `${entity} ${tail} introuvable` });
      if (entity === 'ParentLink' && !parentLinkPatchAllowed(rec, user, body)) {
        return send(res, 403, { error: 'Modification parent interdite' });
      }
      return send(res, 200, store.update(entity, tail, body));
    }
    case 'PATCH': {
      const body = await readJson(req);
      if (tail === 'update-many') {
        const q = scopedQuery(entity, user, body?.query);
        return send(res, 200, store.updateMany(entity, q, body?.data));
      }
      return send(res, 404, { error: 'PATCH non gere' });
    }
    case 'DELETE': {
      if (tail) {
        const rec = store.get(entity, tail);
        if (!canWrite(entity, rec, user) || !store.remove(entity, tail)) {
          return send(res, 404, { error: `${entity} ${tail} introuvable` });
        }
        return send(res, 200, { ok: true });
      }
      const q = scopedQuery(entity, user, await readJson(req));
      return send(res, 200, store.deleteMany(entity, q));
    }
    default:
      return send(res, 405, { error: `Methode ${req.method} non geree` });
  }
}

async function devRoute(req, res, parts) {
  if (parts[0] === 'state') {
    return send(res, 200, { counts: store.counts(), functions: listFunctions(), providers: auth.configuredProviders() });
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
  const providers = auth.configuredProviders();
  console.log(`[api] pret sur http://${HOST}:${PORT}`);
  console.log(`[api] auth: ${Object.entries(providers).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
  console.log(`[api] entites: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') || '(vide)'}`);
  console.log(`[api] fonctions: ${listFunctions().join(', ')}`);
  console.log(`[api] web: ${webEnabled() ? 'build Vite (connexion reelle)' : 'API seule'}`);
});
