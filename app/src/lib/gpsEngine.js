/**
 * FeelGood Conduite — Moteur GPS Central
 * Vitesse GPS native uniquement, API Overpass OSM, excès anti-doublon
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

export const GPS_INTERVALS = {
  URBAN: 1000,        // 1s — limite ≤ 50 km/h
  PERIURBAN: 3000,    // 3s — limite 51-100 km/h
  HIGHWAY: 6000,      // 6s — limite > 100 km/h
  APPROACH: 1000,     // 1s forcé si élément < 160m
};

export const THRESHOLDS = {
  AUTO_START_SPEED_KMH: 15,
  AUTO_START_DURATION_MS: 10000,
  AUTO_STOP_SPEED_KMH: 5,
  AUTO_STOP_DURATION_MS: 180000,
  GPS_LOST_TIMEOUT_MS: 30000,
  GPS_LOW_PRECISION_M: 20,
  APPROACH_DISTANCE_M: 160,
  RESUME_DISTANCE_M: 50,
  HARSH_BRAKING_G: 0.3,
  HARSH_ACCEL_G: 0.3,
  SPEEDING_TOLERANCE_KMH: 6,   // Tolérance fixe +6 km/h
  SPEEDING_CLEAR_DURATION_S: 10, // 10s sous la limite pour clore un excès
  MIN_DECELERATION_KMH: 12,
  MIN_DECELERATION_PCT: 0.10,
};

export const ROUNDABOUT_ZONES = {
  ZONE1_START: 150, ZONE1_END: 100,
  ZONE2_START: 99,  ZONE2_END: 60,
  ZONE3_START: 59,  ZONE3_END: 0,
  ENTRY_ZONE: 20,
  MAX_ENTRY_SPEED: 35,
  ALREADY_SLOW_THRESHOLD: 35,
};

// ─── Calculs géographiques ────────────────────────────────────────────────────

export function haversineDistance(lat1, lng1, lat2, lng2) {
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

/**
 * Calcule l'accélération en m/s² entre deux vitesses
 */
export function calcAcceleration(speed1Kmh, speed2Kmh, dtMs) {
  const dv = (speed2Kmh - speed1Kmh) / 3.6;
  const dt = dtMs / 1000;
  if (dt <= 0) return 0;
  return dv / dt;
}

// ─── Fréquence GPS adaptative (basée sur limitation OSM) ──────────────────────

/**
 * Détermine la fréquence GPS selon la limitation de la route (OSM)
 * @param {number} speedLimitKmh - Limite de vitesse OSM de la route actuelle
 * @param {boolean} approachingElement - Élément routier à < 160m
 */
export function getGpsInterval(speedLimitKmh, approachingElement) {
  if (approachingElement) {
    return { interval: GPS_INTERVALS.APPROACH, label: '1s', mode: 'approach' };
  }
  if (speedLimitKmh > 100) {
    return { interval: GPS_INTERVALS.HIGHWAY, label: '6s', mode: 'highway' };
  }
  if (speedLimitKmh >= 51) {
    return { interval: GPS_INTERVALS.PERIURBAN, label: '3s', mode: 'periurban' };
  }
  return { interval: GPS_INTERVALS.URBAN, label: '1s', mode: 'urban' };
}

export function inferRoadTypeFromLimit(speedLimitKmh) {
  if (speedLimitKmh > 100) return 'highway';
  if (speedLimitKmh >= 51) return 'periurban';
  return 'urban';
}

// ─── (Overpass supprimé — données locales alsace_final.json utilisées) ───────

// ─── Analyse ronds-points ─────────────────────────────────────────────────────

/**
 * Analyse complète d'un franchissement de rond-point :
 * - Phase entrée : décélération avant le centre (points dist 0–160m approche)
 * - Phase sortie : reprise de vitesse après le centre (points dist 20–80m éloignement)
 *
 * @param {Array} approachPoints  - Points GPS captés AVANT le centre (tri desc dist)
 * @param {Array} exitPoints      - Points GPS captés APRÈS le centre (tri asc dist depuis centre)
 * @param {Object} roundaboutPos  - { lat, lng } du centre
 */
export function analyzeRoundabout(approachPoints, roundaboutPos, exitPoints = []) {
  if (!approachPoints || approachPoints.length < 2) {
    return { rating: 'insufficient_data', confidence: 'insufficient_data', roundabout_score: 50 };
  }

  const ptsWithDist = approachPoints
    .filter(p => !p.low_precision)
    .map(p => ({
      ...p,
      dist: haversineDistance(p.lat, p.lng, roundaboutPos.lat, roundaboutPos.lng),
    }))
    .filter(p => p.dist <= 170)
    .sort((a, b) => b.dist - a.dist);

  if (ptsWithDist.length < 2) {
    return { rating: 'insufficient_data', confidence: 'insufficient_data', roundabout_score: 50 };
  }

  const avgInRange = (min, max) => {
    const pts = ptsWithDist.filter(p => p.dist >= min && p.dist <= max);
    return pts.length ? pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length : null;
  };

  const zoneStats = (min, max) => {
    const pts = ptsWithDist.filter(p => p.dist >= min && p.dist < max);
    if (!pts.length) return { count: 0, avg: null, max: null, decel: null };
    const speeds = pts.map(p => p.speed_kmh);
    return {
      count: pts.length,
      avg: Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length * 10) / 10,
      max: Math.round(Math.max(...speeds) * 10) / 10,
      decel: pts.length >= 2 ? Math.round((pts[0].speed_kmh - pts[pts.length - 1].speed_kmh) * 10) / 10 : null,
    };
  };

  const s150 = avgInRange(140, 170);
  const s100 = avgInRange(90, 110);
  const s50  = avgInRange(40, 60);
  const entryPts = ptsWithDist.filter(p => p.dist <= 25);
  const sEntry = entryPts.length ? Math.min(...entryPts.map(p => p.speed_kmh)) : avgInRange(0, 30);

  const alreadySlow = s150 !== null && s150 <= ROUNDABOUT_ZONES.ALREADY_SLOW_THRESHOLD;

  // Progressivité de la décélération sur les 4 points clés
  const keyPoints = [s150, s100, s50, sEntry].filter(v => v !== null);
  let progressiveDecel = true;
  if (keyPoints.length >= 3) {
    for (let i = 1; i < keyPoints.length; i++) {
      if (keyPoints[i] > keyPoints[i - 1] - 2) { progressiveDecel = false; break; }
    }
  }

  // Freinage brutal
  let bigSuddenBrake = false;
  for (let i = 1; i < ptsWithDist.length; i++) {
    if (ptsWithDist[i - 1].speed_kmh - ptsWithDist[i].speed_kmh > 28) { bigSuddenBrake = true; break; }
  }

  // Début réel de la décélération
  const DECEL_THRESHOLD = 4;
  let maxSpd = ptsWithDist[0].speed_kmh;
  let decelStartDist = null;
  for (let i = 1; i < ptsWithDist.length; i++) {
    if (ptsWithDist[i - 1].speed_kmh > maxSpd) maxSpd = ptsWithDist[i - 1].speed_kmh;
    if (ptsWithDist[i].speed_kmh < maxSpd - DECEL_THRESHOLD) {
      decelStartDist = ptsWithDist[i - 1].dist;
      break;
    }
  }

  let anticipationZone, baseScore;
  if (alreadySlow || (decelStartDist !== null && decelStartDist >= ROUNDABOUT_ZONES.ZONE1_END)) {
    anticipationZone = 'zone1'; baseScore = 100;
  } else if (decelStartDist !== null && decelStartDist >= ROUNDABOUT_ZONES.ZONE2_END) {
    anticipationZone = 'zone2'; baseScore = 80;
  } else {
    anticipationZone = 'zone3'; baseScore = 50;
  }

  // Pénalité progressivité / freinage brutal
  let progressPenalty = 0;
  if (!progressiveDecel && keyPoints.length >= 3) progressPenalty = 15;
  if (bigSuddenBrake) progressPenalty = Math.max(progressPenalty, 20);

  // Pénalité dépassement limitation 100 derniers mètres
  const last100Pts = ptsWithDist.filter(p => p.dist <= 100);
  const approachSpeedLimit = last100Pts.length ? (last100Pts[0].speed_limit || 50) : 50;
  let maxExcessLast100 = 0;
  for (const p of last100Pts) {
    const excess = p.speed_kmh - (p.speed_limit || approachSpeedLimit);
    if (excess > maxExcessLast100) maxExcessLast100 = excess;
  }
  let speedLimitPenalty = 0;
  if (maxExcessLast100 > 20) speedLimitPenalty = 20;
  else if (maxExcessLast100 > 10) speedLimitPenalty = 12;
  else if (maxExcessLast100 > 0) speedLimitPenalty = 5;

  // Pénalité vitesse d'entrée (granulaire)
  let entryPenalty = 0;
  if (sEntry !== null) {
    if (sEntry > 45) entryPenalty = 30;
    else if (sEntry > 40) entryPenalty = 20;
    else if (sEntry > 34) entryPenalty = 10;
  }

  const roundaboutScore = Math.max(0, baseScore - progressPenalty - speedLimitPenalty - entryPenalty);

  let rating;
  if (roundaboutScore >= 90) rating = 'perfect';
  else if (roundaboutScore >= 75) rating = 'very_good';
  else if (roundaboutScore >= 60) rating = 'good';
  else if (roundaboutScore >= 40) rating = 'late';
  else rating = 'dangerous';

  const totalPts = ptsWithDist.filter(p => p.dist >= 50 && p.dist <= 150).length;

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
    irregular_braking_penalty: bigSuddenBrake ? 20 : 0,
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

// ─── Analyse STOP ─────────────────────────────────────────────────────────────

export function analyzeStop(gpsPoints, stopPos) {
  if (!gpsPoints || gpsPoints.length < 2) {
    return { respected: false, rating: 'unknown', confidence: 'insufficient_data' };
  }

  const pointsWithDist = gpsPoints
    .filter(p => !p.low_precision)
    .map(p => ({
      ...p,
      dist: haversineDistance(p.lat, p.lng, stopPos.lat, stopPos.lng),
    }))
    .filter(p => p.dist <= 35)
    .sort((a, b) => b.dist - a.dist);

  if (pointsWithDist.length < 1) {
    return { respected: false, rating: 'unknown', confidence: 'insufficient_data' };
  }

  const at30m = pointsWithDist.find(p => p.dist <= 30 && p.dist > 20);
  const at10m = pointsWithDist.find(p => p.dist <= 10);
  const minSpeed = Math.min(...pointsWithDist.map(p => p.speed_kmh || 999));

  const respected = minSpeed <= 3;
  let rating;
  if (minSpeed <= 3) rating = 'respected';
  else if (minSpeed <= 8) rating = 'glisse';
  else rating = 'dangerous';

  const confidence = pointsWithDist.length >= 3 ? 'high' : 'medium';

  return {
    respected,
    rating,
    confidence,
    speed_at_30m: at30m?.speed_kmh ?? null,
    speed_at_10m: at10m?.speed_kmh ?? null,
    min_speed_kmh: minSpeed === 999 ? null : minSpeed,
  };
}

// ─── Gestion excès de vitesse (anti-doublon) ──────────────────────────────────

/**
 * Gestionnaire d'état pour les excès de vitesse
 * Un excès = un seul événement, clôturé après 10s consécutives sous la limite
 */
export class SpeedingTracker {
  constructor() {
    this.activeExcess = null;   // { startTime, startLat, startLng, maxSpeed, limit }
    this.clearTimer = null;     // Timeout de 10s pour clôturer
    this.completedExcesses = []; // Excès terminés
  }

  /**
   * @returns {Object|null} excès créé/terminé ou null
   */
  update(speedKmh, limit, lat, lng, timestamp) {
    const overLimit = speedKmh > limit + THRESHOLDS.SPEEDING_TOLERANCE_KMH;

    if (overLimit) {
      // Annuler le timer de clôture
      if (this.clearTimer) {
        clearTimeout(this.clearTimer);
        this.clearTimer = null;
      }

      if (!this.activeExcess) {
        // Démarrer un nouvel excès
        this.activeExcess = {
          startTime: timestamp,
          startLat: lat, startLng: lng,
          maxSpeed: speedKmh,
          limit,
        };
        return { type: 'started', excess: this.activeExcess };
      } else {
        // Mettre à jour le max
        if (speedKmh > this.activeExcess.maxSpeed) {
          this.activeExcess.maxSpeed = speedKmh;
        }
        return null;
      }
    } else if (this.activeExcess) {
      // Sous la limite : démarrer le compte à rebours de 10s
      if (!this.clearTimer) {
        this.clearTimer = setTimeout(() => {
          if (this.activeExcess) {
            const finished = { ...this.activeExcess, endTime: Date.now() };
            this.completedExcesses.push(finished);
            this.activeExcess = null;
            this.clearTimer = null;
          }
        }, THRESHOLDS.SPEEDING_CLEAR_DURATION_S * 1000);
      }
    }
    return null;
  }

  forceClose(timestamp) {
    if (this.clearTimer) { clearTimeout(this.clearTimer); this.clearTimer = null; }
    if (this.activeExcess) {
      const finished = { ...this.activeExcess, endTime: timestamp };
      this.completedExcesses.push(finished);
      this.activeExcess = null;
    }
  }

  destroy() {
    if (this.clearTimer) clearTimeout(this.clearTimer);
  }
}

// ─── Calcul des scores ────────────────────────────────────────────────────────

/**
 * Calcule le score global avec pondération dynamique.
 * hasRoundabouts / hasStops indiquent si ces éléments ont été rencontrés.
 * Si absent, leur poids est redistribué proportionnellement entre les autres catégories.
 * Catégories toujours présentes : speed (20%), smoothness (20%), attention (15%).
 */
export function computeOverallScore({
  anticipation_score,
  stop_score,
  speed_score,
  smoothness_score,
  distraction_penalty = 0,
  fatigue_penalty = 0,
  hasRoundabouts = true,
  hasStops = true,
}) {
  // Poids de base
  const BASE = {
    anticipation: hasRoundabouts ? 25 : 0,
    stop:         hasStops        ? 20 : 0,
    speed:        20,
    smoothness:   20,
    attention:    15,
  };

  const total = Object.values(BASE).reduce((s, w) => s + w, 0); // toujours 100

  const weights = {
    anticipation: BASE.anticipation / total,
    stop:         BASE.stop         / total,
    speed:        BASE.speed        / total,
    smoothness:   BASE.smoothness   / total,
    attention:    BASE.attention    / total,
  };

  const a = hasRoundabouts ? (anticipation_score ?? 100) : 0;
  const s = hasStops        ? (stop_score        ?? 100) : 0;
  const v = speed_score      ?? 100;
  const d = smoothness_score ?? 100;

  // Score attention = 100 moins les pénalités fatigue + distraction (plafonnées à 100)
  const attentionScore = Math.max(0, 100 - (distraction_penalty || 0) - (fatigue_penalty || 0));

  const raw = Math.round(
    a * weights.anticipation +
    s * weights.stop +
    v * weights.speed +
    d * weights.smoothness +
    attentionScore * weights.attention
  );

  return Math.min(100, Math.max(0, raw));
}

/**
 * Retourne les poids effectifs utilisés pour un trajet donné (pour l'affichage).
 */
export function computeScoreWeights({ hasRoundabouts = true, hasStops = true }) {
  const BASE = {
    anticipation: hasRoundabouts ? 25 : 0,
    stop:         hasStops        ? 20 : 0,
    speed:        20,
    smoothness:   20,
    attention:    15,
  };
  const total = Object.values(BASE).reduce((s, w) => s + w, 0);
  return {
    anticipation: Math.round(BASE.anticipation / total * 100),
    stop:         Math.round(BASE.stop         / total * 100),
    speed:        Math.round(BASE.speed        / total * 100),
    smoothness:   Math.round(BASE.smoothness   / total * 100),
    attention:    Math.round(BASE.attention    / total * 100),
  };
}

export function computeAnticipationScore(roundaboutEvents) {
  if (!roundaboutEvents || roundaboutEvents.length === 0) return 100;
  // Nouvelle logique : moyenne des scores individuels de chaque rond-point
  const scores = roundaboutEvents.map(e => {
    if (e.roundabout_detail?.roundabout_score != null) return e.roundabout_detail.roundabout_score;
    // Fallback legacy (anciens trajets sans roundabout_score)
    const legacyMap = { perfect: 100, very_good: 90, good: 75, late: 50, dangerous: 30, unknown: 70 };
    return legacyMap[e.roundabout_detail?.rating] ?? 70;
  });
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function computeStopScore(stopEvents) {
  if (!stopEvents || stopEvents.length === 0) return 100;
  const ratingScores = { respected: 100, glisse: 30, dangerous: 0 };
  const scores = stopEvents
    .filter(e => e.stop_detail?.rating)
    .map(e => ratingScores[e.stop_detail.rating] ?? 50);
  if (scores.length === 0) return 100;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Score vitesse basé sur la distance pondérée en infraction.
 * Utilise les events de type 'speeding' (avec speed_kmh et speed_limit_kmh) pour estimer.
 * @param {Array} speedingEvents - événements de type 'speeding'
 * @param {number} totalDistanceKm
 * @returns {number} score 0-100
 */
export function computeSpeedScore(speedingEvents, totalDistanceKm) {
  if (!speedingEvents || speedingEvents.length === 0) return 100;

  const TOLERANCE = 6;
  const dist = Math.max(totalDistanceKm, 0.1);

  // Estimer la distance pondérée en infraction à partir des events
  // (chaque event représente ~0.3km d'infraction en moyenne, pondéré par sévérité)
  const severityCoeff = (event) => {
    const rawOver = (event.speed_kmh || 0) - (event.speed_limit_kmh || 50);
    if (rawOver >= 50) return 3;
    if (rawOver >= 40) return 2.5;
    if (rawOver >= 30) return 2;
    if (rawOver >= 20) return 1.5;
    return 1;
  };

  let weightedInfractionKm = 0;
  let hasExcess40_50 = false;
  let hasExcess50plus = false;

  for (const e of speedingEvents) {
    const rawOver = (e.speed_kmh || 0) - (e.speed_limit_kmh || 50);
    if (rawOver <= TOLERANCE) continue;
    const coeff = severityCoeff(e);
    // Approximation : chaque excès ≈ 0.3 km pondéré
    weightedInfractionKm += 0.3 * coeff;
    if (rawOver >= 50) hasExcess50plus = true;
    else if (rawOver >= 40) hasExcess40_50 = true;
  }

  const pctRespected = Math.max(0, Math.min(100, (1 - weightedInfractionKm / dist) * 100));

  let score;
  if (pctRespected >= 100) score = 100;
  else if (pctRespected >= 95) score = Math.round(90 + (pctRespected - 95) * 2);
  else if (pctRespected >= 90) score = Math.round(80 + (pctRespected - 90) * 2);
  else if (pctRespected >= 80) score = Math.round(65 + (pctRespected - 80) * 1.4);
  else if (pctRespected >= 70) score = Math.round(50 + (pctRespected - 70) * 1.5);
  else score = Math.round(Math.max(0, (pctRespected / 70) * 50));

  if (hasExcess50plus) score = Math.min(score, 55);
  else if (hasExcess40_50) score = Math.min(score, 70);

  return Math.max(0, Math.min(100, score));
}

export function computeSmoothnessScore(harshBrakingCount, harshAccelCount, totalDistanceKm) {
  const total = (harshBrakingCount || 0) + (harshAccelCount || 0);
  if (total === 0) return 100;
  const ratio = total / Math.max(totalDistanceKm, 1);
  return Math.max(0, Math.round(100 - ratio * 50));
}

// ─── Détection automatique démarrage/arrêt ────────────────────────────────────

export class TripAutoDetector {
  constructor(onStart, onStop) {
    this.onStart = onStart;
    this.onStop = onStop;
    this.speedBuffer = [];
    this.slowBuffer = [];
    this.tripStarted = false;
  }

  addPoint(speedKmh, timestamp = Date.now()) {
    if (!this.tripStarted) {
      if (speedKmh >= THRESHOLDS.AUTO_START_SPEED_KMH) {
        this.speedBuffer.push(timestamp);
        this.speedBuffer = this.speedBuffer.filter(t => timestamp - t <= THRESHOLDS.AUTO_START_DURATION_MS + 2000);
        if (this.speedBuffer.length > 0) {
          const duration = timestamp - this.speedBuffer[0];
          if (duration >= THRESHOLDS.AUTO_START_DURATION_MS) {
            this.tripStarted = true;
            this.slowBuffer = [];
            this.onStart(timestamp);
          }
        }
      } else {
        this.speedBuffer = [];
      }
    } else {
      if (speedKmh < THRESHOLDS.AUTO_STOP_SPEED_KMH) {
        this.slowBuffer.push(timestamp);
        this.slowBuffer = this.slowBuffer.filter(t => timestamp - t <= THRESHOLDS.AUTO_STOP_DURATION_MS + 5000);
        if (this.slowBuffer.length > 0) {
          const duration = timestamp - this.slowBuffer[0];
          if (duration >= THRESHOLDS.AUTO_STOP_DURATION_MS) {
            this.tripStarted = false;
            this.slowBuffer = [];
            this.onStop(timestamp);
          }
        }
      } else {
        this.slowBuffer = [];
      }
    }
  }

  reset() {
    this.speedBuffer = [];
    this.slowBuffer = [];
    this.tripStarted = false;
  }
}

// ─── Cap et alignement directionnel ──────────────────────────────────────────

/**
 * Calcule le cap (bearing) en degrés (0-360) entre deux points GPS.
 */
export function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Angle absolu entre deux caps (0-180°).
 */
export function angleBetweenBearings(b1, b2) {
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// ─── Formateurs d'affichage ───────────────────────────────────────────────────

export function formatRoundaboutRating(rating) {
  const labels = {
    perfect: { text: 'Parfait', color: 'text-primary', emoji: '⭐' },
    very_good: { text: 'Très bien', color: 'text-primary', emoji: '✅' },
    good: { text: 'Bien', color: 'text-primary', emoji: '✅' },
    late: { text: 'Anticipation tardive', color: 'text-orange-400', emoji: '⚠️' },
    dangerous: { text: 'Dangereux', color: 'text-red-400', emoji: '🚨' },
    unknown: { text: 'Non analysé', color: 'text-muted-foreground', emoji: '?' },
  };
  return labels[rating] || labels.unknown;
}

export function formatStopRating(rating) {
  const labels = {
    respected: { text: 'STOP respecté', color: 'text-primary', emoji: '✅' },
    glisse: { text: 'Stop glissé', color: 'text-orange-400', emoji: '⚠️' },
    dangerous: { text: 'Non respecté', color: 'text-red-400', emoji: '🚨' },
    unknown: { text: 'Non analysé', color: 'text-muted-foreground', emoji: '?' },
  };
  return labels[rating] || labels.unknown;
}

export function formatConfidence(confidence) {
  const labels = {
    high: { text: 'Élevé', color: 'text-primary' },
    medium: { text: 'Moyen', color: 'text-yellow-400' },
    low: { text: 'Faible', color: 'text-orange-400' },
    insufficient_data: { text: 'Données insuffisantes', color: 'text-muted-foreground' },
  };
  return labels[confidence] || labels.medium;
}

/**
 * Couleur de tracé GPS selon vitesse vs limite (tolérance +6 km/h)
 */
export function getSpeedColor(speedKmh, limitKmh) {
  if (!limitKmh) return '#C8F230';
  if (speedKmh > limitKmh + THRESHOLDS.SPEEDING_TOLERANCE_KMH) return '#ef4444';
  if (speedKmh > limitKmh) return '#F2C230';
  return '#C8F230';
}

/**
 * Génère un texte explicatif pour un rond-point
 */
export function getRoundaboutExplanation(detail) {
  if (!detail) return '';
  const {
    anticipation_zone, decel_start_dist, progressive_decel, speed_at_150m, speed_at_entry,
    progress_penalty, speed_limit_penalty, entry_speed_penalty, roundabout_score, max_excess_last100m,
  } = detail;

  let parts = [];

  if (decel_start_dist != null) {
    parts.push(`Décélération amorcée à ${decel_start_dist} m.`);
  }
  if (speed_at_150m != null && speed_at_entry != null) {
    parts.push(`Vitesse : ${speed_at_150m} km/h à 150 m → ${speed_at_entry} km/h à l'entrée.`);
  }

  if (anticipation_zone === 'zone1') {
    parts.push(progressive_decel
      ? "Anticipation excellente : décélération progressive dès 150–100 m."
      : "Bonne zone d'anticipation, mais la décélération n'était pas totalement progressive.");
  } else if (anticipation_zone === 'zone2') {
    parts.push("Anticipation correcte : décélération débutée entre 100 et 60 m.");
  } else if (anticipation_zone === 'zone3') {
    parts.push("Anticipation insuffisante : freinage trop tardif (< 60 m du rond-point).");
  }

  if (!progressive_decel && (progress_penalty ?? 0) > 0) {
    parts.push(`Décélération irrégulière ou freinage brusque détecté (-${progress_penalty} pts).`);
  }
  if ((max_excess_last100m ?? 0) > 0) {
    const msg = max_excess_last100m > 20
      ? `Excès de vitesse majeur dans les 100 derniers mètres (+${Math.round(max_excess_last100m)} km/h au-delà de la limite)`
      : max_excess_last100m > 10
        ? `Excès de vitesse modéré dans les 100 derniers mètres (+${Math.round(max_excess_last100m)} km/h)`
        : `Léger dépassement de la limitation dans les 100 derniers mètres`;
    parts.push(`${msg} (-${speed_limit_penalty} pts).`);
  }
  if ((entry_speed_penalty ?? 0) > 0) {
    parts.push(`Vitesse d'entrée trop élevée (${speed_at_entry} km/h, seuil : 34 km/h) (-${entry_speed_penalty} pts).`);
  }

  if (parts.length === 0) {
    const { rating } = detail;
    if (rating === 'perfect') return "Approche parfaite, vitesse bien maîtrisée.";
    if (rating === 'very_good') return "Très bonne approche du rond-point.";
    if (rating === 'good') return "Bonne approche du rond-point.";
    if (rating === 'late') return "Freinage tardif — à améliorer.";
    if (rating === 'dangerous') return "Approche dangereuse du rond-point.";
  }

  return parts.join(' ');
}

/**
 * Génère un texte explicatif pour un STOP
 */
export function getStopExplanation(detail) {
  if (!detail) return '';
  const spd = detail.min_speed_kmh != null ? Math.round(detail.min_speed_kmh) : '?';
  switch (detail.rating) {
    case 'respected': return `Arrêt complet à ${spd} km/h. Parfait !`;
    case 'glisse': return `Stop glissé à ${spd} km/h. Réduire davantage la vitesse.`;
    case 'dangerous': return `Stop non respecté : ${spd} km/h au panneau. Dangereux !`;
    default: return '';
  }
}