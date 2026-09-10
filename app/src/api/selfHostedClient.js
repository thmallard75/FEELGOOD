/**
 * Client HTTP vers le serveur FeelGood auto-heberge.
 *
 * L'iPhone et le navigateur parlent a TON serveur. Les comptes (Google,
 * Facebook, Apple, e-mail) vivent ici — pas sur Base44.
 */

const APP = 'feelgood';
const TOKEN_KEY = 'base44_access_token';

function splitFields(fields) {
  if (!fields) return undefined;
  return Array.isArray(fields) ? fields : String(fields).split(',');
}

function readToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export async function createSelfHostedClient(apiBase = '') {
  const origin = apiBase
    || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8787');
  let memoryToken = '';

  function token() {
    return memoryToken || readToken();
  }

  function setToken(value) {
    memoryToken = value || '';
    if (typeof window === 'undefined') return;
    if (value) window.localStorage.setItem(TOKEN_KEY, value);
    else window.localStorage.removeItem(TOKEN_KEY);
  }

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
    const bearer = token();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
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
    const err = !res.ok ? Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data }) : null;
    return { status: res.status, data, ok: res.ok, error: err };
  }

  function entityPath(name, tail = '') {
    const extra = tail ? `/${tail}` : '';
    return `/api/apps/${APP}/entities/${name}${extra}`;
  }

  function unwrap(result) {
    if (!result.ok) throw result.error;
    return result.data;
  }

  function entityHandler(name) {
    return {
      async list(sort, limit, skip, fields) {
        return unwrap(await request('GET', entityPath(name), {
          query: { sort, limit, skip, fields: fields ? splitFields(fields).join(',') : undefined },
        }));
      },
      async filter(q, sort, limit, skip, fields) {
        return unwrap(await request('GET', entityPath(name), {
          query: {
            q: q ? JSON.stringify(q) : undefined,
            sort, limit, skip,
            fields: fields ? splitFields(fields).join(',') : undefined,
          },
        }));
      },
      async get(id) {
        return unwrap(await request('GET', entityPath(name, id)));
      },
      async create(payload) {
        return unwrap(await request('POST', entityPath(name), { body: payload }));
      },
      async bulkCreate(rows) {
        return unwrap(await request('POST', entityPath(name, 'bulk'), { body: rows }));
      },
      async update(id, payload) {
        return unwrap(await request('PUT', entityPath(name, id), { body: payload }));
      },
      async updateMany(q, payload) {
        return unwrap(await request('PATCH', entityPath(name, 'update-many'), {
          body: { query: q, data: payload },
        }));
      },
      async bulkUpdate(rows) {
        return unwrap(await request('PUT', entityPath(name, 'bulk'), { body: rows }));
      },
      async delete(id) {
        return unwrap(await request('DELETE', entityPath(name, id)));
      },
      async deleteMany(q) {
        return unwrap(await request('DELETE', entityPath(name), { body: q }));
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

  async function oauthReturnUrl() {
    if (typeof window === 'undefined') return '';
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) return 'feelgood://auth';
    } catch { /* web */ }
    return `${window.location.origin}/`;
  }

  const auth = {
    setToken,
    async me() {
      return unwrap(await request('GET', entityPath('User', 'me')));
    },
    async updateMe(payload) {
      return unwrap(await request('PUT', entityPath('User', 'me'), { body: payload }));
    },
    async isAuthenticated() {
      try {
        await this.me();
        return true;
      } catch {
        return false;
      }
    },
    async providers() {
      const { data } = await request('GET', `/api/apps/${APP}/auth/providers`);
      return data || { email: true };
    },
    async loginWithEmail(email, password) {
      const result = await request('POST', `/api/apps/${APP}/auth/login`, { body: { email, password } });
      const data = unwrap(result);
      setToken(data.access_token);
      return data.user;
    },
    async register(email, password, full_name) {
      const result = await request('POST', `/api/apps/${APP}/auth/register`, { body: { email, password, full_name } });
      const data = unwrap(result);
      setToken(data.access_token);
      return data.user;
    },
    async loginWithProvider(provider, fromUrl) {
      const from = fromUrl || await oauthReturnUrl();
      const start = `${origin}/api/apps/auth/${provider}/login?from_url=${encodeURIComponent(from)}`;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: start });
          return;
        }
      } catch {
        // Navigateur ou plugin absent : redirection classique.
      }
      window.location.href = start;
    },
    redirectToLogin() {
      if (typeof window !== 'undefined') window.location.href = '/';
    },
    logout(fromUrl = '/') {
      setToken('');
      if (typeof window !== 'undefined') window.location.href = fromUrl || '/';
    },
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
        async SendEmail(payload) {
          return unwrap(await request('POST', `/api/apps/${APP}/integrations/send-email`, { body: payload }));
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
