// Tuiles OSM en table Postgres (hors du blob JSONB feelgood_store).
// Geofabrik Grand Est fait trop de cellules pour tenir dans 512 Mo de RAM
// si tout le cache est recharge a chaque demarrage.

import { matches } from '../src/lib/memoryStore.js';

export const TILE_ENTITY = 'OsmTileCache';

function project(rec, fields) {
  if (!fields?.length) return rec;
  const out = { id: rec.id };
  for (const f of fields) out[f] = rec[f];
  return out;
}

function sortLimit(rows, { sort, limit, skip, fields } = {}) {
  let next = rows;
  if (sort) {
    const desc = sort.startsWith('-');
    const key = desc ? sort.slice(1) : sort;
    next = [...next].sort((a, b) => {
      const av = a?.[key];
      const bv = b?.[key];
      if (av === bv) return 0;
      if (av == null) return -1;
      if (bv == null) return 1;
      return (desc ? -1 : 1) * (av < bv ? -1 : 1);
    });
  }
  if (skip) next = next.slice(Number(skip));
  if (limit) next = next.slice(0, Number(limit));
  return next.map((rec) => project(rec, fields));
}

function buildRecord(data, actor, newId) {
  const now = new Date().toISOString();
  const {
    id,
    created_by: _cb,
    created_by_id: _cbi,
    created_date: _cd,
    updated_date: _ud,
    ...rest
  } = data || {};
  return {
    id: (data && data.id) || newId(),
    created_date: data?.created_date || now,
    updated_date: now,
    ...rest,
    created_by: actor?.email,
    created_by_id: actor?.id,
  };
}

export function createPgTileStore(pool, { newId }) {
  return new PgTileStore(pool, newId);
}

class PgTileStore {
  constructor(pool, newId) {
    this.pool = pool;
    this.newId = newId;
    this.count = 0;
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS feelgood_osm_tiles (
        id TEXT PRIMARY KEY,
        cell_key TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT '',
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS feelgood_osm_tiles_cell_key
      ON feelgood_osm_tiles (cell_key)
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS feelgood_osm_tiles_cell_source
      ON feelgood_osm_tiles (cell_key, source)
    `);
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM feelgood_osm_tiles');
    this.count = rows[0]?.n || 0;
  }

  async migrateFrom(rows) {
    if (!rows?.length) return 0;
    let n = 0;
    for (const rec of rows) {
      await this.upsert(rec);
      n += 1;
    }
    await this.refreshCount();
    return n;
  }

  async refreshCount() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM feelgood_osm_tiles');
    this.count = rows[0]?.n || 0;
    return this.count;
  }

  async upsert(rec) {
    const cellKey = rec.cell_key || '';
    const source = rec.source || '';
    const result = await this.pool.query(
      `INSERT INTO feelgood_osm_tiles (id, cell_key, source, data, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (cell_key, source) DO UPDATE SET
         data = EXCLUDED.data || jsonb_build_object(
           'id', feelgood_osm_tiles.data->>'id',
           'created_date', feelgood_osm_tiles.data->>'created_date'
         ),
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted, data`,
      [rec.id, cellKey, source, rec],
    );
    return result.rows[0] || { inserted: false, data: rec };
  }

  async query({ q, sort, limit, skip, fields } = {}) {
    const params = [];
    const clauses = [];
    const cell = q?.cell_key;
    if (cell && typeof cell === 'object' && Array.isArray(cell.$in)) {
      params.push(cell.$in);
      clauses.push(`cell_key = ANY($${params.length}::text[])`);
    } else if (typeof cell === 'string') {
      params.push(cell);
      clauses.push(`cell_key = $${params.length}`);
    } else if (q && Object.keys(q).length) {
      const { rows } = await this.pool.query('SELECT data FROM feelgood_osm_tiles');
      return sortLimit(rows.map((r) => r.data).filter((rec) => matches(rec, q)), {
        sort, limit, skip, fields,
      });
    }

    let sql = 'SELECT data FROM feelgood_osm_tiles';
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    if (sort) {
      const desc = sort.startsWith('-');
      const key = desc ? sort.slice(1) : sort;
      params.push(key);
      sql += ` ORDER BY data->>$${params.length} ${desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`;
    }
    if (limit) {
      params.push(Number(limit));
      sql += ` LIMIT $${params.length}`;
    }
    if (skip) {
      params.push(Number(skip));
      sql += ` OFFSET $${params.length}`;
    }
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => project(r.data, fields));
  }

  async get(id) {
    const { rows } = await this.pool.query(
      'SELECT data FROM feelgood_osm_tiles WHERE id = $1',
      [id],
    );
    return rows[0]?.data || null;
  }

  async create(data, actor) {
    const rec = buildRecord(data, actor, this.newId);
    const row = await this.upsert(rec);
    if (row.inserted === true || row.inserted === 't') this.count += 1;
    return row.data || rec;
  }

  async bulkCreate(rows, actor) {
    const list = Array.isArray(rows) ? rows : [rows];
    const out = [];
    await this.pool.query('BEGIN');
    try {
      for (const data of list) out.push(await this.create(data, actor));
      await this.pool.query('COMMIT');
    } catch (e) {
      await this.pool.query('ROLLBACK');
      await this.refreshCount();
      throw e;
    }
    return out;
  }

  async update(id, data) {
    const rec = await this.get(id);
    if (!rec) return null;
    const {
      id: _id, created_by: _cb, created_by_id: _cbi, created_date: _cd, ...rest
    } = data || {};
    const next = { ...rec, ...rest, id: rec.id, updated_date: new Date().toISOString() };
    await this.pool.query(
      `UPDATE feelgood_osm_tiles
       SET cell_key = $2, source = $3, data = $4::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [id, next.cell_key || '', next.source || '', next],
    );
    return next;
  }

  async updateMany(query, data) {
    const rows = await this.query({ q: query });
    const patch = data?.$set ?? data ?? {};
    for (const rec of rows) await this.update(rec.id, patch);
    return { matched: rows.length, modified: rows.length };
  }

  async bulkUpdate(rows) {
    const out = [];
    for (const { id, ...data } of rows || []) {
      const rec = await this.update(id, data);
      if (rec) out.push(rec);
    }
    return out;
  }

  async remove(id) {
    const result = await this.pool.query(
      'DELETE FROM feelgood_osm_tiles WHERE id = $1',
      [id],
    );
    const deleted = result.rowCount > 0;
    if (deleted) this.count = Math.max(0, this.count - 1);
    return deleted;
  }

  async deleteMany(query) {
    const rows = await this.query({ q: query });
    for (const rec of rows) await this.remove(rec.id);
    return { deleted: rows.length };
  }
}
