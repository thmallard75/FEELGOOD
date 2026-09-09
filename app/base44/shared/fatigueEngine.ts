// Détection de fatigue à partir de la trace GPS filtrée.
// Port backend de src/lib/fatigueDetector.js (logique inchangée).

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const CFG = {
  DRIVE_ALERT_MIN: 120,
  NIGHT_DRIVE_ALERT_MIN: 60,
  REPEAT_ALERT_MIN: 30,
  PAUSE_THRESHOLD_KMH: 5,
  PAUSE_DURATION_MS: 5 * 60000,
  NIGHT_START: 22,
  NIGHT_END: 6,
  SPEED_VAR_WINDOW_MS: 5 * 60000,
  SPEED_VAR_THRESHOLD: 15,
  SPEED_VAR_INTERVAL_MS: 10000,
  SPEED_VAR_COUNT: 3,
  ZIGZAG_DIST_M: 200,
  ZIGZAG_DEVIATION_M: 15,
  ZIGZAG_COUNT: 4,
};

interface FatigueAlert {
  type: string;
  message: string;
  timestamp: number;
  isNight: boolean;
}

export interface FatigueSummary {
  alertCount: number;
  alerts: FatigueAlert[];
  scorePenalty: number;
  hasFatigueMention: boolean;
}

function pointToLineDeviation(p1: any, p2: any, pm: any): number {
  const A = haversine(p1.lat, p1.lng, pm.lat, pm.lng);
  const B = haversine(p2.lat, p2.lng, pm.lat, pm.lng);
  const C = haversine(p1.lat, p1.lng, p2.lat, p2.lng);
  if (C === 0) return 0;
  const s = (A + B + C) / 2;
  const area2 = Math.max(0, s * (s - A) * (s - B) * (s - C));
  const area = Math.sqrt(area2);
  return (2 * area) / C;
}

export function computeFatigueSummary(gpsTrack: any[]): FatigueSummary {
  const alerts: FatigueAlert[] = [];

  let drivingStartTime: number | null = null;
  let isPausing = false;
  let pauseStart: number | null = null;
  let lastAlertTime: number | null = null;

  const speedPoints: { speed: number; timestamp: number }[] = [];
  const gpsPoints: { lat: number; lng: number; timestamp: number }[] = [];

  const pts = gpsTrack
    .map((p) => ({ speed: p.speed_kmh, lat: p.lat, lng: p.lng, t: typeof p.timestamp === 'number' ? p.timestamp : new Date(p.timestamp).getTime() }))
    .filter((p) => p.t && !isNaN(p.t))
    .sort((a, b) => a.t - b.t);

  for (const pt of pts) {
    const now = pt.t;
    const hour = new Date(now).getHours();
    const isNight = hour >= CFG.NIGHT_START || hour < CFG.NIGHT_END;
    const limitMin = isNight ? CFG.NIGHT_DRIVE_ALERT_MIN : CFG.DRIVE_ALERT_MIN;
    const speedKmh = pt.speed;

    // Gestion pauses
    if (speedKmh < CFG.PAUSE_THRESHOLD_KMH) {
      if (!isPausing) { isPausing = true; pauseStart = now; }
      else if (pauseStart != null && now - pauseStart >= CFG.PAUSE_DURATION_MS) {
        drivingStartTime = null;
        lastAlertTime = null;
      }
    } else {
      isPausing = false;
      pauseStart = null;
      if (drivingStartTime == null) drivingStartTime = now;
    }

    let alert: FatigueAlert | null = null;

    // Alerte durée
    if (drivingStartTime != null && speedKmh >= CFG.PAUSE_THRESHOLD_KMH) {
      const drivingMin = (now - drivingStartTime) / 60000;
      const shouldAlert = drivingMin >= limitMin;
      const repeatOk = lastAlertTime == null || (now - lastAlertTime) >= CFG.REPEAT_ALERT_MIN * 60000;
      if (shouldAlert && repeatOk) {
        lastAlertTime = now;
        const msg = isNight
          ? `🌙 Tu conduis depuis ${Math.round(drivingMin)} min de nuit. Pause fortement recommandée !`
          : `⚠️ Tu conduis depuis ${Math.round(drivingMin / 60 * 10) / 10}h. Une pause s'impose !`;
        alert = { type: 'duration', message: msg, timestamp: now, isNight };
        alerts.push(alert);
      }
    }

    // Variations de vitesse anormales (nearElement toujours false en backend)
    if (speedKmh > 10) {
      speedPoints.push({ speed: speedKmh, timestamp: now });
      while (speedPoints.length && now - speedPoints[0].timestamp > CFG.SPEED_VAR_WINDOW_MS) speedPoints.shift();

      let varCount = 0;
      for (let i = 1; i < speedPoints.length; i++) {
        const dt = speedPoints[i].timestamp - speedPoints[i - 1].timestamp;
        const dv = Math.abs(speedPoints[i].speed - speedPoints[i - 1].speed);
        if (dt <= CFG.SPEED_VAR_INTERVAL_MS && dv >= CFG.SPEED_VAR_THRESHOLD) varCount++;
      }
      if (varCount > CFG.SPEED_VAR_COUNT && !alert) {
        const lastSpeedAlert = alerts.find((a) => a.type === 'speed_variation');
        const tooSoon = lastSpeedAlert != null && now - lastSpeedAlert.timestamp < 5 * 60000;
        if (!tooSoon) {
          alert = { type: 'speed_variation', message: '⚠️ Variations de vitesse anormales détectées — signe de fatigue ?', timestamp: now, isNight };
          alerts.push(alert);
        }
      }
    }

    // Zigzag
    gpsPoints.push({ lat: pt.lat, lng: pt.lng, timestamp: now });
    while (gpsPoints.length && now - gpsPoints[0].timestamp > CFG.SPEED_VAR_WINDOW_MS) gpsPoints.shift();

    let zigzagCount = 0;
    for (let i = 0; i + 1 < gpsPoints.length; i++) {
      const p1 = gpsPoints[i];
      const p2 = gpsPoints[i + 1];
      const lineDist = haversine(p1.lat, p1.lng, p2.lat, p2.lng);
      if (lineDist >= CFG.ZIGZAG_DIST_M) {
        const intermediates = gpsPoints.slice(i + 1).filter((p) => p.timestamp > p1.timestamp && p.timestamp < p2.timestamp);
        for (const pm of intermediates) {
          if (pointToLineDeviation(p1, p2, pm) > CFG.ZIGZAG_DEVIATION_M) zigzagCount++;
        }
        break;
      }
    }
    if (zigzagCount >= CFG.ZIGZAG_COUNT && !alert) {
      const lastZigzag = alerts.find((a) => a.type === 'zigzag');
      const tooSoon = lastZigzag != null && now - lastZigzag.timestamp < 5 * 60000;
      if (!tooSoon) {
        alert = { type: 'zigzag', message: '⚠️ Trajectoire instable détectée — signe de fatigue ou distraction ?', timestamp: now, isNight };
        alerts.push(alert);
      }
    }
  }

  const alertCount = alerts.length;
  const scorePenalty = alertCount === 0 ? 0 : alertCount === 1 ? 5 : 10;
  return {
    alertCount,
    alerts,
    scorePenalty,
    hasFatigueMention: alertCount >= 2,
  };
}