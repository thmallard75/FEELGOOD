// Jeu de donnees de demonstration.
//
// Les tuiles OSM sont reelles (extraites d'OpenStreetMap par l'ETL Geofabrik,
// secteur de Dossenheim-sur-Zinsel). Les traces GPS sont synthetiques mais
// suivent ces routes reelles, et surtout : aucun score n'est ecrit a la main.
// Les trajets sont crees bruts puis passes a la vraie fonction analyzeTrip,
// qui produit scores, evenements et indice de serenite comme en production.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEV_USER, store } from './store.mjs';
import { buildRoute, injectHarshBraking, trackFromRoute, trackStats } from './routes.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');

const readFixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

function daysAgo(days, hour = 8) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 5, 0, 0);
  return d.toISOString();
}

/** La trace embarquee dans l'app (tripRecorder) n'a pas d'horodatage : le recorder les pose a 1 Hz. */
function timestampTrack(track, startTime) {
  let t = new Date(startTime).getTime();
  return track.map((p) => {
    const point = { ...p, accuracy_m: p.accuracy ?? 5, timestamp: new Date(t).toISOString() };
    delete point.accuracy;
    t += 1000;
    return point;
  });
}

function buildTrips(tiles) {
  const village = buildRoute(tiles, { startName: "Grand'Rue", minVertices: 70 });
  const forest = buildRoute(tiles, { startName: 'Route Forestière du Maibaechel', minVertices: 90 });

  const calme = trackFromRoute(village, {
    startTime: daysAgo(1, 18),
    speedFor: (v) => Math.min(v.speed_limit - 4, 48),
  });

  const presse = injectHarshBraking(
    trackFromRoute(forest, {
      startTime: daysAgo(3, 7),
      // Depassement franc sur la premiere moitie : au-dela des 6 km/h de tolerance.
      speedFor: (v, i, total) => (i < total / 2
        ? Math.min(v.speed_limit + 24, 95)
        : v.speed_limit - 2),
    }),
    0.7,
  );

  const simule = timestampTrack(readFixture('dossenheim_track.json'), daysAgo(5, 14));

  return [
    { title: 'Retour au village', track: calme, weather: 'clear', traffic_level: 'low' },
    { title: 'Route forestière', track: presse, weather: 'rain', traffic_level: 'medium' },
    { title: 'Boucle de simulation', track: simule, weather: 'clear', traffic_level: 'low' },
  ];
}

function parentStatsFrom(trips) {
  const done = trips.filter((t) => t.status === 'completed' && t.overall_score != null);
  const avg = (key) => {
    const vals = done.map((t) => t[key]).filter((v) => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  return {
    weekly_score: avg('overall_score'),
    monthly_score: avg('overall_score'),
    total_km: Math.round(done.reduce((s, t) => s + (t.distance_km || 0), 0) * 10) / 10,
    trips_count_week: done.length,
    trips_count_month: done.length,
    category_scores: {
      anticipation: avg('anticipation_score'),
      vitesse: avg('speed_score'),
      souplesse: avg('smoothness_score'),
      arrets: avg('stop_score'),
    },
    weekly_trend: [],
    alerts: [],
    last_sync: new Date().toISOString(),
  };
}

export async function seed({ force = false } = {}) {
  if (process.env.FEELGOOD_SEED === '0' && !force) {
    if (store.load()) console.log('[api] etat recharge depuis DATA_DIR');
    else console.log('[api] magasin vide — les trajets arriveront depuis l\'app');
    return;
  }
  if (!force && store.load()) {
    console.log('[dev-api] etat precedent recharge (npm run dev:reset pour repartir du seed)');
    return;
  }

  store.replaceAll({});

  const tiles = readFixture('osm_tiles_dossenheim.json');
  store.bulkCreate('OsmTileCache', tiles.map((t) => ({ ...t, cached_at: new Date().toISOString() })));

  store.create('DepartementPreload', {
    code: '67', name: 'Bas-Rhin', status: 'done',
    min_lat: 48.79, min_lng: 7.38, max_lat: 48.82, max_lng: 7.41,
    cells_done: tiles.length, cells_total: tiles.length,
  });
  store.create('RegionDownload', {
    region_code: 'alsace', region_name: 'Alsace', status: 'complete',
    cells_done: tiles.length, cells_total: tiles.length,
  });

  const created = [];
  for (const { title, track, weather, traffic_level } of buildTrips(tiles)) {
    const stats = trackStats(track);
    created.push(store.create('Trip', {
      ...stats,
      status: 'pending_analysis',
      gps_track: track,
      distraction_signals: [],
      weather,
      traffic_level,
      start_address: title,
      end_address: 'Dossenheim-sur-Zinsel',
    }));
  }

  // Les scores viennent de la vraie fonction backend, pas du seed.
  const { invokeFunction } = await import('./functions.mjs');
  for (const trip of created) {
    const { status, data } = await invokeFunction('analyzeTrip', { tripId: trip.id });
    const after = store.get('Trip', trip.id);
    console.log(
      `[dev-api] analyzeTrip "${trip.start_address}" -> ${status}`
      + ` statut=${after?.status} score=${after?.overall_score ?? '-'}`
      + (data?.error ? ` erreur=${data.error}` : ''),
    );
  }

  const analysed = store.query('Trip', {});
  store.create('ParentLink', {
    young_driver_email: DEV_USER.email,
    young_driver_name: DEV_USER.full_name,
    parent_email: DEV_USER.email,
    status: 'active',
    ...parentStatsFrom(analysed),
  });

  store.save();
  console.log('[dev-api] seed termine:', JSON.stringify(store.counts()));
}
