// File d'attente Geofabrik : departements Grand Est en pending.
// L'ETL GitHub Actions lit cette liste, parse le PBF regional, et pousse
// les tuiles dans OsmTileCache — c'est la source de qualite des KPI.

import { DEPARTEMENTS, estimateCells, GRAND_EST_CODES } from '../base44/shared/departementCatalog.ts';
import { store } from './store.mjs';

export { GRAND_EST_CODES };

export function seedGrandEstDepartements() {
  if (process.env.GEOFABRIK_SEED_GRAND_EST !== '1') return [];
  const existing = new Set(store.query('DepartementPreload', {}).map((d) => d.code));
  const created = [];
  for (const code of GRAND_EST_CODES) {
    if (existing.has(code)) continue;
    const dept = DEPARTEMENTS.find((d) => d.code === code);
    if (!dept) continue;
    store.create('DepartementPreload', {
      code,
      name: dept.name,
      bbox: dept.bbox,
      status: 'pending',
      cells_total: estimateCells(dept.bbox),
      cells_done: 0,
      detected_from_trips: 0,
      region: 'grand_est',
    });
    created.push(code);
  }
  if (created.length) {
    console.log(`[api] Geofabrik Grand Est enfile: ${created.join(', ')}`);
  }
  return created;
}
