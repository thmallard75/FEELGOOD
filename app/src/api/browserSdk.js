/**
 * Substitut navigateur du SDK Base44 pour l'execution des fonctions backend.
 *
 * Les handlers de base44/functions/<nom>/entry.ts appellent
 * createClientFromRequest(). On leur rend un client dont les entites tapent
 * dans le MemoryStore du mode demonstration, au lieu de partir vers Base44.
 */

let _store = null;
let _user = null;
let _invoke = null;

export function bindDemoBackend({ store, user, invoke }) {
  _store = store;
  _user = user;
  _invoke = invoke;
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

function entityHandler(name) {
  return {
    async list(sort, limit, skip, fields) {
      return _store.query(name, { sort, limit, skip, fields: splitFields(fields) });
    },
    async filter(q, sort, limit, skip, fields) {
      return _store.query(name, { q, sort, limit, skip, fields: splitFields(fields) });
    },
    async get(id) {
      const rec = _store.get(name, id);
      if (!rec) throw notFound(name, id);
      return rec;
    },
    async create(data) {
      return _store.create(name, data);
    },
    async bulkCreate(rows) {
      return _store.bulkCreate(name, rows);
    },
    async update(id, data) {
      const rec = _store.update(name, id, data);
      if (!rec) throw notFound(name, id);
      return rec;
    },
    async updateMany(query, data) {
      return _store.updateMany(name, query, data);
    },
    async bulkUpdate(rows) {
      return _store.bulkUpdate(name, rows);
    },
    async delete(id) {
      if (!_store.remove(name, id)) throw notFound(name, id);
      return { ok: true };
    },
    async deleteMany(query) {
      return _store.deleteMany(name, query);
    },
    subscribe() {
      return () => {};
    },
  };
}

const entities = new Proxy({}, {
  get(_target, name) {
    if (typeof name !== 'string' || name.startsWith('_') || name === 'then') return undefined;
    return entityHandler(name);
  },
});

const integrations = {
  Core: {
    async InvokeLLM() {
      throw new Error('InvokeLLM indisponible hors de Base44');
    },
    async SendEmail(payload) {
      console.log(`[demo] SendEmail simule -> ${payload?.to}: ${payload?.subject}`);
      return { ok: true, simulated: true };
    },
  },
};

function makeClient() {
  if (!_store) {
    throw new Error('backend de demonstration non initialise');
  }
  const client = {
    entities,
    auth: {
      async me() {
        return _user;
      },
      async updateMe(data) {
        Object.assign(_user, data);
        return _user;
      },
    },
    integrations,
    functions: {
      async invoke(name, body) {
        if (typeof _invoke !== 'function') {
          throw new Error(`Fonction ${name} : invocateur local non lie`);
        }
        return _invoke(name, body);
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
