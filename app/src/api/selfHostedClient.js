/**
 * Client HTTP vers le serveur FeelGood auto-heberge.
 *
 * L'iPhone (App Store) et le navigateur parlent a TON serveur : creation du
 * trajet, puis `analyzeTrip` qui calcule les KPI. Aucun moteur OSM dans l'app.
 */

const APP = 'feelgood';

function splitFields(fields) {
  if (!fields) return undefined;
  return Array.isArray(fields) ? fields : String(fields).split(',');
}

export async function createSelfHostedClient(apiBase = '') {
  const origin = apiBase
    || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8787');

  async function request(method, path, { query, body, signal } = {}) {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, origin.endsWith('/') ? origin : `${origin}/`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url.toString(), {
      method,
      headers,
      signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, ok: res.ok };
  }

  function entityPath(name, tail = '') {
    const extra = tail ? `/${tail}` : '';
    return `/api/apps/${APP}/entities/${name}${extra}`;
  }

  function entityHandler(name) {
    return {
      async list(sort, limit, skip, fields) {
        const { data, ok, status } = await request('GET', entityPath(name), {
          query: { sort, limit, skip, fields: fields ? splitFields(fields).join(',') : undefined },
        });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async filter(q, sort, limit, skip, fields) {
        const { data, ok, status } = await request('GET', entityPath(name), {
          query: {
            q: q ? JSON.stringify(q) : undefined,
            sort, limit, skip,
            fields: fields ? splitFields(fields).join(',') : undefined,
          },
        });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async get(id) {
        const { data, ok, status } = await request('GET', entityPath(name, id));
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async create(payload) {
        const { data, ok, status } = await request('POST', entityPath(name), { body: payload });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async bulkCreate(rows) {
        const { data, ok, status } = await request('POST', entityPath(name, 'bulk'), { body: rows });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async update(id, payload) {
        const { data, ok, status } = await request('PUT', entityPath(name, id), { body: payload });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async updateMany(q, payload) {
        const { data, ok, status } = await request('PATCH', entityPath(name, 'update-many'), {
          body: { query: q, data: payload },
        });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async bulkUpdate(rows) {
        const { data, ok, status } = await request('PUT', entityPath(name, 'bulk'), { body: rows });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async delete(id) {
        const { data, ok, status } = await request('DELETE', entityPath(name, id));
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      async deleteMany(q) {
        const { data, ok, status } = await request('DELETE', entityPath(name), { body: q });
        if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
        return data;
      },
      subscribe() {
        return () => {};
      },
    };
  }

  const entities = new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string' || name.startsWith('_') || name === 'then') return undefined;
      return entityHandler(name);
    },
  });

  const auth = {
    async me() {
      const { data, ok, status } = await request('GET', entityPath('User', 'me'));
      if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
      return data;
    },
    async updateMe(payload) {
      const { data, ok, status } = await request('PUT', entityPath('User', 'me'), { body: payload });
      if (!ok) throw Object.assign(new Error(data?.error || `HTTP ${status}`), { status, data });
      return data;
    },
    async isAuthenticated() {
      try {
        await this.me();
        return true;
      } catch {
        return false;
      }
    },
    redirectToLogin() {},
    logout() {},
  };

  return {
    entities,
    asServiceRole: { entities },
    auth,
    integrations: {
      Core: {
        async InvokeLLM() {
          throw new Error('Pas de modele IA sur le serveur auto-heberge — repli pedagogique');
        },
        async SendEmail() {
          throw new Error("L'envoi d'e-mail n'est pas configure sur ce serveur");
        },
      },
    },
    functions: {
      async invoke(name, args) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120000);
        try {
          return await request('POST', `/api/apps/${APP}/functions/${name}`, {
            body: args ?? {},
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      },
    },
    isDemo: false,
    isSelfHosted: true,
  };
}
