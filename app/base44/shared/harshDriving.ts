// Détection freinage / accélération brusque à partir de la trace GPS filtrée.
// Port backend de la logique qui vivait côté front (tripRecorder + gpsEngine).

const HARSH_BRAKING_G = 0.3;
const HARSH_ACCEL_G = 0.3;

export function calcAcceleration(speed1Kmh: number, speed2Kmh: number, dtMs: number): number {
  const dv = (speed2Kmh - speed1Kmh) / 3.6; // m/s
  const dt = dtMs / 1000; // s
  if (dt <= 0) return 0;
  return dv / dt; // m/s²
}

function tsMs(p: { timestamp: string | number }): number {
  if (typeof p.timestamp === 'number') return p.timestamp;
  return new Date(p.timestamp).getTime();
}

export interface HarshEvent {
  event_type: 'harsh_braking' | 'harsh_acceleration';
  severity: 'low' | 'medium' | 'high';
  latitude: number;
  longitude: number;
  speed_kmh: number;
  timestamp: string;
  acceleration_value: number;
  description: string;
  confidence: 'high';
}

export interface HarshResult {
  events: HarshEvent[];
  harshBrakingCount: number;
  harshAccelCount: number;
}

export function detectHarshDriving(gpsTrack: any[]): HarshResult {
  const events: HarshEvent[] = [];
  let harshBrakingCount = 0;
  let harshAccelCount = 0;

  for (let i = 1; i < gpsTrack.length; i++) {
    const p = gpsTrack[i - 1];
    const q = gpsTrack[i];
    if (!p || !q) continue;
    if (p.low_precision || q.low_precision) continue;

    const dtMs = tsMs(q) - tsMs(p);
    if (dtMs <= 500 || dtMs >= 10000) continue;

    const accel = calcAcceleration(p.speed_kmh, q.speed_kmh, dtMs);
    const accelG = Math.abs(accel) / 9.81;
    const tsIso = typeof q.timestamp === 'string' ? q.timestamp : new Date(q.timestamp).toISOString();

    if (accel < 0 && accelG > HARSH_BRAKING_G) {
      harshBrakingCount++;
      events.push({
        event_type: 'harsh_braking',
        severity: accelG > 0.5 ? 'high' : 'medium',
        latitude: q.lat,
        longitude: q.lng,
        speed_kmh: q.speed_kmh,
        timestamp: tsIso,
        acceleration_value: Math.round(accel * 100) / 100,
        description: `Freinage brusque (${Math.round(accelG * 10) / 10}g)`,
        confidence: 'high',
      });
    } else if (accel > 0 && accelG > HARSH_ACCEL_G) {
      harshAccelCount++;
      events.push({
        event_type: 'harsh_acceleration',
        severity: accelG > 0.5 ? 'high' : 'medium',
        latitude: q.lat,
        longitude: q.lng,
        speed_kmh: q.speed_kmh,
        timestamp: tsIso,
        acceleration_value: Math.round(accel * 100) / 100,
        description: `Accélération brusque (${Math.round(accelG * 10) / 10}g)`,
        confidence: 'high',
      });
    }
  }

  return { events, harshBrakingCount, harshAccelCount };
}