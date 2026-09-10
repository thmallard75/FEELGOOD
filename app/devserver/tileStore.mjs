// Tuiles OSM en table Postgres (hors du blob JSONB feelgood_store).
// Geofabrik Grand Est fait trop de cellules pour tenir dans 512 Mo de RAM
// si tout le cache est recharge a chaque demarrage.

export const TILE_ENTITY = 'OsmTileCache';

const LIST_CAP = 5000;
const IN_CAP = 2000;

function project(rec, fields) {
  if (!fields?.length) return rec;
  const out = { id: rec.id };
  for (const f of fields) out[f] = rec[f];
  return out;
}

function buildRecord(data, actor, newId) {
  const now = new Date().toISOString();
  const {
    id: _id,
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

function isInsert(row) {
  return row?.inserted === true || row?.inserted === 't';
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
    await this.refreshCount();
  }

  async migrateFrom(rows) {
    if (!rows?.length) return 0;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const rec of rows) await this.upsertWith(client, rec);
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
    await this.refreshCount();
    return rows.length;
  }

  async refreshCount() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM feelgood_osm_tiles');
    this.count = rows[0]?.n || 0;
    return this.count;
  }

  async upsert(rec) {
    return this.upsertWith(this.pool, rec);
  }

  async upsertWith(db, rec) {
    const cellKey = rec.cell_key || '';
    const source = rec.source || '';
    const result = await db.query(
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
      if (cell.$in.length > IN_CAP) return [];
      params.push(cell.$in);
      clauses.push(`cell_key = ANY($${params.length}::text[])`);
    } else if (typeof cell === 'string') {
      params.push(cell);
      clauses.push(`cell_key = $${params.length}`);
    } else if (q && Object.keys(q).length) {
      // Pas de SELECT * + filtre JS : un filtre inconnu viderait la RAM Render.
      return [];
    }

    const capped = Math.min(Math.max(Number(limit) || (clauses.length ? IN_CAP : 200), 1), LIST_CAP);
    let sql = 'SELECT data FROM feelgood_osm_tiles';
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    if (sort) {
      const desc = sort.startsWith('-');
      const key = desc ? sort.slice(1) : sort;
      params.push(key);
      sql += ` ORDER BY data->>$${params.length} ${desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`;
    }
    params.push(capped);
    sql += ` LIMIT $${params.length}`;
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
    if (isInsert(row)) this.count += 1;
    return row.data || rec;
  }

  async bulkCreate(rows, actor) {
    const list = Array.isArray(rows) ? rows : [rows];
    const client = await this.pool.connect();
    const out = [];
    let inserted = 0;
    try {
      await client.query('BEGIN');
      for (const data of list) {
        const rec = buildRecord(data, actor, this.newId);
        const row = await this.upsertWith(client, rec);
        if (isInsert(row)) inserted += 1;
        out.push(row.data || rec);
      }
      await client.query('COMMIT');
      this.count += inserted;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      await this.refreshCount();
      throw e;
    } finally {
      client.release();
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
    const cell = query?.cell_key;
    if (typeof cell === 'string') {
      const result = await this.pool.query(
        'DELETE FROM feelgood_osm_tiles WHERE cell_key = $1',
        [cell],
      );
      await this.refreshCount();
      return { deleted: result.rowCount || 0 };
    }
    if (cell && Array.isArray(cell.$in) && cell.$in.length && cell.$in.length <= IN_CAP) {
      const result = await this.pool.query(
        'DELETE FROM feelgood_osm_tiles WHERE cell_key = ANY($1::text[])',
        [cell.$in],
      );
      await this.refreshCount();
      return { deleted: result.rowCount || 0 };
    }
    return { deleted: 0 };
  }
}
