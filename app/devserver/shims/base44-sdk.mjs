// Substitut du SDK Base44 pour l'execution locale des fonctions backend.
//
// Les fonctions de base44/functions/*/entry.ts importent `npm:@base44/sdk`,
// un specificateur Deno que Node ne sait pas resoudre. Le loader le redirige
// ici, et ce module rend un client dont les entites tapent dans le magasin
// local au lieu de partir en HTTP vers Base44. Le code metier des fonctions
// s'execute donc reellement, sans reseau ni compte.

import { DEV_USER, store } from '../store.mjs';

function entityHandler(name) {
  return {
    async list(sort, limit, skip, fields) {
      return store.query(name, { sort, limit, skip, fields: splitFields(fields) });
    },
    async filter(q, sort, limit, skip, fields) {
      return store.query(name, { q, sort, limit, skip, fields: splitFields(fields) });
    },
    async get(id) {
      const rec = store.get(name, id);
      if (!rec) throw notFound(name, id);
      return rec;
    },
    async create(data) {
      return store.create(name, data);
    },
    async bulkCreate(rows) {
      return store.bulkCreate(name, rows);
    },
    async update(id, data) {
      const rec = store.update(name, id, data);
      if (!rec) throw notFound(name, id);
      return rec;
    },
    async updateMany(query, data) {
      return store.updateMany(name, query, data);
    },
    async bulkUpdate(rows) {
      return store.bulkUpdate(name, rows);
    },
    async delete(id) {
      if (!store.remove(name, id)) throw notFound(name, id);
      return { ok: true };
    },
    async deleteMany(query) {
      return store.deleteMany(name, query);
    },
    subscribe() {
      return () => {};
    },
  };
}

function splitFields(fields) {
  if (!fields) return undefined;
  return Array.isArray(fields) ? fields : String(fields).split(',');
}

function notFound(name, id) {
  const err = new Error(`${name} ${id} introuvable`);
  err.status = 404;
  return err;
}

const entities = new Proxy({}, {
  get(_target, name) {
    if (typeof name !== 'string' || name.startsWith('_') || name === 'then') return undefined;
    return entityHandler(name);
  },
});

// Les appels LLM et e-mail n'ont pas d'equivalent local. Chaque appelant a
// deja un repli documente (voir coachFallback dans kpiEngine), donc lever une
// erreur explicite fait passer par ce chemin plutot que d'inventer une reponse.
const integrations = {
  Core: {
    async InvokeLLM() {
      throw new Error('InvokeLLM indisponible dans le backend de developpement');
    },
    async SendEmail(payload) {
      console.log(`[dev-api] SendEmail simule -> ${payload?.to}: ${payload?.subject}`);
      return { ok: true, simulated: true };
    },
  },
};

function makeClient() {
  const client = {
    entities,
    auth: {
      async me() {
        return DEV_USER;
      },
      async updateMe(data) {
        Object.assign(DEV_USER, data);
        return DEV_USER;
      },
    },
    integrations,
    functions: {
      async invoke(name, body) {
        const { invokeFunction } = await import('../functions.mjs');
        const { status, data } = await invokeFunction(name, body);
        return { status, data };
      },
    },
  };
  client.asServiceRole = client;
  return client;
}

export function createClientFromRequest() {
  return makeClient();
}

export function createClient() {
  return makeClient();
}

export default { createClient, createClientFromRequest };
