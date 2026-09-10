// Fabrique des traces GPS de demonstration.
//
// Les itineraires suivent la geometrie reelle des routes de la fixture
// OsmTileCache (extraite d'OpenStreetMap par l'ETL Geofabrik), et les points
// sont interpoles a 1 Hz comme le fait le recorder de l'application. Seul le
// comportement de conduite est synthetique : il n'existe pas de trace reelle
// d'utilisateur a embarquer dans le depot.

const EARTH_R = 6371000;

export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const key = (lat, lng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

function buildGraph(tiles) {
  const segments = [];
  for (const tile of tiles) {
    for (const s of tile.road_data.speedLimits || []) segments.push(s);
  }
  // Les segments OSM sont orientes ; on les indexe par leurs deux extremites
  // pour pouvoir remonter une voie a contresens et allonger l'itineraire.
  const byNode = new Map();
  const add = (k, entry) => {
    if (!byNode.has(k)) byNode.set(k, []);
    byNode.get(k).push(entry);
  };
  for (const s of segments) {
    add(key(s.lat_start, s.lon_start), { segment: s, reversed: false });
    add(key(s.lat_end, s.lon_end), { segment: s, reversed: true });
  }
  return { segments, byNode };
}

const endOf = ({ segment, reversed }) => (reversed
  ? { lat: segment.lat_start, lng: segment.lon_start }
  : { lat: segment.lat_end, lng: segment.lon_end });

/**
 * Chaine des segments bout a bout pour obtenir une polyligne continue.
 * Privilegie la continuite de voie (meme osm_id) pour eviter des itineraires
 * qui zigzaguent d'une rue a l'autre a chaque intersection.
 */
export function buildRoute(tiles, { startName, minVertices = 60 } = {}) {
  const { segments, byNode } = buildGraph(tiles);
  const first = startName
    ? segments.find((s) => s.name === startName)
    : segments.find((s) => s.name);
  if (!first) throw new Error(`aucun segment de depart pour ${startName ?? '(premiere voie nommee)'}`);

  const used = new Set();
  let current = { segment: first, reversed: false };
  const head = current.reversed
    ? { lat: first.lat_end, lng: first.lon_end }
    : { lat: first.lat_start, lng: first.lon_start };
  const polyline = [{ ...head, speed_limit: first.speed, road_type: first.type }];

  while (polyline.length < minVertices) {
    used.add(current.segment);
    const tip = endOf(current);
    polyline.push({ ...tip, speed_limit: current.segment.speed, road_type: current.segment.type });

    const candidates = (byNode.get(key(tip.lat, tip.lng)) || [])
      .filter((c) => !used.has(c.segment));
    if (!candidates.length) break;
    // Rester sur la meme voie tant que possible, sinon prendre la plus rapide :
    // un itineraire qui change de rue a chaque intersection ne ressemble a rien.
    candidates.sort((a, b) => {
      const sameA = a.segment.osm_id === current.segment.osm_id ? 0 : 1;
      const sameB = b.segment.osm_id === current.segment.osm_id ? 0 : 1;
      return sameA - sameB || b.segment.speed - a.segment.speed;
    });
    current = candidates[0];
  }

  return polyline;
}

/**
 * Interpole la polyligne a 1 Hz selon un profil de conduite.
 *
 * `speedFor(vertex, index, total)` rend la vitesse visee en km/h, ce qui permet
 * de composer des comportements (respect des limites, exces, freinage brusque)
 * sans dupliquer l'interpolation.
 */
export function trackFromRoute(polyline, { startTime, speedFor }) {
  const track = [];
  let t = new Date(startTime).getTime();

  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const dist = haversine(a.lat, a.lng, b.lat, b.lng);
    if (dist < 0.5) continue;

    const speedKmh = Math.max(5, speedFor(a, i, polyline.length));
    const steps = Math.max(1, Math.round(dist / (speedKmh / 3.6)));

    for (let s = 0; s < steps; s += 1) {
      const f = s / steps;
      track.push({
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
        speed_kmh: Math.round(speedKmh * 10) / 10,
        accuracy_m: 5,
        timestamp: new Date(t).toISOString(),
      });
      t += 1000;
    }
  }

  const last = polyline.at(-1);
  track.push({
    lat: last.lat, lng: last.lng, speed_kmh: 0, accuracy_m: 5, timestamp: new Date(t).toISOString(),
  });
  return track;
}

/** Insere un freinage brusque : -20 km/h en 1 s depasse le seuil de 0,3 g. */
export function injectHarshBraking(track, atRatio) {
  const i = Math.floor(track.length * atRatio);
  if (i < 2 || i >= track.length - 2) return track;
  track[i] = { ...track[i], speed_kmh: Math.max(5, track[i].speed_kmh - 22) };
  track[i + 1] = { ...track[i + 1], speed_kmh: Math.max(5, track[i].speed_kmh - 6) };
  return track;
}

export function trackStats(track) {
  let distanceM = 0;
  for (let i = 1; i < track.length; i += 1) {
    distanceM += haversine(track[i - 1].lat, track[i - 1].lng, track[i].lat, track[i].lng);
  }
  const speeds = track.map((p) => p.speed_kmh || 0);
  const first = track[0];
  const last = track.at(-1);
  const startMs = new Date(first.timestamp).getTime();
  const endMs = new Date(last.timestamp).getTime();
  return {
    distance_km: Math.round((distanceM / 1000) * 100) / 100,
    duration_minutes: Math.max(1, Math.round((endMs - startMs) / 60000)),
    avg_speed_kmh: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
    max_speed_kmh: Math.round(Math.max(...speeds) * 10) / 10,
    start_latitude: first.lat,
    start_longitude: first.lng,
    end_latitude: last.lat,
    end_longitude: last.lng,
    start_time: new Date(startMs).toISOString(),
    end_time: new Date(endMs).toISOString(),
    gps_points_count: track.length,
  };
}
