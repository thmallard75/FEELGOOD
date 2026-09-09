// getOsmFeatures — Proxy Overpass sécurisé et mis en cache côté backend.
// Le frontend ne doit JAMAIS appeler Overpass directement ; il passe par ici.
//
// Requête les stops, feux, ronds-points et routes avec maxspeed autour d'un point.
// Cache partagé par (latitude, longitude arrondies, rayon) — un miss persisted,
// les appels suivants (tous utilisateurs) servent depuis le cache.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const ROUND_DIGITS = 4; // ~11 m de précision de cache
const FETCH_TIMEOUT_MS = 28000;

function round(n) {
  return Math.round(n * 10 ** ROUND_DIGITS) / 10 ** ROUND_DIGITS;
}

function cacheKey(latitude, longitude, radius) {
  return `${round(latitude)}_${round(longitude)}_${radius}`;
}

function buildQuery(latitude, longitude, radius) {
  // around:rayon,latitude,longitude — ordre strict imposé.
  return `[out:json][timeout:25];
(
  node(around:${radius},${latitude},${longitude})["highway"="stop"];
  node(around:${radius},${latitude},${longitude})["highway"="traffic_signals"];
  way(around:${radius},${latitude},${longitude})["junction"="roundabout"];
  way(around:${radius},${latitude},${longitude})["highway"]["maxspeed"];
);
out tags center geom;`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { latitude, longitude, radius } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return Response.json({ error: 'latitude et longitude numériques requis' }, { status: 400 });
    }
    if (latitude < -90 || latitude > 90) {
      return Response.json({ error: 'latitude hors plage [-90, 90]' }, { status: 400 });
    }
    if (longitude < -180 || longitude > 180) {
      return Response.json({ error: 'longitude hors plage [-180, 180]' }, { status: 400 });
    }
    if (radius != null && (typeof radius !== 'number' || isNaN(radius) || radius <= 0)) {
      return Response.json({ error: 'radius numérique positif requis' }, { status: 400 });
    }
    const r = Math.max(1, Math.round(radius ?? 500));

    const key = cacheKey(latitude, longitude, r);

    // ── 1. Lecture du cache partagé ────────────────────────────────────────────
    try {
      const cached = await base44.asServiceRole.entities.OsmFeatureCache.filter({ cache_key: key });
      if (cached.length && cached[0].elements) {
        const els = cached[0].elements;
        return Response.json({
          elements: els,
          count: els.length,
          osmTimestamp: cached[0].osm_timestamp || null,
          retrievedAt: cached[0].retrieved_at,
          cached: true,
          status: els.length === 0 ? 'empty' : 'ok',
        });
      }
    } catch (e) {
      console.warn('[getOsmFeatures] lecture cache échouée:', e.message);
    }

    // ── 2. Requête Overpass ────────────────────────────────────────────────────
    const query = buildQuery(latitude, longitude, r);
    const formBody = `data=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'FeelGoodConduite/1.0',
          'Accept': 'application/json',
        },
        body: formBody,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      console.error('[getOsmFeatures] réseau/timeout Overpass:', e.message);
      return Response.json({ error: 'Overpass injoignable', details: e.message }, { status: 504 });
    }
    clearTimeout(timer);

    // ── 3. Gestion des erreurs HTTP ───────────────────────────────────────────
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // Message complet conservé dans les logs backend (exigence 12).
      console.error(`[getOsmFeatures] Overpass HTTP ${res.status} — ${errText}`);
      let status = 502;
      if (res.status === 400) status = 400;
      else if (res.status === 429) status = 429;
      else if (res.status === 504) status = 504;
      else if (res.status === 500) status = 500;
      return Response.json(
        { error: `Overpass HTTP ${res.status}`, details: errText, status: 'error' },
        { status },
      );
    }

    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object') {
      console.error('[getOsmFeatures] réponse non-JSON reçue');
      return Response.json({ error: 'Réponse Overpass illisible', status: 'error' }, { status: 502 });
    }

    const elements = Array.isArray(json.elements) ? json.elements : [];
    const osmTimestamp = json.osm3s?.timestamp_osm_base || null;
    const retrievedAt = new Date().toISOString();

    // ── 4. Persistance du cache (shared) ───────────────────────────────────────
    try {
      await base44.asServiceRole.entities.OsmFeatureCache.create({
        cache_key: key,
        latitude,
        longitude,
        radius: r,
        elements,
        osm_timestamp: osmTimestamp,
        retrieved_at: retrievedAt,
      });
    } catch (e) {
      console.warn('[getOsmFeatures] écriture cache échouée:', e.message);
    }

    // ── 5. Réponse — tableau vide + statut explicite si rien trouvé ────────────
    return Response.json({
      elements,
      count: elements.length,
      osmTimestamp,
      retrievedAt,
      cached: false,
      status: elements.length === 0 ? 'empty' : 'ok',
    });
  } catch (error) {
    console.error('[getOsmFeatures] erreur:', error.message);
    return Response.json({ error: error.message, status: 'error' }, { status: 500 });
  }
}