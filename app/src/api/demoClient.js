/**
 * Client du mode demonstration.
 *
 * La version publiee en pages statiques n'a pas de backend : ce client rend la
 * meme surface que le SDK Base44, servie depuis un instantane produit par
 * devserver/export-demo.mjs. Les trajets, scores et evenements qu'il contient
 * ont ete calcules par les vraies fonctions backend au moment de l'export.
 *
 * Les ecritures restent en memoire : elles fonctionnent le temps de la visite
 * et disparaissent au rechargement.
 */

import { MemoryStore } from '@/lib/memoryStore';
import { functionKey, SNAPSHOT_FILE } from '@/lib/demoSnapshot';

class DemoUnavailable extends Error {
  constructor(what) {
    super(`${what} n'est pas disponible dans la demonstration statique : cette action demande un backend.`);
    this.name = 'DemoUnavailable';
  }
}

function entityProxy(store) {
  const handler = (name) => ({
    async list(sort, limit, skip, fields) {
      return store.query(name, { sort, limit, skip, fields: splitFields(fields) });
    },
    async filter(q, sort, limit, skip, fields) {
      return store.query(name, { q, sort, limit, skip, fields: splitFields(fields) });
    },
    async get(id) {
      const rec = store.get(name, id);
      if (!rec) throw new Error(`${name} ${id} introuvable`);
      return rec;
    },
    async create(data) { return store.create(name, data); },
    async bulkCreate(rows) { return store.bulkCreate(name, rows); },
    async update(id, data) { return store.update(name, id, data); },
    async updateMany(q, data) { return store.updateMany(name, q, data); },
    async bulkUpdate(rows) { return store.bulkUpdate(name, rows); },
    async delete(id) { return { ok: store.remove(name, id) }; },
    async deleteMany(q) { return store.deleteMany(name, q); },
    subscribe() { return () => {}; },
  });

  return new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string' || name.startsWith('_') || name === 'then') return undefined;
      return handler(name);
    },
  });
}

function splitFields(fields) {
  if (!fields) return undefined;
  return Array.isArray(fields) ? fields : String(fields).split(',');
}

export async function createDemoClient() {
  const url = `${import.meta.env.BASE_URL}${SNAPSHOT_FILE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instantane de demonstration introuvable (${url}, HTTP ${res.status})`);
  const snapshot = await res.json();

  const store = new MemoryStore({ actor: snapshot.user });
  store.replaceAll(snapshot.entities);

  const entities = entityProxy(store);

  return {
    entities,
    asServiceRole: { entities },
    auth: {
      async me() { return snapshot.user; },
      async updateMe(data) { return Object.assign(snapshot.user, data); },
      async isAuthenticated() { return true; },
      redirectToLogin() {},
      logout() {},
    },
    integrations: {
      Core: {
        async InvokeLLM() { throw new DemoUnavailable('La generation par IA'); },
        async SendEmail() { throw new DemoUnavailable("L'envoi d'e-mail"); },
      },
    },
    functions: {
      async invoke(name, args) {
        const frozen = snapshot.functions[functionKey(name, args)];
        if (frozen) return { status: 200, data: frozen };
        throw new DemoUnavailable(`La fonction ${name}`);
      },
    },
    isDemo: true,
    demoGeneratedAt: snapshot.generated_at,
  };
}
