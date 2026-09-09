// computeCoaching — génère le bilan moniteur (KPI + erreurs + axes LLM).
// - { tripId }                  → bilan du trajet (caché sur trip.coach_review)
// - { period: 'week'|'month' }  → bilan agrégé sur 7/30 jours
// - { days: number | null }     → bilan agrégé sur N jours (null = tout)
//   Renvoie aussi un `delta` vs la période précédente de même durée.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { computeTripKpis, detectTripErrors, computeAggregateKpis, generateCoachReview } from '../../shared/kpiEngine.ts';

function round1(v: number | null) { return v == null ? null : Math.round(v * 10) / 10; }

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { tripId, period, days } = body;

    // ── Mode trajet ───────────────────────────────────────────────
    if (tripId) {
      const trips = await base44.entities.Trip.filter({ id: tripId });
      const trip = trips[0];
      if (!trip) return Response.json({ error: 'Trip not found' }, { status: 404 });
      const events = await base44.entities.DrivingEvent.filter({ trip_id: tripId });
      const kpis = computeTripKpis(trip, events);
      const errors = detectTripErrors(trip, events);
      const coach = await generateCoachReview(base44, { mode: 'trip', kpis, errors });
      const review = { kpis, errors, summary: coach.summary, axes: coach.axes, source: coach.source, generated_at: new Date().toISOString() };
      await base44.asServiceRole.entities.Trip.update(tripId, { coach_review: review });
      return Response.json({ ok: true, review });
    }

    // ── Mode agrégé ───────────────────────────────────────────────
    const dayCount = days != null ? days : (period === 'month' ? 30 : 7);
    const allTrips = await base44.entities.Trip.list('-start_time', 500);
    const now = Date.now();

    let currentTrips: any[];
    let previousTrips: any[] | null = null;
    if (dayCount == null) {
      currentTrips = allTrips;
    } else {
      const sinceMs = now - dayCount * 86400000;
      currentTrips = allTrips.filter((t: any) => t.start_time && new Date(t.start_time).getTime() >= sinceMs);
      const prevSinceMs = sinceMs - dayCount * 86400000;
      previousTrips = allTrips.filter((t: any) => {
        const ts = t.start_time ? new Date(t.start_time).getTime() : 0;
        return ts >= prevSinceMs && ts < sinceMs;
      });
    }

    const curIds = new Set(currentTrips.map((t: any) => t.id));
    const prevIds = previousTrips ? new Set(previousTrips.map((t: any) => t.id)) : new Set();
    const allIds = new Set([...curIds, ...prevIds]);
    let allEvents: any[] = [];
    if (allIds.size) {
      const fetched = await base44.entities.DrivingEvent.list('-created_date', 2000);
      allEvents = fetched.filter((e: any) => allIds.has(e.trip_id));
    }
    const curEvents = allEvents.filter((e: any) => curIds.has(e.trip_id));

    const kpis = computeAggregateKpis(currentTrips, curEvents);
    const coach = await generateCoachReview(base44, { mode: 'aggregate', kpis });
    const review = { kpis, summary: coach.summary, axes: coach.axes, source: coach.source, generated_at: new Date().toISOString() };

    let delta: any = null;
    if (previousTrips && previousTrips.length) {
      const prevEvents = allEvents.filter((e: any) => prevIds.has(e.trip_id));
      const prevKpis = computeAggregateKpis(previousTrips, prevEvents);
      const m = kpis.mastery, p = prevKpis.mastery;
      delta = {
        overall: round1((m.overall ?? 0) - (p.overall ?? 0)),
        anticipation: round1((m.anticipation ?? 0) - (p.anticipation ?? 0)),
        stop: round1((m.stop ?? 0) - (p.stop ?? 0)),
        speed: round1((m.speed ?? 0) - (p.speed ?? 0)),
        smoothness: round1((m.smoothness ?? 0) - (p.smoothness ?? 0)),
        attention: round1((m.attention ?? 0) - (p.attention ?? 0)),
      };
    }

    return Response.json({ ok: true, review, delta });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}