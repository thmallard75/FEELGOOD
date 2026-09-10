// importGeofabrikTiles — recoit des batches de cellules OsmTileCache produits
// par l'ETL Geofabrik (GitHub Actions), persiste dans OsmTileCache (skip doublons)
// et met a jour DepartementPreload (cells_done, status complete sur batch final).
// Protegee par cle de service (header X-Service-Key).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const BATCH_MAX = 2000;

export default async function(req) {
  try {
    const key = req.headers.get('x-service-key');
    if (!key || key !== secrets.get('GEOFABRIK_SERVICE_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { departement_code, batch, is_final, cells_total } = body;
    if (!departement_code || !Array.isArray(batch)) {
      return Response.json({ error: 'Missing departement_code or batch' }, { status: 400 });
    }
    if (batch.length > BATCH_MAX) {
      return Response.json({ error: `Batch too large (max ${BATCH_MAX})` }, { status: 413 });
    }
    if (batch.length === 0 && !is_final) {
      return Response.json({ error: 'Missing departement_code or batch' }, { status: 400 });
    }

    const keys = [...new Set(batch.map((c) => c.cell_key).filter(Boolean))];
    const existing = keys.length
      ? (await base44.asServiceRole.entities.OsmTileCache.filter({ cell_key: { $in: keys } }) || [])
      : [];
    const haveGeo = new Set(existing.filter((r) => r.source === 'geofabrik').map((r) => r.cell_key));
    const fresh = batch.filter((c) => c.cell_key && !haveGeo.has(c.cell_key));

    // Persiste les cellules (skip doublons Geofabrik)
    let created = 0;
    if (fresh.length) {
      try {
        const clean = fresh.map((c) => ({
          cell_key: c.cell_key,
          min_lat: c.min_lat,
          min_lng: c.min_lng,
          max_lat: c.max_lat,
          max_lng: c.max_lng,
          road_data: c.road_data || { roundabouts: [], speedLimits: [], stops: [] },
          element_count: c.element_count || 0,
          fetched_at: new Date().toISOString(),
          source: 'geofabrik',
        }));
        await base44.asServiceRole.entities.OsmTileCache.bulkCreate(clean);
        created = clean.length;
      } catch (e) {
        console.warn('[importGeofabrikTiles] bulk fail, fallback unitaire:', e.message);
        for (const c of fresh) {
          try {
            await base44.asServiceRole.entities.OsmTileCache.create({
              cell_key: c.cell_key,
              min_lat: c.min_lat, min_lng: c.min_lng, max_lat: c.max_lat, max_lng: c.max_lng,
              road_data: c.road_data || { roundabouts: [], speedLimits: [], stops: [] },
              element_count: c.element_count || 0,
              fetched_at: new Date().toISOString(),
              source: 'geofabrik',
            });
            created++;
          } catch (_) { /* doublon ignore */ }
        }
      }
    }

    // Met a jour le DepartementPreload correspondant
    const deps = await base44.asServiceRole.entities.DepartementPreload.filter({ code: departement_code }) || [];
    let depStatus = null, cellsDone = null;
    if (deps[0]) {
      const d = deps[0];
      const done = (d.cells_done || 0) + created;
      const upd = {
        cells_done: done,
        last_sync: new Date().toISOString(),
        status: is_final ? 'complete' : 'downloading',
        error: null,
      };
      if (is_final && cells_total) upd.cells_total = cells_total;
      if (is_final) upd.status = 'complete';
      await base44.asServiceRole.entities.DepartementPreload.update(d.id, upd);
      depStatus = upd.status;
      cellsDone = done;
    }

    console.log(`[importGeofabrikTiles] dep=${departement_code} created=${created} skipped=${batch.length - created} is_final=${!!is_final} status=${depStatus}`);
    return Response.json({ ok: true, created, skipped: Math.max(0, batch.length - created), cells_done: cellsDone, status: depStatus });
  } catch (error) {
    console.error('[importGeofabrikTiles] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}