/**
 * FeelGood Conduite — Façade données cartographiques OSM
 * Délègue entièrement à overpassClient.js (source unique de vérité).
 */

import {
  getNearbyRoundaboutsSync,
  getNearbySpeedLimitsSync,
  getNearbyStopsSync,
} from './overpassClient';

// ─── Haversine local ──────────────────────────────────────────────────────

function hav(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Distance point → segment (mètres, corrigé pour distorsion lat/lng) ──

function distanceToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  const LAT_M = 111320;
  const LNG_M = 111320 * Math.cos((lat * Math.PI) / 180);
  const px = (lng - lng1) * LNG_M;
  const py = (lat - lat1) * LAT_M;
  const dx = (lng2 - lng1) * LNG_M;
  const dy = (lat2 - lat1) * LAT_M;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return hav(lat, lng, lat1, lng1);
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  return hav(lat, lng, lat1 + (t * dy) / LAT_M, lng1 + (t * dx) / LNG_M);
}

// ─── Cap d'un segment (degrés, 0-360) ────────────────────────────────────────

function segmentBearing(lat1, lng1, lat2, lng2) {
  const dy = lat2 - lat1;
  const dx = (lng2 - lng1) * Math.cos(lat1 * Math.PI / 180);
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

// Vérifie si le cap du véhicule est aligné avec le segment (±60°, les 2 sens)
function isAlignedWithSegment(vehicleHeading, segBear, tolerance = 60) {
  const diff1 = Math.abs(((vehicleHeading - segBear) + 360) % 360);
  const norm1 = diff1 > 180 ? 360 - diff1 : diff1;
  const diff2 = Math.abs(((vehicleHeading - (segBear + 180)) + 360) % 360);
  const norm2 = diff2 > 180 ? 360 - diff2 : diff2;
  return Math.min(norm1, norm2) <= tolerance;
}

// ─── Stubs de compatibilité ───────────────────────────────────────────────

export async function loadMapData() { return null; }
export function getMapData() { return null; }
export function isMapDataLoaded() { return true; }
export function prefetchOsmData() {}
export function findZoneLimit() { return null; }

// ─── Limitation de vitesse ────────────────────────────────────────────────

export function findNearestSpeedLimit(lat, lng, maxDistM = 30, vehicleHeading = null) {
  const segments = getNearbySpeedLimitsSync(lat, lng);
  if (!segments.length) return null;

  // 1er pass : segments alignés avec le cap du véhicule
  let bestDist = maxDistM;
  let bestSeg = null;
  for (const seg of segments) {
    const d = distanceToSegment(lat, lng, seg.lat_start, seg.lon_start, seg.lat_end, seg.lon_end);
    if (d >= bestDist) continue;
    if (vehicleHeading !== null) {
      const segBear = segmentBearing(seg.lat_start, seg.lon_start, seg.lat_end, seg.lon_end);
      if (!isAlignedWithSegment(vehicleHeading, segBear)) continue;
    }
    bestDist = d;
    bestSeg = seg;
  }

  // 2ème pass (fallback) : si aucun segment aligné, prendre le plus proche sans filtre cap
  if (!bestSeg) {
    bestDist = maxDistM;
    for (const seg of segments) {
      const d = distanceToSegment(lat, lng, seg.lat_start, seg.lon_start, seg.lat_end, seg.lon_end);
      if (d < bestDist) { bestDist = d; bestSeg = seg; }
    }
  }

  return bestSeg ? {
    speed: bestSeg.speed,
    type: bestSeg.type,
    highway: bestSeg.highway || null,
    name: bestSeg.name || null,
    osm_id: bestSeg.osm_id || null,
    explicit: bestSeg.explicit || false,
    dist: Math.round(bestDist),
  } : null;
}

// ─── Ronds-points ─────────────────────────────────────────────────────────

export function findNearbyRoundabouts(lat, lng, radiusM = 200) {
  const roundabouts = getNearbyRoundaboutsSync(lat, lng);
  const results = [];
  for (const rb of roundabouts) {
    const dist = hav(lat, lng, rb.lat, rb.lon);
    if (dist <= radiusM) results.push({ ...rb, dist, id: rb.id || `rb_${rb.lat}_${rb.lon}` });
  }
  return results.sort((a, b) => a.dist - b.dist);
}

// ─── Panneaux STOP ────────────────────────────────────────────────────────

export function findNearbyStops(lat, lng, radiusM = 50) {
  const stops = getNearbyStopsSync(lat, lng);
  const results = [];
  for (const s of stops) {
    const dist = hav(lat, lng, s.lat, s.lon);
    if (dist <= radiusM) results.push({ ...s, dist, id: s.id || `stop_${s.lat}_${s.lon}` });
  }
  return results.sort((a, b) => a.dist - b.dist);
}

// ─── Élément structurel le plus proche ───────────────────────────────────

export function findNearestStructuralElement(lat, lng, radiusM = 160) {
  const all = [
    ...findNearbyRoundabouts(lat, lng, radiusM).map(e => ({ ...e, type: 'roundabout' })),
    ...findNearbyStops(lat, lng, radiusM).map(e => ({ ...e, type: 'stop' })),
  ];
  if (!all.length) return null;
  return all.sort((a, b) => a.dist - b.dist)[0];
}