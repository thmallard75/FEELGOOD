// retryPendingDownloads — Reprise automatique des téléchargements de carte
// interrompus. Invoqué par le workflow planifié "Retry Pending Downloads".
// Parcourt les RegionDownload en cours/échoués et relance le pré-fetch par tuile
// (le cache persistant fait progresser chaque cycle).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { prefetchRegionTiles } from '../../shared/osmCache.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const downloading = await base44.asServiceRole.entities.RegionDownload.filter({ status: 'downloading' });
    const failed = await base44.asServiceRole.entities.RegionDownload.filter({ status: 'failed' });
    const pending = await base44.asServiceRole.entities.RegionDownload.filter({ status: 'pending' });
    const all = [...downloading, ...failed, ...pending];

    let processed = 0;
    let complete = 0;

    for (const rd of all) {
      try {
        const result = await prefetchRegionTiles(rd.bbox, base44, 55000);
        await base44.asServiceRole.entities.RegionDownload.update(rd.id, {
          cells_done: result.tiles_done,
          cells_total: result.tiles_total,
          status: result.complete ? 'complete' : 'downloading',
          last_sync: new Date().toISOString(),
          error: result.tiles_failed > 0 && !result.complete ? `${result.tiles_failed} tuile(s) injoignable(s)` : null,
        });
        processed++;
        if (result.complete) complete++;
      } catch (e) {
        console.warn(`[retryPendingDownloads] ${rd.region_code}: ${e.message}`);
      }
    }

    return Response.json({ ok: true, processed, complete, remaining: all.length - complete });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}