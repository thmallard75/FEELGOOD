/**
 * Proxy OSM — requête Overpass unique combinée (ronds-points + vitesses + stops)
 * Si Overpass échoue, retourne des tableaux vides (pas d'erreur fatale).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const DEFAULTS_FR = {
  motorway: 130, motorway_link: 110,
  trunk: 110, trunk_link: 90,
  primary: 80, primary_link: 80,
  secondary: 80, secondary_link: 80,
  tertiary: 80, tertiary_link: 80,
  unclassified: 80,
  residential: 30,
  living_street: 20,
  service: 30,
  road: 50,
};

function parseMaxspeed(tag) {
  if (!tag) return null;
  const num = parseInt(tag);
  if (!isNaN(num) && num > 0) return num;
  const lower = tag.toLowerCase();
  if (lower.includes('urban')) return 50;
  if (lower.includes('rural')) return 80;
  if (lower.includes('motorway')) return 130;
  if (lower.includes('living_street') || lower.includes('walk')) return 20;
  if (lower.includes('mph')) { const mph = parseInt(lower); if (!isNaN(mph)) return Math.round(mph * 1.609); }
  return null;
}

async function fetchEndpoint(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FeelGoodConduite/1.0 (mobile driving app)',
        'Accept': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.elements) throw new Error('No elements');
    return json.elements;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function queryOverpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  try {
    return await Promise.any(ENDPOINTS.map(url => fetchEndpoint(url, body)));
  } catch {
    return null;
  }
}

function parseRoundabouts(elements) {
  return elements
    .filter(el => el.tags?.junction === 'roundabout' && (el.center || el.geometry?.length > 0 || (el.lat && el.lon)))
    .map(el => {
      let centerLat, centerLon;
      if (el.center) {
        centerLat = el.center.lat;
        centerLon = el.center.lon;
      } else if (el.geometry?.length > 0) {
        const lats = el.geometry.map(p => p.lat);
        const lons = el.geometry.map(p => p.lon);
        centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;
      } else {
        centerLat = el.lat;
        centerLon = el.lon;
      }
      const maxspeed = el.tags?.maxspeed ? parseInt(el.tags.maxspeed) : null;
      return {
        lat: centerLat,
        lon: centerLon,
        maxspeed: (!isNaN(maxspeed) && maxspeed > 0) ? maxspeed : 30,
        id: `rb_osm_${el.id}`,
      };
    });
}

function parseSpeedLimits(elements) {
  const result = [];
  const NON_MOTOR = ['footway', 'cycleway', 'path', 'pedestrian', 'steps', 'track', 'bridleway'];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry?.length || !el.tags?.highway) continue;
    if (el.tags?.junction === 'roundabout') continue; // déjà traité
    const hw = el.tags.highway;
    if (NON_MOTOR.includes(hw)) continue;

    let speed = parseMaxspeed(el.tags.maxspeed);
    const hasExplicit = speed !== null;
    if (!speed) speed = DEFAULTS_FR[hw] || 50;

    const roadType = (hw === 'motorway' || hw === 'trunk') ? 'highway'
      : (hw === 'primary' || hw === 'secondary' || hw === 'tertiary' || hw === 'unclassified') ? 'periurban'
      : 'urban';
    const name = el.tags.name || null;

    for (let i = 0; i < el.geometry.length - 1; i++) {
      const a = el.geometry[i], b = el.geometry[i + 1];
      result.push({
        lat_start: a.lat, lon_start: a.lon,
        lat_end: b.lat, lon_end: b.lon,
        speed, type: roadType, highway: hw, name,
        osm_id: el.id, explicit: hasExplicit,
      });
    }
  }
  return result;
}

function parseStops(elements) {
  return elements
    .filter(el => el.type === 'node' && el.lat && el.lon &&
      (el.tags?.highway === 'stop' || el.tags?.traffic_sign === 'stop'))
    .map(el => ({ lat: el.lat, lon: el.lon, id: `stop_osm_${el.id}` }));
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { lat, lng } = await req.json();
  if (!lat || !lng) {
    return Response.json({ error: 'Missing params' }, { status: 400 });
  }

  // Requête unique combinée : ronds-points (600m) + routes (500m) + stops (500m)
  const query = `[out:json][timeout:12];(way[junction=roundabout](around:600,${lat},${lng});node[junction=roundabout](around:600,${lat},${lng});way[highway](around:500,${lat},${lng});node["highway"="stop"](around:500,${lat},${lng});node["traffic_sign"="stop"](around:500,${lat},${lng}););out center body geom qt;`;

  const elements = await queryOverpass(query);

  if (elements === null) {
    console.error(`OSM Overpass unreachable lat=${lat} lng=${lng}`);
    return Response.json({ unavailable: true, roundabouts: [], speed_limits: [], stops: [] });
  }

  return Response.json({
    roundabouts: parseRoundabouts(elements),
    speed_limits: parseSpeedLimits(elements),
    stops: parseStops(elements),
  });
});