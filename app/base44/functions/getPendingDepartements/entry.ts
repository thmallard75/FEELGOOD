// getPendingDepartements — renvoie la liste des departements en attente de
// preload + leur bbox. Protégee par cle de service (header X-Service-Key).
// Appelee par le workflow GitHub Actions.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const key = req.headers.get('x-service-key');
    if (!key || key !== secrets.get('GEOFABRIK_SERVICE_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const base44 = createClientFromRequest(req);
    const list = await base44.asServiceRole.entities.DepartementPreload.filter({ status: 'pending' }, '-created_date', 200) || [];
    return Response.json({
      pending: list.map((d) => ({
        code: d.code,
        name: d.name,
        bbox: d.bbox,
        cells_total: d.cells_total,
      })),
    });
  } catch (error) {
    console.error('[getPendingDepartements] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}