// Magasin persistant. L'isolation des trajets (RLS) est appliquee dans
// server.mjs : chaque utilisateur ne voit que ses Trip / DrivingEvent.
// ParentLink est lisible par le jeune et par le parent invite.
//
// Production (Render) : DATABASE_URL → Postgres (sauvegardes Render).
// Local / Docker sans Postgres : fichier DATA_DIR/store.json.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MemoryStore } from '../src/lib/memoryStore.js';

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dirname, '.data');
const DATA_FILE = join(DATA_DIR, 'store.json');

export const DEV_USER = {
  id: process.env.FEELGOOD_USER_ID || 'user-local-1',
  email: process.env.FEELGOOD_USER_EMAIL || 'moi@localhost',
  full_name: process.env.FEELGOOD_USER_NAME || 'Conducteur',
  role: 'admin',
  created_date: '2026-01-05T09:00:00.000Z',
};

function pgSsl(url) {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=require/i.test(url) || /render\.com/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

class PersistentStore extends MemoryStore {
  constructor() {
    super({ newId: () => randomBytes(12).toString('hex'), actor: DEV_USER });
    this.saveTimer = null;
    this.pool = null;
    this.backend = 'memory';
    this.restored = false;
    this._dirty = false;
    this._chain = Promise.resolve();
    this.onChange = () => this.scheduleSave();
  }

  async ready() {
    const url = process.env.DATABASE_URL;
    if (url) {
      const pg = await import('pg').catch(() => null);
      if (!pg?.default && !pg?.Pool) {
        throw new Error('DATABASE_URL est defini mais le module pg est absent');
      }
      const Pool = pg.default?.Pool || pg.Pool;
      this.pool = new Pool({ connectionString: url, ssl: pgSsl(url), max: 2 });
      await this.waitForPg();
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS feelgood_store (
          id INTEGER PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      this.backend = 'postgres';
      this.restored = await this.loadPostgres();
      console.log(`[api] persistance Postgres (${this.restored ? 'etat recharge' : 'base vide'})`);
      return this.backend;
    }
    this.backend = 'file';
    this.restored = this.loadFile();
    console.log(`[api] persistance fichier ${DATA_FILE} (${this.restored ? 'etat recharge' : 'vide'})`);
    return this.backend;
  }

  async waitForPg(attempts = 20) {
    let last = null;
    for (let i = 0; i < attempts; i += 1) {
      try {
        await this.pool.query('SELECT 1');
        return;
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error(`Postgres injoignable: ${last?.message || 'timeout'}`);
  }

  async loadPostgres() {
    const { rows } = await this.pool.query('SELECT data FROM feelgood_store WHERE id = 1');
    if (!rows[0]?.data) return false;
    this.replaceAll(rows[0].data);
    return true;
  }

  loadFile() {
    if (!existsSync(DATA_FILE)) return false;
    try {
      this.collections = new Map(Object.entries(JSON.parse(readFileSync(DATA_FILE, 'utf8'))));
      return true;
    } catch (e) {
      console.warn(`[api] etat illisible (${e.message}) — magasin vide`);
      return false;
    }
  }

  load() {
    return this.restored;
  }

  scheduleSave() {
    this._dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.flush().catch((e) => console.error('[api] sauvegarde:', e.message));
    }, 250);
    this.saveTimer.unref?.();
  }

  async flush() {
    clearTimeout(this.saveTimer);
    this._dirty = true;
    const next = this._chain.then(() => this._persistLatest());
    this._chain = next.catch((e) => {
      console.error('[api] sauvegarde:', e.message);
    });
    return next;
  }

  async _persistLatest() {
    while (this._dirty) {
      this._dirty = false;
      await this._persist(this.toJSON());
    }
  }

  async _persist(snapshot) {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO feelgood_store (id, data, updated_at)
         VALUES (1, $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [snapshot],
      );
      return;
    }
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot, null, 1));
    renameSync(tmp, DATA_FILE);
  }

  save() {
    this.scheduleSave();
  }
}

export const store = new PersistentStore();
