/**
 * Execute les vraies fonctions backend dans le navigateur.
 *
 * Meme idee que devserver/functions.mjs : une globale Deno capture le handler
 * (Deno.serve ou export default), puis on l'appelle avec une Request.
 * Les specificateurs Deno (npm:@base44/sdk, base44:runtime) sont rediriges
 * par le plugin Vite vers browserSdk.js / browserRuntime.js.
 */

const handlers = new Map();
let loadingName = null;
let importQueue = Promise.resolve();

function ensureDeno() {
  if (globalThis.Deno?.__feelgood) return;
  const previous = globalThis.Deno;
  globalThis.Deno = {
    __feelgood: true,
    serve(handler) {
      if (loadingName) handlers.set(loadingName, handler);
      return { finished: new Promise(() => {}), shutdown: async () => {} };
    },
    env: previous?.env ?? {
      get: () => undefined,
      has: () => false,
      toObject: () => ({}),
    },
  };
}

const loaders = {
  analyzeTrip: () => import('../../base44/functions/analyzeTrip/entry.ts'),
  computeCoaching: () => import('../../base44/functions/computeCoaching/entry.ts'),
  getOsmFeatures: () => import('../../base44/functions/getOsmFeatures/entry.ts'),
  osmProxy: () => import('../../base44/functions/osmProxy/entry.ts'),
  retryPendingOsm: () => import('../../base44/functions/retryPendingOsm/entry.ts'),
  reanalyzeAllTrips: () => import('../../base44/functions/reanalyzeAllTrips/entry.ts'),
  detectDepartementsToPreload: () => import('../../base44/functions/detectDepartementsToPreload/entry.ts'),
  deleteUserData: () => import('../../base44/functions/deleteUserData/entry.ts'),
};

export function canRunLocally(name) {
  return Object.prototype.hasOwnProperty.call(loaders, name);
}

function loadHandler(name) {
  const run = async () => {
    if (handlers.has(name)) return handlers.get(name);
    const loader = loaders[name];
    if (!loader) return null;
    ensureDeno();
    loadingName = name;
    try {
      const mod = await loader();
      if (typeof mod.default === 'function') handlers.set(name, mod.default);
    } finally {
      loadingName = null;
    }
    return handlers.get(name) || null;
  };
  importQueue = importQueue.then(run, run);
  return importQueue;
}

export async function runLocalFunction(name, payload = {}) {
  let handler;
  try {
    handler = await loadHandler(name);
  } catch (e) {
    console.error(`[demo] import de ${name} impossible:`, e);
    return { status: 500, data: { error: `Import de ${name}: ${e.message}` } };
  }
  if (typeof handler !== 'function') {
    return { status: 404, data: { error: `Fonction inconnue: ${name}` } };
  }

  const request = new Request(`https://demo.local/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  try {
    const response = await handler(request);
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data };
  } catch (e) {
    console.error(`[demo] ${name} a leve:`, e);
    return { status: 500, data: { error: e.message } };
  }
}
