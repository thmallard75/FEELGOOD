// Magasin de donnees du backend de developpement.
//
// Reproduit la surface d'entites de Base44 (list/filter/create/update/...)
// au-dessus d'un simple tableau par entite, persiste dans un fichier JSON pour
// que l'etat survive a un redemarrage.
//
// Ce qui n'est pas reproduit : le RLS. Base44 restreint les lectures non
// service-role au createur de l'enregistrement ; ici toutes les lectures
// voient tout. C'est volontaire — le tableau de bord parent lit des liens
// crees par le jeune conducteur, et emuler le RLS a moitie donnerait des
// comportements plus trompeurs qu'utiles.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATA_DIR = join(import.meta.dirname, '.data');
const DATA_FILE = join(DATA_DIR, 'store.json');

export const DEV_USER = {
  id: 'devuser0000000000000001',
  email: 'dev@feelgood.local',
  full_name: 'Conducteur de demonstration',
  role: 'admin',
  created_date: '2026-01-05T09:00:00.000Z',
};

function newId() {
  return randomBytes(12).toString('hex');
}

function getPath(rec, key) {
  if (!key.includes('.')) return rec[key];
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), rec);
}

function matchCondition(value, cond) {
  if (cond === null || typeof cond !== 'object' || Array.isArray(cond)) {
    return Array.isArray(value) ? value.includes(cond) : value === cond;
  }
  const operators = Object.keys(cond);
  if (!operators.some((op) => op.startsWith('$'))) {
    return JSON.stringify(value) === JSON.stringify(cond);
  }
  return operators.every((op) => {
    const expected = cond[op];
    switch (op) {
      case '$eq': return value === expected;
      case '$ne': return value !== expected;
      case '$in': return Array.isArray(expected) && expected.includes(value);
      case '$nin': return Array.isArray(expected) && !expected.includes(value);
      case '$exists': return (value !== undefined && value !== null) === Boolean(expected);
      case '$gt': return value > expected;
      case '$gte': return value >= expected;
      case '$lt': return value < expected;
      case '$lte': return value <= expected;
      case '$regex': return new RegExp(expected, cond.$options || '').test(String(value ?? ''));
      default: throw new Error(`Operateur de requete non gere par le backend de dev: ${op}`);
    }
  });
}

export function matches(rec, query) {
  if (!query) return true;
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matches(rec, sub));
    if (key === '$and') return cond.every((sub) => matches(rec, sub));
    if (key === '$nor') return !cond.some((sub) => matches(rec, sub));
    return matchCondition(getPath(rec, key), cond);
  });
}

function compare(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

function project(rec, fields) {
  if (!fields?.length) return rec;
  const out = { id: rec.id };
  for (const f of fields) out[f] = rec[f];
  return out;
}

class Store {
  constructor() {
    this.collections = new Map();
    this.saveTimer = null;
  }

  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, []);
    return this.collections.get(name);
  }

  entityNames() {
    return [...this.collections.keys()].sort();
  }

  counts() {
    return Object.fromEntries(this.entityNames().map((n) => [n, this.collection(n).length]));
  }

  query(name, { q, sort, limit, skip, fields } = {}) {
    let rows = this.collection(name).filter((rec) => matches(rec, q));
    if (sort) {
      const desc = sort.startsWith('-');
      const key = desc ? sort.slice(1) : sort;
      rows = [...rows].sort((a, b) => (desc ? -1 : 1) * compare(getPath(a, key), getPath(b, key)));
    }
    if (skip) rows = rows.slice(Number(skip));
    if (limit) rows = rows.slice(0, Number(limit));
    return rows.map((rec) => project(rec, fields));
  }

  get(name, id) {
    return this.collection(name).find((rec) => rec.id === id) || null;
  }

  create(name, data) {
    const now = new Date().toISOString();
    const rec = {
      id: newId(),
      created_date: now,
      updated_date: now,
      created_by: DEV_USER.email,
      created_by_id: DEV_USER.id,
      ...data,
    };
    this.collection(name).push(rec);
    this.scheduleSave();
    return rec;
  }

  bulkCreate(name, rows) {
    const created = (Array.isArray(rows) ? rows : [rows]).map((data) => this.create(name, data));
    return created;
  }

  update(name, id, data) {
    const rec = this.get(name, id);
    if (!rec) return null;
    Object.assign(rec, data, { id: rec.id, updated_date: new Date().toISOString() });
    this.scheduleSave();
    return rec;
  }

  updateMany(name, query, data) {
    const rows = this.collection(name).filter((rec) => matches(rec, query));
    // Base44 accepte les operateurs Mongo ici ; seul $set est utilise par l'app.
    const patch = data?.$set ?? data;
    for (const rec of rows) Object.assign(rec, patch, { id: rec.id });
    this.scheduleSave();
    return { matched: rows.length, modified: rows.length };
  }

  bulkUpdate(name, rows) {
    return rows.map(({ id, ...data }) => this.update(name, id, data)).filter(Boolean);
  }

  remove(name, id) {
    const rows = this.collection(name);
    const i = rows.findIndex((rec) => rec.id === id);
    if (i === -1) return false;
    rows.splice(i, 1);
    this.scheduleSave();
    return true;
  }

  deleteMany(name, query) {
    const rows = this.collection(name);
    const kept = rows.filter((rec) => !matches(rec, query));
    const deleted = rows.length - kept.length;
    this.collections.set(name, kept);
    this.scheduleSave();
    return { deleted };
  }

  replaceAll(data) {
    this.collections = new Map(Object.entries(data).map(([k, v]) => [k, [...v]]));
    this.save();
  }

  toJSON() {
    return Object.fromEntries([...this.collections.entries()]);
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

mkdirSync(dirname(DATA_FILE), { recursive: true });

export const store = new Store();
