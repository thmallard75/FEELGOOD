/**
 * Magasin d'entites en memoire, reproduisant la surface de requetes de Base44
 * (equalite, $or, $in, $exists, tri, limit, skip, projection).
 *
 * Sert deux appelants : le backend de developpement (devserver/) et le mode
 * demonstration statique du navigateur (src/api/demoClient.js). Aucune
 * dependance, ni Node ni navigateur, pour rester utilisable des deux cotes.
 */

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
      case '$options': return true;
      default: throw new Error(`Operateur de requete non gere: ${op}`);
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

let counter = 0;
const defaultIdGenerator = () => {
  counter += 1;
  return `${Date.now().toString(16)}${counter.toString(16).padStart(6, '0')}`;
};

function withoutOwnership(data, { keepId = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data || {};
  const {
    id,
    created_by: _cb,
    created_by_id: _cbi,
    created_date: _cd,
    ...rest
  } = data;
  return keepId && id ? { id, ...rest } : rest;
}

export class MemoryStore {
  constructor({ newId = defaultIdGenerator, actor = {} } = {}) {
    this.collections = new Map();
    this.newId = newId;
    this.actor = actor;
    this.onChange = null;
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

  changed() {
    this.onChange?.();
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

  create(name, data, actor = this.actor) {
    const now = new Date().toISOString();
    const rest = withoutOwnership(data, { keepId: true });
    const rec = {
      id: rest.id || this.newId(),
      created_date: now,
      updated_date: now,
      ...rest,
      created_by: actor?.email,
      created_by_id: actor?.id,
    };
    this.collection(name).push(rec);
    this.changed();
    return rec;
  }

  bulkCreate(name, rows, actor = this.actor) {
    return (Array.isArray(rows) ? rows : [rows]).map((data) => this.create(name, data, actor));
  }

  update(name, id, data) {
    const rec = this.get(name, id);
    if (!rec) return null;
    Object.assign(rec, withoutOwnership(data), { id: rec.id, updated_date: new Date().toISOString() });
    this.changed();
    return rec;
  }

  updateMany(name, query, data) {
    const rows = this.collection(name).filter((rec) => matches(rec, query));
    const patch = withoutOwnership(data?.$set ?? data);
    for (const rec of rows) Object.assign(rec, patch, { id: rec.id });
    this.changed();
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
    this.changed();
    return true;
  }

  deleteMany(name, query) {
    const rows = this.collection(name);
    const kept = rows.filter((rec) => !matches(rec, query));
    const deleted = rows.length - kept.length;
    this.collections.set(name, kept);
    this.changed();
    return { deleted };
  }

  replaceAll(data) {
    this.collections = new Map(Object.entries(data).map(([k, v]) => [k, [...v]]));
    this.changed();
  }

  toJSON() {
    return Object.fromEntries([...this.collections.entries()]);
  }
}
