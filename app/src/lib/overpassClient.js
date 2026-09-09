/**
 * FeelGood Conduite — Client OSM
 * Toutes les requêtes Overpass passent par la backend function `osmProxy`
 * pour éviter les problèmes CORS/timeout sur mobile.
 * Cache mémoire TTL 30 min par type.
 */

import { base44 } from '@/api/base44Client';
import { logOsmError } from '@/components/profile/OsmErrorLog';

// ─── Callback debug ────────────────────────────────────────────────────────
let _osmRefreshCallback = null;
export function onOsmRefresh(cb) { _osmRefreshCallback = cb; }
function _notify(type, lat, lng, count, failed = false) {
  if (_osmRefreshCallback) _osmRefreshCallback({ type, lat, lng, count, failed, ts: Date.now() });
}
let _fetchCount = 0;
export function notifyOsmError(type, lat, lng) { _notify(type, lat, lng, _fetchCount, true); }

// ─── Timing des requêtes ──────────────────────────────────────────────────────
const _lastFetchMs = {};
export function getLastFetchMs(type) { return _lastFetchMs[type] || null; }

// ─── Cache mémoire spatial (5 derniers km parcourus) ─────────────────────
const CACHE_RADIUS_M = 5000; // garder uniquement les 5 derniers km

function hav(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeCache() {
  const store = new Map(); // key → { data, lat, lng }

  function key(lat, lng) { return `${lat.toFixed(2)}_${lng.toFixed(2)}`; }

  // Purge tout ce qui est à plus de 5km de la position courante
  function evict(currentLat, currentLng) {
    for (const [k, entry] of store) {
      if (hav(currentLat, currentLng, entry.lat, entry.lng) > CACHE_RADIUS_M) {
        store.delete(k);
      }
    }
  }

  function get(lat, lng) {
    const step = 0.01;
    for (const dLat of [-step, 0, step]) {
      for (const dLng of [-step, 0, step]) {
        const entry = store.get(key(lat + dLat, lng + dLng));
        if (entry) return entry.data;
      }
    }
    return null;
  }

  function set(lat, lng, data) {
    evict(lat, lng); // purger les zones lointaines avant d'insérer
    store.set(key(lat, lng), { data, lat, lng });
  }

  return { get, set, size: () => store.size };
}

const rbCache   = makeCache();
const slCache   = makeCache();
const stCache   = makeCache();

// ─── Fetch via proxy backend (requête combinée unique) ────────────────────────
let _lastFetchPos = null; // {lat, lng} du dernier fetch combiné

function haversineSimple(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchAllOsm(lat, lng) {
  // Éviter double requête si on n'a pas bougé de 200m
  if (_lastFetchPos && haversineSimple(lat, lng, _lastFetchPos.lat, _lastFetchPos.lng) < 200) return;
  _lastFetchPos = { lat, lng };

  const t0 = Date.now();
  try {
    const res = await base44.functions.invoke('osmProxy', { lat, lng });
    const elapsed = Date.now() - t0;
    _lastFetchMs['roundabouts'] = elapsed;
    _lastFetchMs['speed_limits'] = elapsed;
    _lastFetchMs['stops'] = elapsed;
    _fetchCount++;

    if (res.data?.unavailable) {
      logOsmError('all', lat, lng);
      _lastFetchPos = null;
      _notify('all', lat, lng, _fetchCount, true);
      return;
    }

    const data = res.data;
    if (data?.roundabouts) rbCache.set(lat, lng, data.roundabouts);
    if (data?.speed_limits) slCache.set(lat, lng, data.speed_limits);
    if (data?.stops) stCache.set(lat, lng, data.stops);
    _notify('all', lat, lng, _fetchCount);
  } catch (e) {
    _lastFetchPos = null;
    _notify('all', lat, lng, _fetchCount, true);
    logOsmError('all', lat, lng);
  }
}

// ─── API publique : sync (lecture cache) ──────────────────────────────────

export function getNearbyRoundaboutsSync(lat, lng) {
  return rbCache.get(lat, lng) || [];
}

export function getNearbySpeedLimitsSync(lat, lng) {
  return slCache.get(lat, lng) || [];
}

export function getNearbyStopsSync(lat, lng) {
  return stCache.get(lat, lng) || [];
}

// Compat — gardés pour ne pas casser d'autres imports éventuels
export async function fetchNearbyRoundabouts(lat, lng) {
  await fetchAllOsm(lat, lng);
  return rbCache.get(lat, lng) || [];
}
export async function fetchNearbySpeedLimits(lat, lng) {
  await fetchAllOsm(lat, lng);
  return slCache.get(lat, lng) || [];
}
export async function fetchNearbyStops(lat, lng) {
  await fetchAllOsm(lat, lng);
  return stCache.get(lat, lng) || [];
}
export async function prefetchRoundaboutsOnStart(lat, lng) {
  return fetchAllOsm(lat, lng).catch(() => {});
}
export async function prefetchSpeedLimitsOnStart(lat, lng) { /* fusionné dans fetchAllOsm */ }

// ─── Utilitaires ─────────────────────────────────────────────────────────
export function invalidateOsmCache() {
  _lastFetchPos = null;
}
export function clearAllOsmCache() { invalidateOsmCache(); }