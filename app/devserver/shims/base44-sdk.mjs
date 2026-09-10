// Substitut du SDK Base44 pour l'execution locale des fonctions backend.
// Entites = magasin local. auth.me() = utilisateur de la requete HTTP.

import { store } from '../store.mjs';
import { currentUser } from '../context.mjs';
import { publicUser } from '../auth.mjs';

function entityHandler(name, { service = false } = {}) {
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
      return store.create(name, data, currentUser() || undefined);
    },
    async bulkCreate(rows) {
      return store.bulkCreate(name, rows, currentUser() || undefined);
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

function makeEntities() {
  return new Proxy({}, {
    get(_target, name) {
      if (typeof name !== 'string' || name.startsWith('_') || name === 'then') return undefined;
      return entityHandler(name);
    },
  });
}

const integrations = {
  Core: {
    async InvokeLLM() {
      throw new Error('InvokeLLM indisponible dans le backend de developpement');
    },
    async SendEmail(payload) {
      const { sendAppEmail } = await import('../auth.mjs');
      return sendAppEmail(payload);
    },
  },
};

function makeClient() {
  const entities = makeEntities();
  const client = {
    entities,
    auth: {
      async me() {
        const user = currentUser();
        if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
        return publicUser(user);
      },
      async updateMe(data) {
        const user = currentUser();
        if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
        return publicUser(store.update('User', user.id, data));
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
