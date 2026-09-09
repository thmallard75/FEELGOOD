import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = user.id;
    const counts = { trips: 0, events: 0, parent_links: 0 };

    // 1. Trips + their driving events (filter by created_by_id, then cascade)
    const trips = await base44.asServiceRole.entities.Trip.filter({ created_by_id: userId });
    if (trips.length) {
      const tripIds = trips.map((t) => t.id);
      await base44.asServiceRole.entities.DrivingEvent.deleteMany({ trip_id: { $in: tripIds } });
      await base44.asServiceRole.entities.Trip.deleteMany({ created_by_id: userId });
      counts.trips = trips.length;
    }

    // 2. Parent links where this user is the young driver or the creator
    const asYoung = await base44.asServiceRole.entities.ParentLink.filter({ young_driver_email: user.email });
    const asCreator = await base44.asServiceRole.entities.ParentLink.filter({ created_by_id: userId });
    if (asYoung.length) {
      await base44.asServiceRole.entities.ParentLink.deleteMany({ young_driver_email: user.email });
    }
    if (asCreator.length) {
      await base44.asServiceRole.entities.ParentLink.deleteMany({ created_by_id: userId });
    }
    counts.parent_links = asYoung.length + asCreator.length;

    return Response.json({ ok: true, deleted: counts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}