// detectDepartementsToPreload — balaie les trajets recents, detecte les
// departements traverses et enfile (status pending) ceux non deja couverts.
// Appelee par le workflow planifie (sans session utilisateur).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { haversine } from '../../shared/osmCore.ts';
import { DEPARTEMENTS, getDepartementForPoint, getDepartementByCode, estimateCells } from '../../shared/departementCatalog.ts';

const WINDOW_DAYS = 14;
const SAMPLE_M = 2000; // un point GPS tous les ~2 km

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Trajets recents (recent-first, plafond 500)
    const trips = await base44.asServiceRole.entities.Trip.list('-created_date', 500) || [];
    const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
    const recent = trips.filter((t) => t.start_time && new Date(t.start_time) >= cutoff && t.gps_track?.length);

    // 2. Detection point-in-bbox echantillonnee
    const detected = new Map(); // code -> count
    for (const trip of recent) {
      const track = trip.gps_track;
      let prev = null, acc = 0;
      for (const p of track) {
        if (prev) acc += haversine(prev.lat, prev.lng, p.lat, p.lng);
        if (!prev || acc >= SAMPLE_M) {
          const dept = getDepartementForPoint(p.lat, p.lng);
          if (dept) detected.set(dept.code, (detected.get(dept.code) || 0) + 1);
          prev = p;
          acc = 0;
        }
      }
      // point final
      const last = track[track.length - 1];
      const dept = getDepartementForPoint(last.lat, last.lng);
      if (dept) detected.set(dept.code, (detected.get(dept.code) || 0) + 1);
    }

    // 3. Filtrer ceux deja presents (quel que soit le status)
    const existing = await base44.asServiceRole.entities.DepartementPreload.list('-created_date', 500) || [];
    const existingCodes = new Set(existing.map((d) => d.code));

    const toCreate = [];
    for (const [code, count] of detected) {
      if (existingCodes.has(code)) continue;
      const dept = getDepartementByCode(code);
      if (!dept) continue;
      toCreate.push({
        code,
        name: dept.name,
        bbox: dept.bbox,
        status: 'pending',
        cells_total: estimateCells(dept.bbox),
        cells_done: 0,
        detected_from_trips: count,
      });
    }

    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.DepartementPreload.bulkCreate(toCreate);
    }

    console.log(`[detectDepartements] recent=${recent.length} detected=${detected.size} created=${toCreate.length}`);
    return Response.json({
      ok: true,
      recent_trips: recent.length,
      detected_departements: Array.from(detected.entries()).map(([code, count]) => ({ code, count })),
      created: toCreate.map((d) => d.code),
    });
  } catch (error) {
    console.error('[detectDepartements] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}