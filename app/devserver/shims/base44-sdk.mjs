// Substitut du SDK Base44 pour l'execution locale des fonctions backend.
// entities = magasin filtre par l'utilisateur HTTP. asServiceRole = magasin
// complet, reserve aux fonctions (analyzeTrip, caches OSM) apres le controle
// d'acces de la route HTTP.

import { store } from '../store.mjs';
import { currentUser } from '../context.mjs';
import { publicUser } from '../auth.mjs';
import { canRead, canWrite, scopedQuery } from '../rls.mjs';

function entityHandler(name, { service = false } = {}) {
  const actor = () => currentUser();

  function scoped(q) {
    if (service) return q;
    return scopedQuery(name, actor(), q);
  }

  function visible(rec) {
    if (service) return Boolean(rec);
    return canRead(name, rec, actor());
  }

  function writable(rec) {
    if (service) return Boolean(rec);
    return canWrite(name, rec, actor());
  }

  return {
    async list(sort, limit, skip, fields) {
      return store.query(name, { q: scoped(), sort, limit, skip, fields: splitFields(fields) });
    },
    async filter(q, sort, limit, skip, fields) {
      return store.query(name, { q: scoped(q), sort, limit, skip, fields: splitFields(fields) });
    },
    async get(id) {
      const rec = store.get(name, id);
      if (!visible(rec)) throw notFound(name, id);
      return rec;
    },
    async create(data) {
      const user = actor();
      if (!service && !user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
      return store.create(name, data, user || undefined);
    },
    async bulkCreate(rows) {
      const user = actor();
      if (!service && !user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
      return store.bulkCreate(name, rows, user || undefined);
    },
    async update(id, data) {
      const rec = store.get(name, id);
      if (!writable(rec)) throw notFound(name, id);
      return store.update(name, id, data);
    },
    async updateMany(query, data) {
      return store.updateMany(name, scoped(query), data);
    },
    async bulkUpdate(rows) {
      const allowed = (rows || []).filter((row) => writable(store.get(name, row.id)));
      return store.bulkUpdate(name, allowed);
    },
    async delete(id) {
      const rec = store.get(name, id);
      if (!writable(rec) || !store.remove(name, id)) throw notFound(name, id);
      return { ok: true };
    },
    async deleteMany(query) {
      return store.deleteMany(name, scoped(query));
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

function makeEntities({ service = false } = {}) {
  return new Proxy({}, {
    get(_target, name) {
      if (typeof name !== 'string' || name.startsWith('_') || name === 'then') return undefined;
      return entityHandler(name, { service });
    },
  });
}

function makeIntegrations({ service = false } = {}) {
  return {
    Core: {
      async InvokeLLM() {
        throw new Error('InvokeLLM indisponible dans le backend de developpement');
      },
      async SendEmail(payload) {
        const { sendAppEmail } = await import('../auth.mjs');
        const user = currentUser();
        const to = typeof payload?.to === 'string' ? payload.to.trim().toLowerCase() : '';
        if (!service && user && to !== String(user.email || '').toLowerCase()) {
          const err = new Error('Envoi e-mail refuse');
          err.status = 403;
          throw err;
        }
        return sendAppEmail(payload);
      },
    },
  };
}

function makeClient() {
  const client = {
    entities: makeEntities({ service: false }),
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
    integrations: makeIntegrations({ service: false }),
    functions: {
      async invoke(name, body) {
        const { invokeFunction } = await import('../functions.mjs');
        const { status, data } = await invokeFunction(name, body);
        return { status, data };
      },
    },
  };
  client.asServiceRole = {
    entities: makeEntities({ service: true }),
    integrations: makeIntegrations({ service: true }),
    auth: client.auth,
    functions: client.functions,
  };
  return client;
}

export function createClientFromRequest() {
  return makeClient();
}

export function createClient() {
  return makeClient();
}

export default { createClient, createClientFromRequest };
