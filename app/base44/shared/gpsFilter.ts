// Pré-traitement GPS : rejet des points aberrants, lissage léger, score de confiance.
import { haversine } from './osmCore.ts';

const ACCURACY_THRESHOLD = 25; // m — au-delà, point peu fiable
const ACCURACY_SMOOTH = 15;     // m — au-delà, on lisse légèrement la position

/**
 * Filtre et nettoie une trace GPS brute.
 * @returns {{ track: Array, confidence: number, dropped: number }}
 */
export function filterGpsTrack(rawTrack) {
  if (!rawTrack || rawTrack.length === 0) return { track: [], confidence: 0, dropped: 0 };

  const kept = [];
  let droppedCount = 0;

  for (let i = 0; i < rawTrack.length; i++) {
    const p = rawTrack[i];
    let lowPrec = !!p.low_precision || (p.accuracy_m != null && p.accuracy_m > ACCURACY_THRESHOLD);

    // Détection d'outlier : point très éloigné de ses deux voisins alors que ceux-ci sont proches
    if (i > 0 && i < rawTrack.length - 1 && !lowPrec) {
      const prev = rawTrack[i - 1];
      const next = rawTrack[i + 1];
      const dPrev = haversine(prev.lat, prev.lng, p.lat, p.lng);
      const dNext = haversine(next.lat, next.lng, p.lat, p.lng);
      const dPrevNext = haversine(prev.lat, prev.lng, next.lat, next.lng);
      if (dPrevNext < 60 && dPrev > 120 && dNext > 120) {
        lowPrec = true;
      }
    }

    if (lowPrec) {
      droppedCount++;
    } else {
      kept.push(p);
    }
  }

  // Lissage léger des positions peu précises : blend avec le point précédent lissé
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    const p = kept[i];
    if (i > 0 && (p.accuracy_m ?? 5) > ACCURACY_SMOOTH) {
      const prev = out[i - 1];
      const alpha = 0.5;
      out.push({ ...p, lat: p.lat * (1 - alpha) + prev.lat * alpha, lng: p.lng * (1 - alpha) + prev.lng * alpha, low_precision: false });
    } else {
      out.push({ ...p, low_precision: false });
    }
  }

  // Confiance globale : ratio de points conservés * score de précision moyenne
  const keptRatio = out.length / rawTrack.length;
  const accs = out.map(p => p.accuracy_m ?? 10).filter(a => a > 0);
  const avgAcc = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 10;
  const accScore = Math.max(0.3, Math.min(1, 1 - avgAcc / 40));
  const confidence = Math.round(keptRatio * accScore * 100) / 100;

  return { track: out, confidence, dropped: droppedCount };
}