// OSM core — géométrie + parsing + requête Overpass (partagé entre analyzeTrip et osmCache)

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const dλ = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

export const DEFAULTS_FR = {
  motorway: 130, motorway_link: 110, trunk: 110, trunk_link: 90,
  primary: 80, primary_link: 80, secondary: 80, secondary_link: 80,
  tertiary: 80, tertiary_link: 80, unclassified: 80,
  residential: 30, living_street: 20, service: 30, road: 50,
};

export function parseMaxspeed(tag) {
  if (!tag) return null;
  const num = parseInt(tag);
  if (!isNaN(num) && num > 0) return num;
  const lower = tag.toLowerCase();
  if (lower.includes('urban')) return 50;
  if (lower.includes('rural')) return 80;
  if (lower.includes('motorway')) return 130;
  if (lower.includes('walk') || lower.includes('living_street')) return 20;
  if (lower.includes('mph')) { const mph = parseInt(lower); if (!isNaN(mph)) return Math.round(mph * 1.609); }
  return null;
}

export function parseRoundabouts(elements) {
  const MIN_RADIUS_M = 8;
  return elements
    .filter(el => el.tags?.junction === 'roundabout')
    .map(el => {
      let lat, lon;
      if (el.center) { lat = el.center.lat; lon = el.center.lon; }
      else if (el.geometry?.length) {
        lat = el.geometry.reduce((s, p) => s + p.lat, 0) / el.geometry.length;
        lon = el.geometry.reduce((s, p) => s + p.lon, 0) / el.geometry.length;
      } else { lat = el.lat; lon = el.lon; }
      if (!lat || !lon) return null;
      let radius = null;
      if (el.geometry?.length >= 3) {
        const avgRadius = el.geometry.reduce((s, p) => s + haversine(lat, lon, p.lat, p.lon), 0) / el.geometry.length;
        if (avgRadius < MIN_RADIUS_M) return null;
        radius = Math.round(avgRadius);
      }
      const maxspeed = el.tags?.maxspeed ? parseInt(el.tags.maxspeed) : null;
      return { lat, lon, maxspeed: (!isNaN(maxspeed) && maxspeed > 0) ? maxspeed : 30, id: `rb_${el.id}`, radius };
    }).filter(Boolean);
}

export function parseSpeedLimits(elements) {
  const result = [];
  const NON_MOTOR = ['footway', 'cycleway', 'path', 'pedestrian', 'steps', 'track', 'bridleway'];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry?.length || !el.tags?.highway) continue;
    if (el.tags?.junction === 'roundabout') continue;
    const hw = el.tags.highway;
    if (NON_MOTOR.includes(hw)) continue;
    let speed = parseMaxspeed(el.tags.maxspeed);
    const explicit = speed !== null;
    if (!speed) speed = DEFAULTS_FR[hw] || 50;
    const roadType = (hw === 'motorway' || hw === 'trunk') ? 'highway'
      : (hw === 'primary' || hw === 'secondary' || hw === 'tertiary' || hw === 'unclassified') ? 'periurban'
      : 'urban';
    for (let i = 0; i < el.geometry.length - 1; i++) {
      const a = el.geometry[i], b = el.geometry[i + 1];
      result.push({ lat_start: a.lat, lon_start: a.lon, lat_end: b.lat, lon_end: b.lon, speed, type: roadType, highway: hw, name: el.tags.name || null, osm_id: el.id, explicit });
    }
  }
  return result;
}

export function parseStops(elements) {
  return elements
    .filter(el => el.type === 'node' && el.lat && el.lon && (el.tags?.highway === 'stop' || el.tags?.traffic_sign === 'stop'))
    .map(el => ({ lat: el.lat, lon: el.lon, id: `stop_${el.id}` }));
}

// Aggrège et déduplique les éléments OSM parsés en un contexte routier compact.
export function parseOsmElements(elements) {
  const roundabouts = [];
  const speedLimits = [];
  const stops = [];
  const rbIds = new Set(), slKeys = new Set(), stopIds = new Set();

  if (elements && elements.length) {
    for (const el of elements) {
      if (el.type === 'node' && el.tags?.highway === 'mini_roundabout' && el.lat && el.lon) {
        const id = `mini_${el.id}`;
        // Les mini_roundabouts sont des nœuds (pas de géométrie) → petit rayon
        // typique (~8 m), utilisé pour valider la traversée côté analyzeTrip.
        if (!rbIds.has(id)) { rbIds.add(id); roundabouts.push({ lat: el.lat, lon: el.lon, maxspeed: 20, id, radius: 8 }); }
      }
    }
    for (const rb of parseRoundabouts(elements)) {
      if (!rbIds.has(rb.id)) { rbIds.add(rb.id); roundabouts.push(rb); }
    }
    for (const sl of parseSpeedLimits(elements)) {
      const key = `${sl.osm_id}_${sl.lat_start.toFixed(5)}_${sl.lon_start.toFixed(5)}`;
      if (!slKeys.has(key)) { slKeys.add(key); speedLimits.push(sl); }
    }
    for (const s of parseStops(elements)) {
      if (!stopIds.has(s.id)) { stopIds.add(s.id); stops.push(s); }
    }
  }

  // Dédup ronds-points proches — seuil resserré : deux giratoires distincts
  // peuvent être cartographiés à ~55 m l'un de l'autre (ex. rue du Meunier /
  // rue de la Moder). Un seuil trop large fusionne deux giratoires différents
  // et garde arbitrairement le premier rencontré. 20 m suffit à éliminer un
  // même giratoire récupéré twice via des tronçons de corridor qui se chevauchent
  // (même way → même centroïde).
  const DEDUP_DIST_M = 20;
  const dedupedRoundabouts = [];
  for (const rb of roundabouts) {
    if (!dedupedRoundabouts.some(r => haversine(r.lat, r.lon, rb.lat, rb.lon) < DEDUP_DIST_M)) dedupedRoundabouts.push(rb);
  }
  return { roundabouts: dedupedRoundabouts, speedLimits, stops };
}

export function buildOverpassQuery(bbox) {
  const minLat = bbox.minLat.toFixed(5);
  const maxLat = bbox.maxLat.toFixed(5);
  const minLng = bbox.minLng.toFixed(5);
  const maxLng = bbox.maxLng.toFixed(5);
  const MOTOR = '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road)$';
  return `[out:json][timeout:20];(way[junction=roundabout](${minLat},${minLng},${maxLat},${maxLng});way[highway~"${MOTOR}"](${minLat},${minLng},${maxLat},${maxLng});node[highway=mini_roundabout](${minLat},${minLng},${maxLat},${maxLng});node[highway=stop](${minLat},${minLng},${maxLat},${maxLng});node[traffic_sign=stop](${minLat},${minLng},${maxLat},${maxLng}););out center body geom qt;`;
}

// ─── Corridor (post-trip) : requête autour de la polyligne réelle ─────────────

/**
 * Simplifie une trace GPS en ancrages régulièrement espacés (~stepM mètres).
 * Réduit la charge Overpass en ne gardant qu'un point tous les ~50 m.
 */
export function simplifyPolyline(track, stepM = 50) {
  if (!track?.length) return [];
  const out = [{ lat: track[0].lat, lng: track[0].lng }];
  let acc = 0;
  for (let i = 1; i < track.length; i++) {
    acc += haversine(track[i - 1].lat, track[i - 1].lng, track[i].lat, track[i].lng);
    if (acc >= stepM) {
      out.push({ lat: track[i].lat, lng: track[i].lng });
      acc = 0;
    }
  }
  const last = track[track.length - 1];
  const prev = out[out.length - 1];
  if (haversine(prev.lat, prev.lng, last.lat, last.lng) > 5) out.push({ lat: last.lat, lng: last.lng });
  return out;
}

/**
 * Découpe une polyligne d'ancrages en tronçons de ~chunkM mètres.
 * Un tronçon chevauche l'ancrage frontière pour la continuité.
 */
export function chunkPolyline(anchors, chunkM = 4000) {
  if (!anchors?.length) return [];
  const chunks = [];
  let start = 0;
  let acc = 0;
  for (let i = 1; i < anchors.length; i++) {
    acc += haversine(anchors[i - 1].lat, anchors[i - 1].lng, anchors[i].lat, anchors[i].lng);
    if (acc >= chunkM) {
      chunks.push({ polyline: anchors.slice(start, i + 1) });
      start = i; // on reprend l'ancrage courant pour le tronçon suivant
      acc = 0;
    }
  }
  if (start < anchors.length - 1) chunks.push({ polyline: anchors.slice(start) });
  else if (start === anchors.length - 1 && !chunks.length) chunks.push({ polyline: anchors });
  return chunks;
}

/**
 * Construit une requête Overpass "around" le long d'une polyligne.
 * Ne télécharge QUE les routes réellement traversées (+ ronds-points/stops proches).
 */
export function buildCorridorQuery(polyline, radius = 35) {
  const coords = polyline.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(',');
  const MOTOR = '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road)$';
  return `[out:json][timeout:25];(way[junction=roundabout](around:${radius},${coords});way[highway~"${MOTOR}"](around:${radius},${coords});node[highway=mini_roundabout](around:${radius},${coords});node[highway=stop](around:${radius},${coords});node[traffic_sign=stop](around:${radius},${coords}););out center body geom qt;`;
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// Plafond de lecture du corps Overpass : un payload trop volumineux ferait
// exploser la mémoire du worker (res.json() → exceededMemory non rattrapable).
// On lit le flux par morceaux avec un budget d'octets ; si on le dépasse, on
// avorte proprement (le tronçon sera marqué pending_osm pour retry) au lieu de
// crasher l'ensemble de la fonction.
const MAX_OVERPASS_BYTES = 2 * 1024 * 1024; // 2 MiB (plafond strict — au-delà, OOM worker)

async function fetchEndpoint(url, query, extSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  const onExt = () => ctrl.abort();
  let linked = false;
  if (extSignal) {
    if (extSignal.aborted) ctrl.abort();
    else { extSignal.addEventListener('abort', onExt, { once: true }); linked = true; }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FeelGoodConduite/1.0' },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Garde Content-Length (quand Overpass l'envoie)
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > MAX_OVERPASS_BYTES) throw new Error('Oversize response (content-length)');

    // Lecture bornée du flux
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream');
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_OVERPASS_BYTES) throw new Error('Oversize response (stream)');
      buf += dec.decode(value, { stream: true });
    }
    buf += dec.decode(); // flush
    const json = JSON.parse(buf);
    if (!json?.elements) throw new Error('No elements');
    return json.elements;
  } finally {
    clearTimeout(timer);
    if (linked) extSignal.removeEventListener('abort', onExt);
  }
}

export async function queryOverpassWithRetry(query, maxRetries = 3, extSignal) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (extSignal?.aborted) return null;
    try {
      const elements = await Promise.any(ENDPOINTS.map(u => fetchEndpoint(u, query, extSignal)));
      if (elements && elements.length > 0) return elements;
    } catch (e) {
      if (extSignal?.aborted) return null;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
  return null;
}