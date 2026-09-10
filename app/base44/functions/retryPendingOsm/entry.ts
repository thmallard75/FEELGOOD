/**
 * retryPendingOsm — Re-tente l'analyse OSM des trajets marqués "pending_osm".
 * Appelé automatiquement par le workflow "Retry Pending OSM" (toutes les 10 min).
 * Aucune session utilisateur requise (exécution workflow/service role).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const trips = await base44.asServiceRole.entities.Trip.filter({ status: 'pending_osm' }, '-created_date', 50);
  if (!trips.length) return Response.json({ ok: true, total: 0, processed: 0, still_pending: 0 });

  console.log(`[retryPendingOsm] ${trips.length} trajet(s) en attente OSM`);
  let processed = 0, stillPending = 0;

  for (const t of trips) {
    if (!t.gps_track || t.gps_track.length < 5) continue;
    try {
      await base44.asServiceRole.entities.Trip.update(t.id, { status: 'syncing' });
      const res = await base44.functions.invoke('analyzeTrip', { tripId: t.id });
      if (res?.data?.osm_failed) stillPending++;
      else processed++;
    } catch (err) {
      stillPending++;
      await base44.asServiceRole.entities.Trip.update(t.id, { status: 'pending_osm' }).catch(() => {});
      console.error(`[retryPendingOsm] ✗ ${t.id}: ${err.message}`);
    }
  }

  console.log(`[retryPendingOsm] terminé : ${processed} réussi(s), ${stillPending} toujours en attente`);
  return Response.json({ ok: true, total: trips.length, processed, still_pending: stillPending });
});