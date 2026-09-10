// Invocation locale des vraies fonctions backend.
//
// Chaque base44/functions/<nom>/entry.ts expose un handler (Request) =>
// Response, sous l'une de deux formes selon la fonction : `export default` ou
// `Deno.serve(handler)`. Request et Response sont des globales de Node ; il ne
// manque que `Deno`, qu'on fournit ici pour capturer le handler au moment de
// l'import. C'est donc le code de production qui s'execute, pas une
// reimplementation.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FUNCTIONS_DIR = join(import.meta.dirname, '..', 'base44', 'functions');

const handlers = new Map();
let loadingName = null;

globalThis.Deno ??= {
  serve(handler) {
    if (loadingName) handlers.set(loadingName, handler);
    // Le vrai Deno.serve rend un serveur dont l'attente ne se resout jamais.
    return { finished: new Promise(() => {}), shutdown: async () => {} };
  },
  env: {
    get: (name) => process.env[name],
    has: (name) => name in process.env,
    toObject: () => ({ ...process.env }),
  },
};

export function listFunctions() {
  if (!existsSync(FUNCTIONS_DIR)) return [];
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(FUNCTIONS_DIR, e.name, 'entry.ts')))
    .map((e) => e.name)
    .sort();
}

// `loadingName` est un etat global le temps d'un import : les chargements sont
// mis en file pour que deux fonctions importees en parallele ne se volent pas
// leur handler.
let importQueue = Promise.resolve();

function loadHandler(name, entry) {
  const run = async () => {
    if (handlers.has(name)) return handlers.get(name);
    loadingName = name;
    try {
      const mod = await import(pathToFileURL(entry).href);
      if (typeof mod.default === 'function') handlers.set(name, mod.default);
    } finally {
      loadingName = null;
    }
    return handlers.get(name);
  };
  importQueue = importQueue.then(run, run);
  return importQueue;
}

export async function invokeFunction(name, payload, headers = {}) {
  const entry = join(FUNCTIONS_DIR, name, 'entry.ts');
  if (!/^[\w-]+$/.test(name) || !existsSync(entry)) {
    return { status: 404, data: { error: `Fonction inconnue: ${name}` } };
  }

  let handler;
  try {
    handler = await loadHandler(name, entry);
  } catch (e) {
    console.error(`[dev-api] import de ${name} impossible:`, e);
    return { status: 500, data: { error: `Import de ${name}: ${e.message}` } };
  }
  if (typeof handler !== 'function') {
    return { status: 500, data: { error: `${name}/entry.ts n'expose aucun handler` } };
  }

  const request = new Request(`http://dev-api.local/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
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
    console.error(`[dev-api] ${name} a leve:`, e);
    return { status: e.status || 500, data: { error: e.message } };
  }
}
