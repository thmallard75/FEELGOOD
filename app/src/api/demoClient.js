/**
 * Client du mode demonstration.
 *
 * La version publiee en pages statiques n'a pas de backend : ce client rend la
 * meme surface que le SDK Base44, servie depuis un instantane produit par
 * devserver/export-demo.mjs. Les trajets, scores et evenements qu'il contient
 * ont ete calcules par les vraies fonctions backend au moment de l'export.
 *
 * Les ecritures sont persistees dans localStorage (APK / PWA) pour survivre
 * a un rechargement. Un instantane plus recent les remplace.
 */

import { MemoryStore } from '@/lib/memoryStore';
import { functionKey, SNAPSHOT_FILE } from '@/lib/demoSnapshot';

const LS_KEY = 'feelgood-test-store-v1';

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

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  } catch {
    saved = null;
  }

  if (saved?.generated_at === snapshot.generated_at && saved.entities) {
    if (saved.user) Object.assign(snapshot.user, saved.user);
    store.replaceAll(saved.entities);
  } else {
    store.replaceAll(snapshot.entities);
  }

  const persist = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        generated_at: snapshot.generated_at,
        user: snapshot.user,
        entities: store.toJSON(),
      }));
    } catch {
      // Quota depassee — le test continue en memoire.
    }
  };
  store.onChange = persist;
  persist();

  const entities = entityProxy(store);

  return {
    entities,
    asServiceRole: { entities },
    auth: {
      async me() { return snapshot.user; },
      async updateMe(data) {
        Object.assign(snapshot.user, data);
        persist();
        return snapshot.user;
      },
      async isAuthenticated() { return true; },
      redirectToLogin() {},
      logout() {},
    },
    resetDemo() {
      localStorage.removeItem(LS_KEY);
      window.location.reload();
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
