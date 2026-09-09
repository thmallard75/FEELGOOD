/**
 * FeelGood Conduite — Détecteur de fatigue
 * Module 1 : Durée de conduite, variations anormales, zigzag, conduite nocturne
 */

import { haversineDistance } from './gpsEngine';

// ─── Config ───────────────────────────────────────────────────────────────────

const FATIGUE_CONFIG = {
  DRIVE_ALERT_MIN: 120,           // Alerte après 2h (120 min) de conduite continue
  NIGHT_DRIVE_ALERT_MIN: 60,      // Alerte après 1h la nuit
  REPEAT_ALERT_MIN: 30,           // Répéter alerte toutes les 30 min
  PAUSE_THRESHOLD_KMH: 5,         // < 5 km/h = pause
  PAUSE_DURATION_MS: 5 * 60000,   // 5 min consécutives < 5 km/h = pause validée
  NIGHT_START: 22,                // 22h
  NIGHT_END: 6,                   // 6h
  SPEED_VAR_WINDOW_MS: 5 * 60000, // Fenêtre glissante 5 min
  SPEED_VAR_THRESHOLD: 15,        // Variation de 15 km/h
  SPEED_VAR_INTERVAL_MS: 10000,   // En moins de 10 secondes
  SPEED_VAR_COUNT: 3,             // Plus de 3 fois en 5 min
  ZIGZAG_DIST_M: 200,             // Distance entre deux points pour mesurer déviation
  ZIGZAG_DEVIATION_M: 15,         // Déviation > 15m = micro-correction
  ZIGZAG_COUNT: 4,                // 4 micro-corrections en 5 min
};

export class FatigueDetector {
  constructor() {
    this.reset();
  }

  reset() {
    this.drivingStartTime = null;         // Début de la conduite active (après pause)
    this.pauseBuffer = [];                // Buffer de points lents pour détecter pause
    this.isPausing = false;
    this.pauseStart = null;
    this.lastAlertTime = null;
    this.alertCount = 0;

    // Signes comportementaux
    this.speedPoints = [];                // { speed, timestamp } pour 5 min glissantes
    this.speedVarEvents = [];             // Variations détectées
    this.gpsPoints = [];                  // Points GPS pour zigzag (5 min)

    // Alertes émises
    this.alerts = [];                     // { type, timestamp, message }
  }

  /**
   * Appelé à chaque point GPS
   * @returns {{ alert?: object, nightMode: boolean }} 
   */
  update(speedKmh, lat, lng, timestamp, nearElement) {
    const now = timestamp || Date.now();
    const hour = new Date(now).getHours();
    const isNight = hour >= FATIGUE_CONFIG.NIGHT_START || hour < FATIGUE_CONFIG.NIGHT_END;
    const limitMin = isNight ? FATIGUE_CONFIG.NIGHT_DRIVE_ALERT_MIN : FATIGUE_CONFIG.DRIVE_ALERT_MIN;

    // ─── Gestion pauses ──────────────────────────────────────────────────────
    if (speedKmh < FATIGUE_CONFIG.PAUSE_THRESHOLD_KMH) {
      if (!this.isPausing) {
        this.isPausing = true;
        this.pauseStart = now;
      } else if (now - this.pauseStart >= FATIGUE_CONFIG.PAUSE_DURATION_MS) {
        // Pause validée → remettre le compteur de conduite à zéro
        this.drivingStartTime = null;
        this.lastAlertTime = null;
      }
    } else {
      this.isPausing = false;
      this.pauseStart = null;
      if (!this.drivingStartTime) {
        this.drivingStartTime = now;
      }
    }

    let alert = null;

    // ─── Alerte durée ─────────────────────────────────────────────────────────
    if (this.drivingStartTime && speedKmh >= FATIGUE_CONFIG.PAUSE_THRESHOLD_KMH) {
      const drivingMin = (now - this.drivingStartTime) / 60000;
      const shouldAlert = drivingMin >= limitMin;
      const repeatOk = !this.lastAlertTime || (now - this.lastAlertTime) >= FATIGUE_CONFIG.REPEAT_ALERT_MIN * 60000;

      if (shouldAlert && repeatOk) {
        this.lastAlertTime = now;
        this.alertCount++;
        const msg = isNight
          ? `🌙 Tu conduis depuis ${Math.round(drivingMin)} min de nuit. Pause fortement recommandée !`
          : `⚠️ Tu conduis depuis ${Math.round(drivingMin / 60 * 10) / 10}h. Une pause s'impose !`;
        alert = { type: 'duration', message: msg, timestamp: now, isNight };
        this.alerts.push(alert);
      }
    }

    // ─── Signe 1 : Variations de vitesse anormales ────────────────────────────
    // Seulement si pas à proximité d'un élément routier
    if (!nearElement && speedKmh > 10) {
      this.speedPoints.push({ speed: speedKmh, timestamp: now });
      // Purger les points hors fenêtre 5 min
      this.speedPoints = this.speedPoints.filter(p => now - p.timestamp <= FATIGUE_CONFIG.SPEED_VAR_WINDOW_MS);

      // Chercher des variations brutales dans un intervalle de 10s
      let varCount = 0;
      for (let i = 1; i < this.speedPoints.length; i++) {
        const dt = this.speedPoints[i].timestamp - this.speedPoints[i - 1].timestamp;
        const dv = Math.abs(this.speedPoints[i].speed - this.speedPoints[i - 1].speed);
        if (dt <= FATIGUE_CONFIG.SPEED_VAR_INTERVAL_MS && dv >= FATIGUE_CONFIG.SPEED_VAR_THRESHOLD) {
          varCount++;
        }
      }

      if (varCount > FATIGUE_CONFIG.SPEED_VAR_COUNT && !alert) {
        const lastSpeedAlert = this.alerts.find(a => a.type === 'speed_variation');
        const tooSoon = lastSpeedAlert && (now - lastSpeedAlert.timestamp) < 5 * 60000;
        if (!tooSoon) {
          alert = {
            type: 'speed_variation',
            message: '⚠️ Variations de vitesse anormales détectées — signe de fatigue ?',
            timestamp: now,
            isNight,
          };
          this.alerts.push(alert);
          this.alertCount++;
        }
      }
    }

    // ─── Signe 2 : Zigzag (déviation de trajectoire) ─────────────────────────
    this.gpsPoints.push({ lat, lng, timestamp: now });
    this.gpsPoints = this.gpsPoints.filter(p => now - p.timestamp <= FATIGUE_CONFIG.SPEED_VAR_WINDOW_MS);

    let zigzagCount = 0;
    for (let i = 0; i + 1 < this.gpsPoints.length; i++) {
      const p1 = this.gpsPoints[i];
      const p2 = this.gpsPoints[i + 1];
      const lineDist = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      // Chercher un point de référence à ~200m
      if (lineDist >= FATIGUE_CONFIG.ZIGZAG_DIST_M) {
        // Calculer déviation des points intermédiaires par rapport à la ligne droite p1→p2
        const intermediates = this.gpsPoints.slice(i + 1).filter(p =>
          p.timestamp > p1.timestamp && p.timestamp < p2.timestamp
        );
        for (const pm of intermediates) {
          const dev = pointToLineDeviation(p1, p2, pm);
          if (dev > FATIGUE_CONFIG.ZIGZAG_DEVIATION_M) zigzagCount++;
        }
        break;
      }
    }

    if (zigzagCount >= FATIGUE_CONFIG.ZIGZAG_COUNT && !alert) {
      const lastZigzag = this.alerts.find(a => a.type === 'zigzag');
      const tooSoon = lastZigzag && (now - lastZigzag.timestamp) < 5 * 60000;
      if (!tooSoon) {
        alert = {
          type: 'zigzag',
          message: '⚠️ Trajectoire instable détectée — signe de fatigue ou distraction ?',
          timestamp: now,
          isNight,
        };
        this.alerts.push(alert);
        this.alertCount++;
      }
    }

    return { alert, isNight };
  }

  getDrivingMinutes(now = Date.now()) {
    if (!this.drivingStartTime) return 0;
    return Math.round((now - this.drivingStartTime) / 60000);
  }

  getFatigueScorePenalty() {
    if (this.alertCount === 0) return 0;
    if (this.alertCount === 1) return 5;
    return 10;
  }

  getSummary() {
    return {
      alertCount: this.alertCount,
      alerts: this.alerts,
      scorePenalty: this.getFatigueScorePenalty(),
      hasFatigueMention: this.alertCount >= 2,
    };
  }
}

// Distance d'un point à une droite (en mètres)
function pointToLineDeviation(p1, p2, pm) {
  // Utilisation de la formule de l'aire du triangle / base
  const A = haversineDistance(p1.lat, p1.lng, pm.lat, pm.lng);
  const B = haversineDistance(p2.lat, p2.lng, pm.lat, pm.lng);
  const C = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
  if (C === 0) return 0;
  // Formule de Héron pour la hauteur
  const s = (A + B + C) / 2;
  const area2 = Math.max(0, s * (s - A) * (s - B) * (s - C));
  const area = Math.sqrt(area2);
  return (2 * area) / C;
}