// Magasin persistant. L'isolation des trajets (RLS) est appliquee dans
// server.mjs : chaque utilisateur ne voit que ses Trip / DrivingEvent.
// ParentLink est lisible par le jeune et par le parent invite.

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

class PersistentStore extends MemoryStore {
  constructor() {
    super({ newId: () => randomBytes(12).toString('hex'), actor: DEV_USER });
    this.saveTimer = null;
    this.onChange = () => this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 250);
    this.saveTimer.unref?.();
  }

  save() {
    clearTimeout(this.saveTimer);
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.toJSON(), null, 1));
    renameSync(tmp, DATA_FILE);
  }

  load() {
    if (!existsSync(DATA_FILE)) return false;
    try {
      this.collections = new Map(Object.entries(JSON.parse(readFileSync(DATA_FILE, 'utf8'))));
      return true;
    } catch (e) {
      console.warn(`[dev-api] etat illisible (${e.message}) — on repart du seed`);
      return false;
    }
  }
}

export const store = new PersistentStore();
