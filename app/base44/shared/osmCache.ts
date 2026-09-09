// Cache de tuiles OSM par cellule de grille, avec repli Overpass et couverture partielle.
import { haversine, parseOsmElements, buildOverpassQuery, queryOverpassWithRetry, simplifyPolyline, chunkPolyline, buildCorridorQuery } from './osmCore.ts';

const CELL = 0.01; // ~1.1 km de côté

/**
 * Charge en mémoire les enregistrements OsmTileCache dont la cell_key appartient
 * à `keys`, en paginant (skip) au-delà du plafond implicite de 5000. Renvoie une
 * Map<cell_key, record>. Évite que les cellules préchargées par l'ETL Geofabrik
 * au-delà des 5000 plus récentes restent invisibles.
 */
// Charge UNIQUEMENT les cellules dont on a besoin (filtre par cell_key), par
// petits paquets. Évite de paginer toute la collection OsmTileCache (chaque
// enregistrement porte un road_data volumineux) — qui saturait la mémoire du
// worker (exceededMemory) sur les trajets longs.
async function loadCachedCells(keys, base44) {
  const byKey = new Map();
  if (!keys.size) return byKey;
  const keyArr = [...keys];
  const CHUNK = 150;
  try {
    for (let i = 0; i < keyArr.length; i += CHUNK) {
      const slice = keyArr.slice(i, i + CHUNK);
      const batch = await base44.asServiceRole.entities.OsmTileCache.filter({ cell_key: { $in: slice } }) || [];
      for (const r of batch) {
        if (!r.road_data) continue;
        // Fusionne tous les enregistrements d'une même cellule (union par id).
        // Une cellule peut avoir plusieurs enregistrements d'âges/sources
        // différents (ETL Geofabrik + fetchs Overpass corridor successifs).
        // Garder un seul enregistrement (le dernier, ou le plus fourni) fait
        // perdre des éléments : ex. un fetch Overpass récent avec 165 segments
        // mais 1 seul giratoire écrase le Geofabrik qui en avait 2 (dont le
        // giratoire réellement traversé). La fusion par id préserve tout.
        const existing = byKey.get(r.cell_key);
        const rd = r.road_data;
        if (!existing) {
          byKey.set(r.cell_key, {
            cell_key: r.cell_key,
            road_data: {
              roundabouts: [...(rd.roundabouts || [])],
              speedLimits: [...(rd.speedLimits || [])],
              stops: [...(rd.stops || [])],
            },
            element_count: r.element_count || 0,
          });
        } else {
          const e = existing.road_data;
          const rbSeen = new Set((e.roundabouts || []).map((x) => x.id));
          for (const rb of rd.roundabouts || []) if (!rbSeen.has(rb.id)) { e.roundabouts.push(rb); rbSeen.add(rb.id); }
          const slKey = (sl) => `${sl.osm_id}_${sl.lat_start?.toFixed(5)}_${sl.lon_start?.toFixed(5)}`;
          const slSeen = new Set((e.speedLimits || []).map(slKey));
          for (const sl of rd.speedLimits || []) { const k = slKey(sl); if (!slSeen.has(k)) { e.speedLimits.push(sl); slSeen.add(k); } }
          const stSeen = new Set((e.stops || []).map((x) => x.id));
          for (const st of rd.stops || []) if (!stSeen.has(st.id)) { e.stops.push(st); stSeen.add(st.id); }
        }
      }
    }
  } catch (e) {
    console.warn('[osmCache] lecture cache échouée:', e.message);
  }
  return byKey;
}

export function cellKey(lat, lng) {
  return `${Math.floor(lat / CELL)}_${Math.floor(lng / CELL)}`;
}

export function cellsForBbox(bbox) {
  const minA = Math.floor(bbox.minLat / CELL);
  const maxA = Math.floor(bbox.maxLat / CELL);
  const minB = Math.floor(bbox.minLng / CELL);
  const maxB = Math.floor(bbox.maxLng / CELL);
  const cells = [];
  for (let a = minA; a <= maxA; a++) {
    for (let b = minB; b <= maxB; b++) {
      cells.push({
        key: `${a}_${b}`,
        minLat: a * CELL, minLng: b * CELL,
        maxLat: (a + 1) * CELL, maxLng: (b + 1) * CELL,
      });
    }
  }
  return cells;
}

/**
 * Récupère le contexte routier pour une bbox : cache local → Overpass pour les cellules manquantes.
 * @param {object} bbox { minLat, minLng, maxLat, maxLng }
 * @param {object} base44 client (service role utilisé)
 * @returns {roadContext:{roundabouts,speedLimits,stops}, coverage:'full'|'partial'|'none', missing:number}
 */
export async function getRoadContextWithCache(bbox, base44) {
  const cells = cellsForBbox(bbox);
  const keySet = new Set(cells.map(c => c.key));

  // 1. Lire le cache (paginé — voir loadCachedCells)
  const byKey = await loadCachedCells(keySet, base44);

  // 2. Assembler les cellules déjà en cache
  let roundabouts = [], speedLimits = [], stops = [];
  for (const c of cells) {
    const r = byKey.get(c.key);
    if (r?.road_data) {
      roundabouts.push(...(r.road_data.roundabouts || []));
      speedLimits.push(...(r.road_data.speedLimits || []));
      stops.push(...(r.road_data.stops || []));
    }
  }

  const missing = cells.filter(c => !byKey.has(c.key));
  let coverage = 'full';

  // 3. Fetch Overpass pour les cellules manquantes (bbox fusionnée)
  if (missing.length > 0) {
    const m_bbox = {
      minLat: Math.min(...missing.map(c => c.minLat)),
      minLng: Math.min(...missing.map(c => c.minLng)),
      maxLat: Math.max(...missing.map(c => c.maxLat)),
      maxLng: Math.max(...missing.map(c => c.maxLng)),
    };
    let elements = null;
    try { elements = await queryOverpassWithRetry(buildOverpassQuery(m_bbox), 2); }
    catch (e) { elements = null; }

    if (elements) {
      const parsed = parseOsmElements(elements);
      const perCell = new Map();
      const bucket = (key) => { if (!perCell.has(key)) perCell.set(key, { roundabouts: [], speedLimits: [], stops: [] }); return perCell.get(key); };
      for (const rb of parsed.roundabouts) bucket(cellKey(rb.lat, rb.lon)).roundabouts.push(rb);
      for (const sl of parsed.speedLimits) bucket(cellKey((sl.lat_start + sl.lat_end) / 2, (sl.lon_start + sl.lon_end) / 2)).speedLimits.push(sl);
      for (const st of parsed.stops) bucket(cellKey(st.lat, st.lon)).stops.push(st);

      const toCreate = [];
      const now = new Date().toISOString();
      for (const cell of missing) {
        const data = perCell.get(cell.key) || { roundabouts: [], speedLimits: [], stops: [] };
        toCreate.push({
          cell_key: cell.key,
          min_lat: cell.minLat, min_lng: cell.minLng, max_lat: cell.maxLat, max_lng: cell.maxLng,
          road_data: data,
          element_count: data.roundabouts.length + data.speedLimits.length + data.stops.length,
          fetched_at: now,
          source: 'overpass',
        });
        roundabouts.push(...data.roundabouts);
        speedLimits.push(...data.speedLimits);
        stops.push(...data.stops);
      }
      try { await base44.asServiceRole.entities.OsmTileCache.bulkCreate(toCreate); }
      catch (e) { console.warn('[osmCache] écriture cache échouée:', e.message); }
    } else {
      coverage = byKey.size > 0 ? 'partial' : 'none';
    }
  }

  // 4. Dédup fusion (chevauchements de cellules)
  const rbSeen = new Set();
  const dedupRb = roundabouts.filter(rb => rbSeen.has(rb.id) ? false : (rbSeen.add(rb.id), true));
  const slSeen = new Set();
  const dedupSl = speedLimits.filter(sl => slSeen.has(`${sl.osm_id}_${sl.lat_start.toFixed(5)}_${sl.lon_start.toFixed(5)}`) ? false : (slSeen.add(`${sl.osm_id}_${sl.lat_start.toFixed(5)}_${sl.lon_start.toFixed(5)}`), true));
  const stSeen = new Set();
  const dedupSt = stops.filter(s => stSeen.has(s.id) ? false : (stSeen.add(s.id), true));

  return {
    roadContext: { roundabouts: dedupRb, speedLimits: dedupSl, stops: dedupSt },
    coverage,
    missing: missing.length,
  };
}

// ─── Récupération corridor (post-trip) par tronçons le long de la trace ──────
//
// Stratégie : la trace réelle est simplifiée en ancrages tous les ~50 m, puis
// découpée en tronçons de ~4 km. Chaque tronçon requête Overpass "around" la
// polyligne du tronçon (rayon 35 m) — ne téléchargeant QUE les routes
// traversées. Un échec ne perd que ce tronçon (retry par tronçon). Le cache
// OsmTileCache reste utilisé pour éviter de re-demander les cellules connues.

export async function getRoadContextForTrack(gpsTrack, base44, deadlineMs = 40000) {
  const anchors = simplifyPolyline(gpsTrack, 50);
  const chunks = chunkPolyline(anchors, 4000);
  const startTime = Date.now();
  // Deadline abortable : permet d'interrompre un fetch Overpass en cours à
  // l'expiration du budget, au lieu d'attendre son timeout propre (15s) qui
  // ferait dépasser le quota temps du worker → crash générique.
  const deadlineCtl = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineCtl.abort(), deadlineMs);
  console.log(`[osmCache-corridor] ${anchors.length} ancrages → ${chunks.length} tronçons (~4km), deadline ${deadlineMs}ms`);

  // Cellules touchées par la trace (+ marge 1 cellule)
  const touched = new Set();
  for (const c of chunks) for (const a of c.polyline) {
    for (let dLat = -1; dLat <= 1; dLat++) for (let dLng = -1; dLng <= 1; dLng++)
      touched.add(cellKey(a.lat + dLat * CELL, a.lng + dLng * CELL));
  }

  // Pré-chargement du cache pour les cellules touchées (paginé)
  const byKey = await loadCachedCells(touched, base44);

  const roundabouts = [], speedLimits = [], stops = [];
  const rbSeen = new Set(), slSeen = new Set(), stSeen = new Set();
  const consume = (data) => {
    for (const rb of data.roundabouts || []) if (!rbSeen.has(rb.id)) { rbSeen.add(rb.id); roundabouts.push(rb); }
    for (const sl of data.speedLimits || []) {
      const k = `${sl.osm_id}_${sl.lat_start.toFixed(5)}_${sl.lon_start.toFixed(5)}`;
      if (!slSeen.has(k)) { slSeen.add(k); speedLimits.push(sl); }
    }
    for (const s of data.stops || []) if (!stSeen.has(s.id)) { stSeen.add(s.id); stops.push(s); }
  };

  let okChunks = 0, failedChunks = 0;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const chunkCells = new Set();
    for (const a of chunk.polyline) for (let dLat = -1; dLat <= 1; dLat++) for (let dLng = -1; dLng <= 1; dLng++)
      chunkCells.add(cellKey(a.lat + dLat * CELL, a.lng + dLng * CELL));

    // 1. Tout en cache ? → on évite l'appel Overpass pour ce tronçon
    const allCached = [...chunkCells].every(k => byKey.has(k));
    if (allCached) {
      for (const k of chunkCells) consume(byKey.get(k).road_data);
      okChunks++;
      continue;
    }

    // Garde-fou de latence : si on dépasse le deadline, on arrête de lancer des
    // requêtes Overpass (chaque tronçon déjà réussi est en cache → le prochain
    // passageworkflow ne re-demandera que les tronçons restants). On marque les
    // tronçons non traités comme échoués et on renvoie une couverture partielle.
    if (Date.now() - startTime > deadlineMs) {
      const rest = chunks.length - ci;
      failedChunks += rest;
      console.warn(`[osmCache-corridor] deadline dépassé à ${ci}/${chunks.length} — ${rest} tronçon(s) reporté(s) au retry`);
      break;
    }

    // 2. Requête corridor Overpass pour ce tronçon
    let elements = null;
    try { elements = await queryOverpassWithRetry(buildCorridorQuery(chunk.polyline, 35), 2, deadlineCtl.signal); }
    catch (e) { elements = null; }

    if (elements) {
      const parsed = parseOsmElements(elements);
      const perCell = new Map();
      const bucket = (k) => { if (!perCell.has(k)) perCell.set(k, { roundabouts: [], speedLimits: [], stops: [] }); return perCell.get(k); };
      for (const rb of parsed.roundabouts) bucket(cellKey(rb.lat, rb.lon)).roundabouts.push(rb);
      for (const sl of parsed.speedLimits) bucket(cellKey((sl.lat_start + sl.lat_end) / 2, (sl.lon_start + sl.lon_end) / 2)).speedLimits.push(sl);
      for (const st of parsed.stops) bucket(cellKey(st.lat, st.lon)).stops.push(st);

      const toCreate = [];
      const now = new Date().toISOString();
      for (const k of chunkCells) {
        const data = perCell.get(k) || { roundabouts: [], speedLimits: [], stops: [] };
        const newCount = data.roundabouts.length + data.speedLimits.length + data.stops.length;
        const existing = byKey.get(k);
        // N'écrase pas une cellule déjà remplie (ex. Geofabrik 133 éléments)
        // par un fetch corridor partiellement vide. On consomme l'existant
        // (plus complet) et on ignore l'enregistrement vide parasite.
        if (existing?.road_data && (existing.element_count || 0) >= newCount) {
          consume(existing.road_data);
          continue;
        }
        const [a_, b_] = k.split('_').map(Number);
        toCreate.push({
          cell_key: k, min_lat: a_ * CELL, min_lng: b_ * CELL, max_lat: (a_ + 1) * CELL, max_lng: (b_ + 1) * CELL,
          road_data: data, element_count: newCount,
          fetched_at: now, source: 'overpass',
        });
        byKey.set(k, { cell_key: k, road_data: data });
        consume(data);
      }
      try { await base44.asServiceRole.entities.OsmTileCache.bulkCreate(toCreate); }
      catch (e) { console.warn('[osmCache-corridor] écriture cache:', e.message); }
      okChunks++;
    } else {
      failedChunks++;
      console.warn(`[osmCache-corridor] tronçon ${ci + 1}/${chunks.length} échoué (Overpass injoignable)`);
    }
  }

  clearTimeout(deadlineTimer);
  const coverage = failedChunks === 0 ? 'full' : (okChunks > 0 ? 'partial' : 'none');
  console.log(`[osmCache-corridor] coverage=${coverage} ok=${okChunks} failed=${failedChunks} rb=${roundabouts.length} seg=${speedLimits.length} stops=${stops.length}`);
  return {
    roadContext: { roundabouts, speedLimits, stops },
    coverage,
    missing: failedChunks,
  };
}

// ─── Pré-fetch d'une région : téléchargement de carte hors-ligne ──────────────
//
// Découpe la bbox de la région en tuiles de ~0.3° (≈33 km), fetch Overpass pour
// chaque tuile dont des cellules manquent au cache OsmTileCache, persiste au
// fur et à mesure. Un garde-fou de deadline garantit le retour dans la fenêtre
// gateway ; les cellules réussies restent en cache → ré-invoquer reprend là
// où ça s'est arrêté. La couverture est partagée entre tous les utilisateurs.

export async function prefetchRegionTiles(regionBbox, base44, deadlineMs = 38000) {
  const start = Date.now();
  const allCells = cellsForBbox(regionBbox);
  const regionKeys = new Set(allCells.map((c) => c.key));

  // 1. Lecture une seule fois du cache pour toute la région (paginé)
  const cachedKeys = new Set();
  try {
    let skip = 0;
    while (skip < 25000) {
      const batch = await base44.asServiceRole.entities.OsmTileCache.list('-fetched_at', 5000, skip) || [];
      if (!batch.length) break;
      for (const r of batch) if (r.cell_key) cachedKeys.add(r.cell_key);
      if (batch.length < 5000) break;
      skip += 5000;
    }
  } catch (e) {
    console.warn('[prefetchRegion] lecture cache:', e.message);
  }

  // 2. Découpe en tuiles, ne retient que celles avec au moins une cellule manquante
  const TILE = 0.3;
  const tiles = [];
  for (let lat = regionBbox.minLat; lat < regionBbox.maxLat; lat += TILE) {
    for (let lng = regionBbox.minLng; lng < regionBbox.maxLng; lng += TILE) {
      const t = {
        minLat: lat, minLng: lng,
        maxLat: Math.min(lat + TILE, regionBbox.maxLat),
        maxLng: Math.min(lng + TILE, regionBbox.maxLng),
      };
      const tCells = allCells.filter(
        (c) => c.minLat >= t.minLat && c.minLat < t.maxLat && c.minLng >= t.minLng && c.minLng < t.maxLng,
      );
      if (tCells.length && tCells.some((c) => !cachedKeys.has(c.key))) {
        tiles.push({ bbox: t, cells: tCells });
      }
    }
  }

  console.log(`[prefetchRegion] ${regionKeys.size} cellules, ${tiles.length} tuiles à fetcher`);

  let tilesDone = 0;
  let tilesFailed = 0;

  for (const tile of tiles) {
    if (Date.now() - start > deadlineMs) {
      console.warn(`[prefetchRegion] deadline à ${tilesDone}/${tiles.length} tuiles`);
      break;
    }
    const missing = tile.cells.filter((c) => !cachedKeys.has(c.key));
    if (!missing.length) {
      tilesDone++;
      continue;
    }
    const mBbox = {
      minLat: Math.min(...missing.map((c) => c.minLat)),
      minLng: Math.min(...missing.map((c) => c.minLng)),
      maxLat: Math.max(...missing.map((c) => c.maxLat)),
      maxLng: Math.max(...missing.map((c) => c.maxLng)),
    };
    let elements = null;
    try {
      elements = await queryOverpassWithRetry(buildOverpassQuery(mBbox), 3);
    } catch (e) {
      elements = null;
    }
    if (!elements) {
      tilesFailed++;
      continue;
    }
    const parsed = parseOsmElements(elements);
    const perCell = new Map();
    const bucket = (k) => {
      if (!perCell.has(k)) perCell.set(k, { roundabouts: [], speedLimits: [], stops: [] });
      return perCell.get(k);
    };
    for (const rb of parsed.roundabouts) bucket(cellKey(rb.lat, rb.lon)).roundabouts.push(rb);
    for (const sl of parsed.speedLimits)
      bucket(cellKey((sl.lat_start + sl.lat_end) / 2, (sl.lon_start + sl.lon_end) / 2)).speedLimits.push(sl);
    for (const st of parsed.stops) bucket(cellKey(st.lat, st.lon)).stops.push(st);

    const toCreate = [];
    const now = new Date().toISOString();
    for (const c of missing) {
      const data = perCell.get(c.key) || { roundabouts: [], speedLimits: [], stops: [] };
      toCreate.push({
        cell_key: c.key,
        min_lat: c.minLat, min_lng: c.minLng, max_lat: c.maxLat, max_lng: c.maxLng,
        road_data: data,
        element_count: data.roundabouts.length + data.speedLimits.length + data.stops.length,
        fetched_at: now, source: 'overpass',
      });
      cachedKeys.add(c.key);
    }
    try {
      await base44.asServiceRole.entities.OsmTileCache.bulkCreate(toCreate);
    } catch (e) {
      console.warn('[prefetchRegion] écriture cache:', e.message);
    }
    tilesDone++;
  }

  let cellsDone = 0;
  for (const k of regionKeys) if (cachedKeys.has(k)) cellsDone++;
  const complete = cellsDone >= regionKeys.size;

  console.log(`[prefetchRegion] terminé — ${cellsDone}/${regionKeys.size} cellules, ${tilesDone}/${tiles.length} tuiles, ${tilesFailed} échouées, complete=${complete}`);
  return {
    cells_total: regionKeys.size,
    cells_done: cellsDone,
    tiles_done: tilesDone,
    tiles_total: tiles.length,
    tiles_failed: tilesFailed,
    complete,
  };
}