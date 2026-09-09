// prefetchRegion — Lance (ou reprend) le téléchargement de carte OSM d'une région.
// Découpe la bbox en tuiles, fetch Overpass pour les cellules manquantes, persiste
// dans OsmTileCache (partagé). Garde-fou 38 s → l'app renvoie la progression et
// peut être ré-invoquée pour reprendre là où elle s'est arrêtée (cache persistant).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { prefetchRegionTiles } from '../../shared/osmCache.ts';
import { getRegion, estimateCells } from '../../shared/regionCatalog.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { regionCode } = await req.json();
    const region = getRegion(regionCode);
    if (!region) return Response.json({ error: 'Région inconnue' }, { status: 400 });

    // Trouver ou créer l'enregistrement de progression de l'utilisateur
    let record = null;
    try {
      const existing = await base44.entities.RegionDownload.filter({ region_code: regionCode });
      record = existing[0];
    } catch (e) {
      /* ignore */
    }
    if (!record) {
      record = await base44.entities.RegionDownload.create({
        region_code: regionCode,
        region_name: region.name,
        bbox: region.bbox,
        status: 'downloading',
        cells_total: estimateCells(region.bbox),
        cells_done: 0,
      });
    } else {
      await base44.entities.RegionDownload.update(record.id, { status: 'downloading', error: null });
    }

    const result = await prefetchRegionTiles(region.bbox, base44, 70000);

    await base44.entities.RegionDownload.update(record.id, {
      cells_done: result.tiles_done,
      cells_total: result.tiles_total,
      status: result.complete ? 'complete' : 'downloading',
      last_sync: new Date().toISOString(),
      error: result.tiles_failed > 0 && !result.complete ? `${result.tiles_failed} tuile(s) injoignable(s)` : null,
    });

    return Response.json({ ok: true, region: regionCode, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}