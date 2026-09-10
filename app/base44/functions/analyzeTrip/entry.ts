/**
 * analyzeTrip — Analyse OSM complète d'un trajet en backend
 * Requête OSM par tuiles le long de la trace GPS, puis détection :
 *  - Excès de vitesse (limitations OSM)
 *  - Franchissements ronds-points (analyse d'approche)
 *  - Franchissements STOP (filtre cap + analyse vitesse)
 * Calcule tous les scores et met à jour le Trip + crée les DrivingEvents.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { haversine, bearing, pointToSegmentDist } from '../../shared/osmCore.ts';
import { getRoadContextWithCache } from '../../shared/osmCache.ts';
import { getRoadContextForTrack } from '../../shared/osmCache.ts';
import { filterGpsTrack } from '../../shared/gpsFilter.ts';
import { computeSerenityIndex } from '../../shared/serenityIndex.ts';
import { detectHarshDriving } from '../../shared/harshDriving.ts';
import { computeFatigueSummary } from '../../shared/fatigueEngine.ts';
import { computeDistractionSummary } from '../../shared/distractionEngine.ts';

// ─── Build OSM map from GPS track (corridor by chunks → cache → Overpass) ────

async function buildOsmMap(gpsTrack, base44) {
  const { roadContext, coverage, missing } = await getRoadContextForTrack(gpsTrack, base44);
  console.log(`[analyzeTrip] OSM coverage=${coverage} rb=${roadContext.roundabouts.length} seg=${roadContext.speedLimits.length} stops=${roadContext.stops.length} missing=${missing}`);
  if (coverage === 'none' || (!roadContext.roundabouts.length && !roadContext.speedLimits.length && !roadContext.stops.length)) {
    throw new Error('OSM_UNAVAILABLE: aucune donnée routière (cache vide + Overpass injoignable)');
  }
  return { ...roadContext, coverage, missing };
}

// ─── Speed limit matching ──────────────────────────────────────────────────────

function findSpeedLimit(lat, lng, speedLimits, headingDeg, speedKmh) {
  const LAT_M = 111320;
  const LNG_M = 111320 * Math.cos(lat * Math.PI / 180);
  const px = lng * LNG_M, py = lat * LAT_M;

  // Score chaque segment : distance + cap + hiérarchie routière + plausibilité
  // vis-à-vis de la vitesse réelle. La plausibilité évite les faux excès aux
  // entrées/sorties d'autoroute, où le point GPS est momentanément plus proche
  // d'une bretelle (limitée 70-90) que de l'autoroute elle-même (130).
  let best = null, bestScore = Infinity;
  const MAX_DIST = 80;        // assez large pour retrouver l'autoroute à ~60 m
  const HEADING_TOL = 60; // plus strict que 90°
  const HIERARCHY = { highway: -18, periurban: -4, urban: 0 };

  for (const seg of speedLimits) {
    const dist = pointToSegmentDist(px, py, seg.lon_start*LNG_M, seg.lat_start*LAT_M, seg.lon_end*LNG_M, seg.lat_end*LAT_M);
    if (dist > MAX_DIST) continue;

    let headingPenalty = 0;
    if (headingDeg != null) {
      const segBearing = bearing(seg.lat_start, seg.lon_start, seg.lat_end, seg.lon_end);
      // Vérifier dans les 2 sens (routes OSM bidirectionnelles stockées dans un seul sens)
      let diff = Math.abs(segBearing - headingDeg);
      if (diff > 180) diff = 360 - diff;
      const revDiff = 180 - diff; // diff pour le sens inverse
      const bestDiff = Math.min(diff, revDiff);
      if (bestDiff > HEADING_TOL) continue; // cap incompatible dans les 2 sens → ignoré
      headingPenalty = bestDiff / HEADING_TOL * 10;
    }

    // Bonus pour les limites explicites dans OSM (evite de préférer une rue secondaire par défaut)
    const explicitBonus = seg.explicit ? -8 : 0;
    const hierarchyBonus = HIERARCHY[seg.type] || 0;

    // Pénalité de plausibilité : si la vitesse réelle dépasse largement la
    // limite du segment, il est peu probable qu'on y roule (ex. 125 km/h sur
    // une bretelle à 90) → on défavorise ce segment au profit d'une autoroute
    // proche dont la limite est cohérente. Un excès réel en ville (60 ds une
    // zone 50) reste < +30 donc non pénalisé → toujours détecté.
    let plausibilityPenalty = 0;
    if (speedKmh != null && seg.speed != null && speedKmh > seg.speed + 30) {
      plausibilityPenalty = 35;
    }

    const score = dist + headingPenalty + explicitBonus + hierarchyBonus + plausibilityPenalty;

    if (score < bestScore) {
      bestScore = score; best = seg;
    }
  }
  return best;
}

// ─── Roundabout approach analysis ─────────────────────────────────────────────

function analyzeRoundaboutApproach(approachPoints, rbPos) {
  const dist = p => haversine(p.lat, p.lng, rbPos.lat, rbPos.lon);

  const ptsWithDist = approachPoints
    .filter(p => !p.low_precision)
    .map(p => ({ ...p, d: dist(p) }))
    .filter(p => p.d <= 170)
    .sort((a, b) => b.d - a.d); // farthest first

  if (ptsWithDist.length < 2) {
    return { rating: 'insufficient_data', confidence: 'insufficient_data', roundabout_score: 50 };
  }

  // ── Vitesses aux points clés ───────────────────────────────────────────────
  const avgInRange = (min, max) => {
    const pts = ptsWithDist.filter(p => p.d >= min && p.d <= max);
    return pts.length ? pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length : null;
  };
  const s150 = avgInRange(140, 170);
  const s100 = avgInRange(90, 110);
  const s50  = avgInRange(40, 60);
  const entryPts = ptsWithDist.filter(p => p.d <= 25);
  const sEntry = entryPts.length ? Math.min(...entryPts.map(p => p.speed_kmh)) : avgInRange(0, 30);

  // ── Limitation en approche (100 derniers mètres) ───────────────────────────
  const last100Pts = ptsWithDist.filter(p => p.d <= 100);
  const approachSpeedLimit = last100Pts.length ? (last100Pts[0].speed_limit || 50) : 50;

  // ── Statistiques par zone ──────────────────────────────────────────────────
  const zoneStats = (min, max) => {
    const pts = ptsWithDist.filter(p => p.d >= min && p.d < max);
    if (!pts.length) return { count: 0, avg: null, max: null, decel: null };
    const speeds = pts.map(p => p.speed_kmh);
    return {
      count: pts.length,
      avg: Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length * 10) / 10,
      max: Math.round(Math.max(...speeds) * 10) / 10,
      decel: pts.length >= 2 ? Math.round((pts[0].speed_kmh - pts[pts.length - 1].speed_kmh) * 10) / 10 : null,
    };
  };

  // ── Analyse de la progressivité de la décélération ────────────────────────
  // Vérifier si la vitesse diminue progressivement entre les 4 points clés
  const keyPoints = [s150, s100, s50, sEntry].filter(v => v !== null);
  let progressiveDecel = true;
  let bigSuddenBrake = false;
  if (keyPoints.length >= 3) {
    for (let i = 1; i < keyPoints.length; i++) {
      // Si la vitesse augmente ou stagne entre deux points clés → non progressif
      if (keyPoints[i] > keyPoints[i - 1] - 2) progressiveDecel = false;
    }
    // Freinage brutal : chute > 30 km/h sur un intervalle consécutif de points
    for (let i = 1; i < ptsWithDist.length; i++) {
      if (ptsWithDist[i - 1].speed_kmh - ptsWithDist[i].speed_kmh > 28) { bigSuddenBrake = true; break; }
    }
  }

  // ── Début réel de la décélération ─────────────────────────────────────────
  const DECEL_THRESHOLD = 4;
  let maxSpd = ptsWithDist[0].speed_kmh;
  let decelStartDist = null;
  for (let i = 1; i < ptsWithDist.length; i++) {
    if (ptsWithDist[i - 1].speed_kmh > maxSpd) maxSpd = ptsWithDist[i - 1].speed_kmh;
    if (ptsWithDist[i].speed_kmh < maxSpd - DECEL_THRESHOLD) {
      decelStartDist = ptsWithDist[i - 1].d;
      break;
    }
  }

  const alreadySlow = s150 !== null && s150 <= 35;

  // ── Score de base selon la zone d'anticipation ────────────────────────────
  let anticipationZone, baseScore;
  if (alreadySlow || (decelStartDist !== null && decelStartDist >= 100)) {
    anticipationZone = 'zone1'; baseScore = 100;
  } else if (decelStartDist !== null && decelStartDist >= 60) {
    anticipationZone = 'zone2'; baseScore = 80;
  } else {
    anticipationZone = 'zone3'; baseScore = 50;
  }

  // ── Pénalité progressivité ────────────────────────────────────────────────
  let progressPenalty = 0;
  if (!progressiveDecel && keyPoints.length >= 3) progressPenalty = 15;
  if (bigSuddenBrake) progressPenalty = Math.max(progressPenalty, 20);

  // ── Pénalité dépassement de la limitation dans les 100 derniers mètres ───
  let speedLimitPenalty = 0;
  let maxExcessLast100 = 0;
  for (const p of last100Pts) {
    const limit = p.speed_limit || approachSpeedLimit;
    const excess = p.speed_kmh - limit;
    if (excess > maxExcessLast100) maxExcessLast100 = excess;
  }
  if (maxExcessLast100 > 20) speedLimitPenalty = 20;
  else if (maxExcessLast100 > 10) speedLimitPenalty = 12;
  else if (maxExcessLast100 > 0) speedLimitPenalty = 5;

  // ── Pénalité vitesse d'entrée (nouvelle logique granulaire) ───────────────
  let entryPenalty = 0;
  if (sEntry !== null) {
    if (sEntry > 45) entryPenalty = 30;
    else if (sEntry > 40) entryPenalty = 20;
    else if (sEntry > 34) entryPenalty = 10;
  }

  const roundaboutScore = Math.max(0, baseScore - progressPenalty - speedLimitPenalty - entryPenalty);

  // ── Rating qualitatif ─────────────────────────────────────────────────────
  let rating;
  if (roundaboutScore >= 90) rating = 'perfect';
  else if (roundaboutScore >= 75) rating = 'very_good';
  else if (roundaboutScore >= 60) rating = 'good';
  else if (roundaboutScore >= 40) rating = 'late';
  else rating = 'dangerous';

  const totalPts = ptsWithDist.filter(p => p.d >= 50 && p.d <= 150).length;

  return {
    rating,
    confidence: totalPts >= 4 ? 'high' : totalPts >= 2 ? 'medium' : 'low',
    anticipation_zone: anticipationZone,
    decel_start_dist: decelStartDist !== null ? Math.round(decelStartDist) : null,
    progressive_decel: progressiveDecel,
    base_score: baseScore,
    progress_penalty: progressPenalty,
    speed_limit_penalty: speedLimitPenalty,
    entry_speed_penalty: entryPenalty,
    irregular_braking_penalty: bigSuddenBrake ? 20 : 0, // compat display
    roundabout_score: roundaboutScore,
    approach_speed_limit: approachSpeedLimit,
    max_excess_last100m: Math.round(maxExcessLast100),
    speed_at_150m: s150 != null ? Math.round(s150) : null,
    speed_at_100m: s100 != null ? Math.round(s100) : null,
    speed_at_65m:  s50  != null ? Math.round(s50)  : null,
    speed_at_entry: sEntry != null ? Math.round(sEntry) : null,
    zone_150_100: zoneStats(100, 170),
    zone_100_50:  zoneStats(50, 100),
    zone_50_entry: zoneStats(0, 50),
  };
}

// ─── Stop crossing analysis ────────────────────────────────────────────────────

function analyzeStopCrossing(approachPoints, stopPos) {
  const d = p => haversine(p.lat, p.lng, stopPos.lat, stopPos.lon);
  const pts30 = approachPoints.filter(p => d(p) < 35 && d(p) > 20);
  const speed30 = pts30.length ? pts30.reduce((s,p)=>s+p.speed_kmh,0)/pts30.length : null;
  const minSpeed = approachPoints.length ? Math.min(...approachPoints.map(p=>p.speed_kmh)) : null;
  const respected = minSpeed != null && minSpeed < 5;
  let rating = 'respected';
  if (!respected) rating = (minSpeed != null && minSpeed < 12) ? 'glisse' : 'dangerous';
  return {
    speed_at_30m: speed30 != null ? Math.round(speed30 * 10) / 10 : null,
    min_speed_kmh: minSpeed != null ? Math.round(minSpeed * 10) / 10 : null,
    respected, rating,
    confidence: approachPoints.length >= 3 ? 'high' : 'low',
  };
}

// ─── Main track analysis ───────────────────────────────────────────────────────

function analyzeTrack(gpsTrack, osmData) {
  const { roundabouts, speedLimits, stops } = osmData;
  const events = [];
  const roadTypeCounts = {};

  // Enrichir chaque point avec la limitation + type de route
  // Rayon d'exclusion des ronds-points pour la détection d'excès
  const RB_EXCLUSION_M = 80; // 80m autour du centre = approche + intérieur + sortie

  // Carry-over de la dernière limite connue : si aucun segment OSM ne couvre
  // le point, on hérite de la limite valide précédente au lieu de retomber à
  // 50 km/h (qui générait de faux excès sur autoroute). Ces points sont marqués
  // `limit_unknown` et exclus du scoring vitesse.
  let lastLimit = null, lastType = null;

  const pts = gpsTrack.map((p, i) => {
    const prev = i > 0 ? gpsTrack[i-1] : null;
    const headingDeg = prev ? bearing(prev.lat, prev.lng, p.lat, p.lng) : null;
    let nearRb = null;
    let inRbZone = false;
    for (const rb of roundabouts) {
      const d = haversine(p.lat, p.lng, rb.lat, rb.lon);
      if (d <= 45) { nearRb = rb; inRbZone = true; break; }
      if (d <= RB_EXCLUSION_M) { inRbZone = true; }
    }
    const seg = findSpeedLimit(p.lat, p.lng, speedLimits, headingDeg, p.speed_kmh);
    let limit, roadType, limitUnknown = false;
    if (nearRb) {
      limit = nearRb.maxspeed || 30;
      roadType = 'urban';
      if (limit != null) { lastLimit = limit; lastType = roadType; }
    } else if (seg) {
      limit = seg.speed; roadType = seg.type;
      lastLimit = limit; lastType = roadType;
    } else if (lastLimit != null) {
      // Carry-over de la dernière limite connue (anti faux-excès autoroute)
      limit = lastLimit; roadType = lastType; limitUnknown = true;
    } else {
      // Aucune limite connue pour ce début de trace → point exclu du scoring
      limit = null; roadType = lastType || 'urban'; limitUnknown = true;
    }
    roadTypeCounts[roadType] = (roadTypeCounts[roadType] || 0) + 1;
    return { ...p, speed_limit: limit, road_type: roadType, in_rb_zone: inRbZone, limit_unknown: limitUnknown };
  });

  // ── Détection excès de vitesse (anti-doublon + cooldown 3 points) ─────────────
  const TOLERANCE_KMH = 6;
  const COOLDOWN_POINTS = 3; // points consécutifs sous la limite pour fermer un excès
  let activeExcess = null;
  let belowCount = 0;

  const flushExcess = () => {
    if (!activeExcess) return;
    events.push({
      event_type: 'speeding',
      severity: activeExcess.maxSpeed > activeExcess.limit + 20 ? 'high' : 'medium',
      latitude: activeExcess.startPoint.lat, longitude: activeExcess.startPoint.lng,
      speed_kmh: activeExcess.maxSpeed, speed_limit_kmh: activeExcess.limit,
      timestamp: activeExcess.startPoint.timestamp,
      description: `Excès : ${Math.round(activeExcess.maxSpeed)} km/h (limite ${activeExcess.limit} km/h)`,
      confidence: 'medium',
      speeding_detail: { start_time: activeExcess.startPoint.timestamp, max_speed_kmh: activeExcess.maxSpeed, limit_kmh: activeExcess.limit },
    });
    activeExcess = null;
    belowCount = 0;
  };

  for (const p of pts) {
    if (p.low_precision) continue;
    if (p.in_rb_zone) continue; // Les ronds-points sont évalués séparément (décélération/entrée/sortie)
    if (p.limit_unknown) {
      // Limite inconnue sur ce point : on clôt l'excès en cours (cooldown) sans
      // en ouvrir de nouveau — pas de score sur les zones non couvertes.
      if (activeExcess) { belowCount++; if (belowCount >= COOLDOWN_POINTS) flushExcess(); }
      continue;
    }
    const over = p.speed_kmh > p.speed_limit + TOLERANCE_KMH;
    if (over) {
      belowCount = 0;
      if (!activeExcess) {
        activeExcess = { startPoint: p, maxSpeed: p.speed_kmh, limit: p.speed_limit };
      } else if (Math.abs(p.speed_limit - activeExcess.limit) > 20) {
        // Rupture de contexte (ex. 50 → 130, ou 130 → 50) : on clôt l'excès en
        // cours et on en ouvre un nouveau, pour éviter le sandwich « 57→131 km/h
        // / limite 50 » qui agrégeait deux contextes routiers distincts.
        flushExcess();
        activeExcess = { startPoint: p, maxSpeed: p.speed_kmh, limit: p.speed_limit };
      } else {
        activeExcess.maxSpeed = Math.max(activeExcess.maxSpeed, p.speed_kmh);
        activeExcess.limit = Math.min(activeExcess.limit, p.speed_limit);
      }
    } else if (activeExcess) {
      belowCount++;
      if (belowCount >= COOLDOWN_POINTS) flushExcess();
    }
  }
  flushExcess(); // fermer l'excès actif en fin de trajet

  // ── Analyse ronds-points ───────────────────────────────────────────────────
  const analyzedRb = new Set();
  for (const rb of roundabouts) {
    // Large radius : un conducteur sur la route d'approche passe à ~50-150m du centre
    const approachPts = pts.filter(p => haversine(p.lat, p.lng, rb.lat, rb.lon) < 400);
    if (approachPts.length < 3) {
      console.log(`[RB] Skip ${rb.id}: only ${approachPts.length} pts dans 400m`);
      continue;
    }
    const minDist = Math.min(...approachPts.map(p => haversine(p.lat, p.lng, rb.lat, rb.lon)));
    const minSpeed = Math.min(...approachPts.map(p => p.speed_kmh));
    // Validation adaptée au rayon réel du giratoire : le conducteur sur
    // l'anneau passe à ~radius du centre. On accepte jusqu'à radius + 20 m
    // (tolérance GPS + bruit). Un mini_roundabout (rayon ~8 m) rejette un
    // GPS à 46 m (giratoire voisin) ; un grand giratoire (rayon 30 m) reste
    // détecté. Défaut 15 m si rayon inconnu (cache ancien).
    const rbRadius = rb.radius ?? 15;
    const maxTraversalDist = Math.min(60, rbRadius + 20);
    console.log(`[RB] ${rb.id} minDist=${Math.round(minDist)}m minSpeed=${Math.round(minSpeed)}km/h radius=${rbRadius}m pts=${approachPts.length}`);
    if (minDist > maxTraversalDist) {
      console.log(`[RB] Skip ${rb.id}: trop loin du tracé GPS (${Math.round(minDist)}m > ${Math.round(maxTraversalDist)}m) — giratoire non traversé`);
      continue;
    }
    // Anti faux-positif surplomb/parallèle : si la vitesse minimale sur l'approche
    // reste bien supérieure à la limite du rond-point, le conducteur ne l'a pas
    // traversé (autoroute en surplomb, route parallèle, échangeur contourné).
    // On ne crée pas d'événement "insufficient_data" parasite.
    const rbEntryThreshold = Math.max((rb.maxspeed ?? 50) + 30, 55);
    if (minSpeed > rbEntryThreshold) {
      console.log(`[RB] Skip ${rb.id}: vitesse min ${Math.round(minSpeed)} km/h > seuil entrée ${rbEntryThreshold} km/h → non traversé (surplomb/parallèle)`);
      continue;
    }
    analyzedRb.add(rb.id);

    const analysis = analyzeRoundaboutApproach(approachPts, { lat: rb.lat, lon: rb.lon });
    const closest = approachPts.reduce((m,p) => haversine(p.lat,p.lng,rb.lat,rb.lon)<haversine(m.lat,m.lng,rb.lat,rb.lon)?p:m, approachPts[0]);
    const eventType = analysis.rating === 'dangerous' ? 'roundabout_dangerous'
      : (analysis.rating === 'perfect' || analysis.rating === 'very_good' || analysis.rating === 'good') ? 'roundabout_good'
      : 'roundabout_poor';
    events.push({
      event_type: eventType,
      severity: analysis.rating === 'dangerous' ? 'high' : analysis.rating === 'late' ? 'medium' : 'low',
      latitude: rb.lat, longitude: rb.lon,
      speed_kmh: closest.speed_kmh, timestamp: closest.timestamp,
      description: `Rond-point — ${analysis.rating}`,
      confidence: analysis.confidence, roundabout_detail: analysis,
    });
  }

  // ── Analyse stops ──────────────────────────────────────────────────────────
  const STOP_BEARING_TOL = 35;
  const analyzedStops = new Set();
  const analyzedStopPos = []; // positions déjà validées (dédup doublons OSM < 15m)

  // ── Regroupement des stops proches (cluster < 15m) ────────────────────────
  // Un même carrefour peut avoir plusieurs nœuds stop OSM (un par direction
  // d'approche, ou nœud panneau + ligne d'arrêt). La dédup naïve gardait le
  // premier rencontré — parfois le stop "d'en face". On regroupe les stops
  // proches puis, pour chaque grappe, on ne garde que le nœud le plus proche
  // de la trace GPS (le stop réellement rencontré par le conducteur).
  const trackMinDist = (s) => pts.reduce((m, p) => Math.min(m, haversine(p.lat, p.lng, s.lat, s.lon)), Infinity);
  const clustered = new Set();
  const selectedStops = [];
  for (const stop of stops) {
    if (clustered.has(stop.id)) continue;
    const cluster = [stop]; clustered.add(stop.id);
    for (const other of stops) {
      if (clustered.has(other.id)) continue;
      if (haversine(stop.lat, stop.lon, other.lat, other.lon) < 15) {
        cluster.push(other); clustered.add(other.id);
      }
    }
    // Ne garder que le stop le plus proche de la trace GPS dans la grappe
    const best = cluster.reduce((b, s) => trackMinDist(s) < trackMinDist(b) ? s : b, cluster[0]);
    selectedStops.push(best);
  }

  for (const stop of selectedStops) {
    const nearPts = pts.filter(p => haversine(p.lat, p.lng, stop.lat, stop.lon) < 40);
    if (nearPts.length < 2) continue;
    if (!nearPts.some(p => haversine(p.lat, p.lng, stop.lat, stop.lon) < 12)) continue;
    if (analyzedStops.has(stop.id)) continue;
    // Déduplication : OSM cartographie parfois le même stop à quelques mètres
    // (nœud panneau + nœud ligne d'arrêt). On ne garde que le premier.
    if (analyzedStopPos.some(s => haversine(s.lat, s.lon, stop.lat, stop.lon) < 15)) {
      console.log(`[STOP] Skip ${stop.id}: doublon OSM à <15m d'un stop déjà analysé`);
      continue;
    }

    const closePts = nearPts.filter(p => haversine(p.lat, p.lng, stop.lat, stop.lon) < 12);
    if (!closePts.length) continue;
    // Point de plus proche approche réel (pas le premier à <12 m) : garantit
    // que le cap et la fenêtre d'analyse vitesse sont calculés depuis le
    // point où le véhicule est le plus près du panneau — pas un point
    // quelconque à 11 m qui fausserait le relèvement.
    const stopDist = (p) => haversine(p.lat, p.lng, stop.lat, stop.lon);
    const closestPt = closePts.reduce((m, p) => stopDist(p) < stopDist(m) ? p : m, closePts[0]);
    const idx = pts.indexOf(closestPt);
    if (idx < 2) continue;

    // Stop adjacent (rue perpendiculaire) : si le véhicule passe à moins de 12 m
    // du panneau SANS ralentir (vitesse minimale sur ces points > 15 km/h), il ne
    // franchise pas le stop — c'est un panneau sur une rue voisine. Critère
    // objectif indépendant du cap, robuste aux traces GPS bruitées.
    const closeMinSpeed = Math.min(...closePts.map(p => p.speed_kmh));
    if (closeMinSpeed > 15) {
      console.log(`[STOP] Skip ${stop.id}: vitesse min ${Math.round(closeMinSpeed)} km/h à <12m (stop adjacent probable)`);
      continue;
    }

    const prevPt = pts[Math.max(0, idx - 3)];
    const headingDeg = bearing(prevPt.lat, prevPt.lng, closestPt.lat, closestPt.lng);
    const detectionBearingDeg = bearing(closestPt.lat, closestPt.lng, stop.lat, stop.lon);
    if (headingDeg == null || detectionBearingDeg == null) continue;
    let diff = Math.abs(detectionBearingDeg - headingDeg);
    if (diff > 180) diff = 360 - diff;
    if (diff > STOP_BEARING_TOL) continue;

    analyzedStops.add(stop.id);
    analyzedStopPos.push({ lat: stop.lat, lon: stop.lon });
    // Fenêtre élargie après le panneau : l'arrêt effectif se fait à la ligne
    // d'arrêt, souvent quelques mètres après le nœud panneau OSM. Inclure les
    // points post-panneau est crucial pour capter l'immobilisation réelle.
    const approachPts = pts.slice(Math.max(0, idx-20), Math.min(pts.length, idx+8));
    const analysis = analyzeStopCrossing(approachPts, { lat: stop.lat, lon: stop.lon });
    // Rejeter si aucun point dans la zone d'approche 20-35m (vehicule sur rue perpendiculaire)
    if (analysis.speed_at_30m === null) {
      console.log(`[STOP] Skip ${stop.id}: pas de point d'approche 20-35m (rue perpendiculaire probable)`);
      continue;
    }
    events.push({
      event_type: analysis.respected ? 'stop_respected' : 'stop_violated',
      severity: analysis.rating === 'dangerous' ? 'high' : analysis.rating === 'glisse' ? 'medium' : 'low',
      latitude: stop.lat, longitude: stop.lon,
      speed_kmh: closestPt.speed_kmh, timestamp: closestPt.timestamp,
      description: `STOP — ${analysis.rating}`,
      confidence: analysis.confidence,
      stop_detail: { ...analysis, headingDeg: Math.round(headingDeg*10)/10, detectionBearingDeg: Math.round(detectionBearingDeg*10)/10, angleTolerance: STOP_BEARING_TOL, bearingDiff: Math.round(diff*10)/10 },
    });
  }

  const total = pts.length || 1;
  const roadTypes = {
    urban: Math.round((roadTypeCounts.urban || 0) / total * 100),
    periurban: Math.round((roadTypeCounts.periurban || 0) / total * 100),
    highway: Math.round((roadTypeCounts.highway || 0) / total * 100),
  };

  return { events, roadTypes, enrichedTrack: pts };
}

// ─── Score computation ─────────────────────────────────────────────────────────

/**
 * Calcul du score vitesse basé sur la distance en infraction pondérée par gravité.
 * @param {Array} enrichedPts - Points GPS enrichis avec speed_kmh, speed_limit, in_rb_zone, low_precision
 * @param {number} totalDistKm - Distance totale du trajet en km
 * @returns {{ score: number, hasExcess40_50: boolean, hasExcess50plus: boolean, speedingCount: number }}
 */
function computeSpeedScoreFromTrack(enrichedPts, totalDistKm) {
  const TOLERANCE = 6;
  const severityCoeff = (rawOver) => {
    if (rawOver >= 50) return 3;
    if (rawOver >= 40) return 2.5;
    if (rawOver >= 30) return 2;
    if (rawOver >= 20) return 1.5;
    return 1;
  };

  let weightedInfractionKm = 0;
  let hasExcess40_50 = false;
  let hasExcess50plus = false;
  let speedingSegments = 0;

  for (let i = 0; i < enrichedPts.length - 1; i++) {
    const p = enrichedPts[i];
    const q = enrichedPts[i + 1];
    if (p.low_precision || p.in_rb_zone || !p.speed_limit || p.limit_unknown) continue;

    const segDistKm = haversine(p.lat, p.lng, q.lat, q.lng) / 1000;
    const rawOver = p.speed_kmh - p.speed_limit;
    const netOver = rawOver - TOLERANCE; // tolérance +6 km/h

    if (netOver > 0) {
      const coeff = severityCoeff(rawOver);
      weightedInfractionKm += segDistKm * coeff;
      speedingSegments++;
      if (rawOver >= 50) hasExcess50plus = true;
      else if (rawOver >= 40) hasExcess40_50 = true;
    }
  }

  const dist = Math.max(totalDistKm, 0.1);
  // Ratio de distance respectée (pondérée) — clampé entre 0 et 100%
  const pctRespected = Math.max(0, Math.min(100, (1 - weightedInfractionKm / dist) * 100));

  let score;
  if (pctRespected >= 100) score = 100;
  else if (pctRespected >= 95) score = Math.round(90 + (pctRespected - 95) * 2);
  else if (pctRespected >= 90) score = Math.round(80 + (pctRespected - 90) * 2);
  else if (pctRespected >= 80) score = Math.round(65 + (pctRespected - 80) * 1.4);
  else if (pctRespected >= 70) score = Math.round(50 + (pctRespected - 70) * 1.5);
  else score = Math.round(Math.max(0, (pctRespected / 70) * 50));

  // Plafonds selon gravité maximale
  if (hasExcess50plus) score = Math.min(score, 55);
  else if (hasExcess40_50) score = Math.min(score, 70);

  console.log(`[SpeedScore] pctRespected=${pctRespected.toFixed(1)}% weightedInfraction=${weightedInfractionKm.toFixed(3)}km score=${score}`);

  return {
    score: Math.max(0, Math.min(100, score)),
    hasExcess40_50,
    hasExcess50plus,
    speedingCount: speedingSegments > 0 ? 1 : 0, // sera compté depuis les events
  };
}

function computeScores({ events, distKm, enrichedTrack, harshBrakingCount, harshAccelCount, distractionPenalty, fatiguePenalty }) {
  const rbEvents = events.filter(e => e.event_type?.startsWith('roundabout'));
  const stopEvents = events.filter(e => e.event_type?.startsWith('stop'));
  const speedEvents = events.filter(e => e.event_type === 'speeding');
  const hasRoundabouts = rbEvents.length > 0;
  const hasStops = stopEvents.length > 0;

  // Note finale = moyenne des scores individuels de chaque rond-point
  const anticipationScore = hasRoundabouts
    ? Math.round(rbEvents.reduce((sum, e) => sum + (e.roundabout_detail?.roundabout_score ?? 70), 0) / rbEvents.length)
    : 100;
  const goodRb = rbEvents.filter(e => e.event_type === 'roundabout_good').length;

  const respectedStops = stopEvents.filter(e => e.event_type === 'stop_respected').length;
  const violatedDanger = stopEvents.filter(e => e.event_type === 'stop_violated' && e.severity === 'high').length;
  const stopScore = hasStops
    ? Math.max(0, Math.round((respectedStops / stopEvents.length) * 100 - violatedDanger * 15)) : 100;

  // Nouveau scoring vitesse basé sur la distance pondérée
  const speedResult = enrichedTrack?.length > 1
    ? computeSpeedScoreFromTrack(enrichedTrack, distKm)
    : { score: Math.max(0, Math.round(100 - (speedEvents.length / Math.max(distKm, 1)) * 20)), hasExcess40_50: false, hasExcess50plus: false };
  const speedScore = speedResult.score;

  const d = Math.max(distKm, 1);
  const smoothnessScore = Math.max(0, Math.round(100 - ((harshBrakingCount + harshAccelCount) / d) * 15));

  let w = { anticipation: 0, stop: 0, speed: 40, smoothness: 30, attention: 30 };
  if (hasRoundabouts && hasStops) w = { anticipation: 25, stop: 20, speed: 25, smoothness: 20, attention: 10 };
  else if (hasRoundabouts) w = { anticipation: 35, stop: 0, speed: 30, smoothness: 25, attention: 10 };
  else if (hasStops) w = { anticipation: 0, stop: 30, speed: 30, smoothness: 25, attention: 15 };

  const basePenalty = distractionPenalty + fatiguePenalty;
  const raw =
    (hasRoundabouts ? anticipationScore * w.anticipation / 100 : 0) +
    (hasStops ? stopScore * w.stop / 100 : 0) +
    speedScore * w.speed / 100 +
    smoothnessScore * w.smoothness / 100 +
    Math.max(0, 100 - basePenalty) * w.attention / 100;
  const overallScore = Math.max(0, Math.min(100, Math.round(raw - basePenalty * 0.3)));

  return {
    overall_score: overallScore,
    anticipation_score: anticipationScore,
    stop_score: stopScore,
    speed_score: speedScore,
    smoothness_score: smoothnessScore,
    roundabouts_count: rbEvents.length,
    roundabouts_good: goodRb,
    roundabouts_poor: rbEvents.filter(e => ['roundabout_poor','roundabout_dangerous'].includes(e.event_type)).length,
    stops_respected: respectedStops,
    stops_violated: stopEvents.filter(e => e.event_type === 'stop_violated').length,
    speeding_count: speedEvents.length,
  };
}

// ─── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  // Tolère les appels internes sans session (workflow de retry pending_osm) ;
  // reste authentifié quand l'app l'invoque directement.
  const user = await base44.auth.me().catch(() => null);

  const { tripId } = await req.json();
  if (!tripId) return Response.json({ error: 'Missing tripId' }, { status: 400 });

  try {
    // Récupérer le trajet
    const trips = await base44.asServiceRole.entities.Trip.filter({ id: tripId });
    const trip = trips[0];
    if (!trip) return Response.json({ error: 'Trip not found' }, { status: 404 });

    const rawTrack = trip.gps_track || [];
    if (rawTrack.length < 5) {
      await base44.asServiceRole.entities.Trip.update(tripId, {
        status: 'completed', overall_score: 100, speed_score: 100,
        smoothness_score: 100, anticipation_score: 100, stop_score: 100,
        serenity_index: 100, serenity_label: 'Sereine', serenity_summary: 'Trajet trop court pour une analyse approfondie.',
      });
      return Response.json({ ok: true, note: 'Trace GPS trop courte' });
    }

    // Pré-traitement GPS : rejet des points aberrants + lissage léger + confiance
    const { track: gpsTrack, confidence: dataConfidence, dropped: droppedCount } = filterGpsTrack(rawTrack);
    console.log(`[analyzeTrip] GPS: ${rawTrack.length} → ${gpsTrack.length} pts (dropped ${droppedCount}, confiance ${dataConfidence.toFixed(2)})`);

    // Construire la carte OSM (corridor par tronçons le long de la trace)
    const osmData = await buildOsmMap(gpsTrack, base44);

    // Couverture partielle → on ne calcule pas de score (le workflow de retry
    // ré-invokera ce trajet jusqu'à couverture complète).
    if (osmData.coverage === 'partial') {
      await base44.asServiceRole.entities.Trip.update(tripId, {
        status: 'pending_osm',
        osm_coverage: 'partial',
        osm_error: `Couverture partielle : ${osmData.missing} tronçon(s) injoignable(s)`,
      }).catch(() => {});
      console.warn(`[analyzeTrip] Coverage partielle — trip ${tripId} marqué pending_osm (${osmData.missing} tronçon(s) échoué(s))`);
      return Response.json({ ok: false, osm_failed: true, partial: true, missing: osmData.missing });
    }

    // Analyser la trace (OSM : excès, ronds-points, stops)
    const { events: osmEvents, roadTypes, enrichedTrack } = analyzeTrack(gpsTrack, osmData);

    // ── Détections non-OSM calculées côté backend (isté à la trace brute) ──
    const harshResult = detectHarshDriving(gpsTrack);
    const distractionResult = computeDistractionSummary(trip.distraction_signals, gpsTrack);
    const fatigueSummary = computeFatigueSummary(gpsTrack);
    console.log(`[analyzeTrip] OSM=${osmEvents.length} harsh=${harshResult.events.length} phone=${distractionResult.events.length} fatigue=${fatigueSummary.alertCount}`);

    // Fusionner tous les événements (seront persistés en DrivingEvents)
    const events = [...osmEvents, ...harshResult.events, ...distractionResult.events];

    // Calculer les scores (pénalités backend, plus de dépendance au front)
    const scores = computeScores({
      events,
      distKm: trip.distance_km || 1,
      enrichedTrack,
      harshBrakingCount: harshResult.harshBrakingCount,
      harshAccelCount: harshResult.harshAccelCount,
      distractionPenalty: distractionResult.summary.scorePenalty,
      fatiguePenalty: fatigueSummary.scorePenalty,
    });

    // Indice de sérénité contextuel (météo, heure, fatigue, densité) via LLM déterministe + fallback
    const serenity = await computeSerenityIndex(base44, {
      scores,
      context: {
        weather: trip.weather || 'unknown',
        trafficLevel: trip.traffic_level || 'unknown',
        startHour: trip.start_time ? new Date(trip.start_time).getHours() : null,
        fatigueAlertCount: trip.fatigue_summary?.alertCount || 0,
        distractionCount: trip.distraction_summary?.count || 0,
        roundaboutsCount: scores.roundabouts_count || 0,
        stopsCount: (scores.stops_respected || 0) + (scores.stops_violated || 0),
        distanceKm: trip.distance_km || 0,
        roadTypes,
      },
    });
    console.log(`[analyzeTrip] Sérénité: idx=${serenity.serenity_index} label=${serenity.label} axe=${serenity.primary_axis}`);

    // Mise à jour du Trip
    await base44.asServiceRole.entities.Trip.update(tripId, {
      ...scores,
      road_types: roadTypes,
      gps_track: enrichedTrack,
      harsh_braking_count: harshResult.harshBrakingCount,
      harsh_acceleration_count: harshResult.harshAccelCount,
      phone_usage_seconds: distractionResult.phoneUsageSeconds,
      fatigue_summary: fatigueSummary,
      distraction_summary: distractionResult.summary,
      status: 'completed',
      osm_coverage: osmData.coverage || 'full',
      data_confidence: Math.round(dataConfidence * 100) / 100,
      serenity_index: serenity.serenity_index,
      serenity_label: serenity.label,
      serenity_primary_axis: serenity.primary_axis,
      serenity_secondary_axis: serenity.secondary_axis || null,
      serenity_summary: serenity.one_line_summary,
      context_note: serenity.context_note || null,
    });

    // Supprimer les anciens DrivingEvents OSM en un seul appel (évite N allers-retours)
    const oldEvents = await base44.asServiceRole.entities.DrivingEvent.filter({ trip_id: tripId });
    if (oldEvents.length > 0) {
      await base44.asServiceRole.entities.DrivingEvent.deleteMany({ trip_id: tripId });
      console.log(`[analyzeTrip] ${oldEvents.length} anciens événements supprimés (bulk)`);
    }

    // Création des nouveaux DrivingEvents
    const eventsToSave = events.filter(e => e.latitude && e.longitude);
    if (eventsToSave.length > 0) {
      await base44.asServiceRole.entities.DrivingEvent.bulkCreate(
        eventsToSave.map(e => ({ ...e, trip_id: tripId }))
      );
    }

    console.log(`[analyzeTrip] Terminé — score=${scores.overall_score}, events=${eventsToSave.length}`);
    return Response.json({ ok: true, overall_score: scores.overall_score, events_count: eventsToSave.length });

  } catch (err) {
    console.error('[analyzeTrip] Erreur:', err.message);
    // Si OSM est indisponible, on marque le trajet comme "pending_osm" pour permettre un retry ultérieur
    const isOsmError = err.message?.includes('OSM_UNAVAILABLE');
    await base44.asServiceRole.entities.Trip.update(tripId, {
      status: isOsmError ? 'pending_osm' : 'completed',
      osm_error: isOsmError ? err.message : undefined,
    }).catch(() => {});
    return Response.json({ error: err.message, osm_failed: isOsmError }, { status: isOsmError ? 503 : 500 });
  }
});