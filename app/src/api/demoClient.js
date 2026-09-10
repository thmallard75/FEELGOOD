/**
 * Client du mode demonstration.
 *
 * La version publiee en pages statiques n'a pas de serveur : ce client rend la
 * meme surface que le SDK Base44, servie depuis un instantane + le MemoryStore.
 * Les fonctions metier (analyzeTrip, computeCoaching, osmProxy, …) s'executent
 * dans le navigateur, sur le vrai code de base44/functions/.
 *
 * Les ecritures sont persistees dans localStorage (PWA / iOS) pour survivre
 * a un rechargement. Un instantane plus recent les replace.
 */

import { MemoryStore } from '@/lib/memoryStore';
import { functionKey, SNAPSHOT_FILE } from '@/lib/demoSnapshot';
import { bindDemoBackend } from '@/api/browserSdk';
import { canRunLocally, runLocalFunction } from '@/api/runLocalFunction';

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

function persistStore(snapshot, store) {
  const payload = {
    generated_at: snapshot.generated_at,
    user: snapshot.user,
    entities: store.toJSON(),
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    return;
  } catch {
    // Quota : on retente sans le cache OSM, souvent le plus volumineux.
  }
  try {
    const slim = { ...payload, entities: { ...payload.entities } };
    delete slim.entities.OsmTileCache;
    localStorage.setItem(LS_KEY, JSON.stringify(slim));
  } catch {
    // Le test continue en memoire.
  }
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

  const persist = () => persistStore(snapshot, store);
  store.onChange = persist;
  persist();

  bindDemoBackend({
    store,
    user: snapshot.user,
    invoke: (name, args) => runLocalFunction(name, args),
  });

  const entities = entityProxy(store);

  // Reprend les trajets bloques (pending_analysis / pending_osm / syncing)
  // — cas typique : trajet termine avant que l'analyse locale soit disponible.
  queueMicrotask(() => {
    const stuck = store.query('Trip', {
      q: { status: { $in: ['pending_analysis', 'pending_osm', 'syncing', 'recording'] } },
    });
    for (const trip of stuck) {
      if (!trip.gps_track || trip.gps_track.length < 5) {
        if (trip.status === 'recording') {
          store.update('Trip', trip.id, { status: 'completed' });
        }
        continue;
      }
      runLocalFunction('analyzeTrip', { tripId: trip.id }).catch((err) => {
        console.warn(`[demo] reprise analyse ${trip.id}:`, err?.message || err);
      });
    }
  });

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
        if (canRunLocally(name)) {
          return runLocalFunction(name, args);
        }
        const frozen = snapshot.functions[functionKey(name, args)];
        if (frozen) return { status: 200, data: frozen };
        throw new DemoUnavailable(`La fonction ${name}`);
      },
    },
    isDemo: true,
    demoGeneratedAt: snapshot.generated_at,
  };
}
