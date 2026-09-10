/**
 * reanalyzeAllTrips — Re-lance analyzeTrip pour tous les trajets complétés
 * Réservé aux admins.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Optionnel : `limit` ne retraiter que les N derniers trajets
  const { limit } = await req.json().catch(() => ({})) || {};
  // Récupérer tous les trajets complétés avec une trace GPS (+ pending_osm pour rattrapage)
  let trips = await base44.asServiceRole.entities.Trip.filter({ status: 'completed' }, '-created_date', 200);
  const pending = await base44.asServiceRole.entities.Trip.filter({ status: 'pending_osm' }, '-created_date', 200);
  trips = [...trips, ...pending];
  let toProcess = trips.filter(t => t.gps_track && t.gps_track.length >= 5);
  if (limit && limit > 0) toProcess = toProcess.slice(0, limit);

  console.log(`[reanalyzeAllTrips] ${toProcess.length} trajets à retraiter${limit ? ` (limit ${limit})` : ''}`);

  let success = 0, failed = 0;
  for (const trip of toProcess) {
    try {
      await base44.asServiceRole.entities.Trip.update(trip.id, { status: 'syncing' });
      await base44.functions.invoke('analyzeTrip', { tripId: trip.id });
      success++;
      console.log(`[reanalyzeAllTrips] ✓ Trip ${trip.id} (${success}/${toProcess.length})`);
    } catch (err) {
      failed++;
      console.error(`[reanalyzeAllTrips] ✗ Trip ${trip.id}: ${err.message}`);
      await base44.asServiceRole.entities.Trip.update(trip.id, { status: 'completed' }).catch(() => {});
    }
  }

  return Response.json({ ok: true, total: toProcess.length, success, failed });
});