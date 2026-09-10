// Interprétation des signaux bruts de distraction (visibility + touch)
// captés côté frontend, combinés à la trace GPS pour la vitesse.
// Port backend de src/lib/distractionDetector.js (interprétation uniquement).

const DISTRACTION_CONFIG = {
  MIN_SPEED_KMH: 30,
  MIN_SPEED_SERIOUS_KMH: 50,
  MIN_SPEED_IGNORE_KMH: 5,
  BG_MIN_DURATION_MS: 8000,
  TOUCH_MIN_DURATION_MS: 3000,
};

export interface DistractionSignal {
  type: 'bg_start' | 'bg_end' | 'touch_start' | 'touch_end';
  t: number; // ms epoch
}

export interface DistractionEvent {
  type: 'phone_background' | 'phone_touch';
  duration_ms: number;
  duration_sec: number;
  speed_kmh: number;
  severity: 'medium' | 'high';
  timestamp: string;
  description: string;
  is_high_speed: boolean;
  latitude: number;
  longitude: number;
}

export interface DistractionSummary {
  count: number;
  events: DistractionEvent[];
  hasHighSpeed: boolean;
  scorePenalty: number;
  hasRedAlert: boolean;
}

export interface PhoneDrivingEvent {
  event_type: 'phone_usage';
  severity: 'medium' | 'high';
  latitude: number;
  longitude: number;
  speed_kmh: number;
  timestamp: string;
  description: string;
  confidence: 'high';
}

export interface DistractionResult {
  events: PhoneDrivingEvent[]; // pour persistance DrivingEvent
  summary: DistractionSummary;
  phoneUsageSeconds: number;
}

function speedAndPosAt(gpsTrack: any[], tMs: number): { speed: number; lat: number; lng: number } {
  let best: any = null;
  let bestDiff = Infinity;
  for (const p of gpsTrack) {
    const pt = typeof p.timestamp === 'number' ? p.timestamp : new Date(p.timestamp).getTime();
    if (isNaN(pt)) continue;
    const diff = Math.abs(pt - tMs);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  if (!best) return { speed: 0, lat: 0, lng: 0 };
  return { speed: best.speed_kmh || 0, lat: best.lat, lng: best.lng };
}

export function computeDistractionSummary(signals: DistractionSignal[] | null | undefined, gpsTrack: any[]): DistractionResult {
  const events: DistractionEvent[] = [];
  if (!signals || !signals.length) {
    return { events: [], summary: { count: 0, events: [], hasHighSpeed: false, scorePenalty: 0, hasRedAlert: false }, phoneUsageSeconds: 0 };
  }

  const sorted = [...signals].sort((a, b) => a.t - b.t);
  const tripEnd = gpsTrack.length
    ? (typeof gpsTrack[gpsTrack.length - 1].timestamp === 'number' ? gpsTrack[gpsTrack.length - 1].timestamp : new Date(gpsTrack[gpsTrack.length - 1].timestamp).getTime())
    : sorted[sorted.length - 1].t;

  let bgStart: number | null = null;
  let touchStart: number | null = null;

  const closeBg = (endT: number) => {
    if (bgStart == null) return;
    const dur = endT - bgStart;
    const { speed, lat, lng } = speedAndPosAt(gpsTrack, bgStart);
    if (dur >= DISTRACTION_CONFIG.BG_MIN_DURATION_MS && speed >= DISTRACTION_CONFIG.MIN_SPEED_KMH) {
      recordEvent('phone_background', dur, bgStart, speed, lat, lng, events);
    }
    bgStart = null;
  };
  const closeTouch = (endT: number) => {
    if (touchStart == null) return;
    const dur = endT - touchStart;
    const { speed, lat, lng } = speedAndPosAt(gpsTrack, touchStart);
    if (dur >= DISTRACTION_CONFIG.TOUCH_MIN_DURATION_MS && speed >= DISTRACTION_CONFIG.MIN_SPEED_KMH) {
      recordEvent('phone_touch', dur, touchStart, speed, lat, lng, events);
    }
    touchStart = null;
  };

  for (const s of sorted) {
    if (s.type === 'bg_start') { bgStart = s.t; }
    else if (s.type === 'bg_end') { closeBg(s.t); }
    else if (s.type === 'touch_start') { touchStart = s.t; }
    else if (s.type === 'touch_end') { closeTouch(s.t); }
  }
  closeBg(tripEnd);
  closeTouch(tripEnd);

  // Résumé
  const hasSerious = events.some((e) => e.severity === 'high');
  const count = events.length;
  let scorePenalty = 0;
  if (count >= 2) scorePenalty = 15;
  else if (hasSerious) scorePenalty = 10;
  else if (count === 1) scorePenalty = 5;

  const summary: DistractionSummary = {
    count,
    events,
    hasHighSpeed: events.some((e) => e.is_high_speed),
    scorePenalty,
    hasRedAlert: count >= 2,
  };

  const phoneUsageSeconds = Math.round(events.reduce((s, e) => s + (e.duration_sec || 0), 0));
  const drivingEvents: PhoneDrivingEvent[] = events.map((e) => ({
    event_type: 'phone_usage' as const,
    severity: e.severity,
    latitude: e.latitude,
    longitude: e.longitude,
    speed_kmh: e.speed_kmh,
    timestamp: e.timestamp,
    description: e.description,
    confidence: 'high' as const,
  }));

  return { events: drivingEvents, summary, phoneUsageSeconds };
}

function recordEvent(
  type: 'phone_background' | 'phone_touch',
  durationMs: number,
  startMs: number,
  speed: number,
  lat: number,
  lng: number,
  out: DistractionEvent[],
) {
  const isSerious = speed >= DISTRACTION_CONFIG.MIN_SPEED_SERIOUS_KMH || durationMs > 15000;
  const durationSec = Math.round(durationMs / 1000);
  out.push({
    type,
    duration_ms: durationMs,
    duration_sec: durationSec,
    speed_kmh: Math.round(speed),
    severity: isSerious ? 'high' : 'medium',
    timestamp: new Date(startMs).toISOString(),
    description: type === 'phone_background'
      ? `App en arrière-plan ${durationSec}s à ${Math.round(speed)} km/h`
      : `Interaction écran ${durationSec}s à ${Math.round(speed)} km/h`,
    is_high_speed: speed >= DISTRACTION_CONFIG.MIN_SPEED_SERIOUS_KMH,
    latitude: lat,
    longitude: lng,
  });
}