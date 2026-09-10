/**
 * Calcule les statistiques agrégées (sans données individuelles ni localisations)
 * à synchroniser dans ParentLink — jamais d'accès direct aux Trip.
 */

import { startOfWeek, startOfMonth, subWeeks, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

/**
 * Calcule les stats agrégées à partir des trajets du jeune
 * et génère un message encourageant.
 */
export function computeParentStats(trips) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const completed = trips.filter(t => t.status === 'completed' && t.overall_score != null);

  const weekTrips = completed.filter(t => new Date(t.start_time) >= weekStart);
  const monthTrips = completed.filter(t => new Date(t.start_time) >= monthStart);

  const avg = (arr) => arr.length > 0
    ? Math.round(arr.reduce((s, t) => s + (t.overall_score || 0), 0) / arr.length)
    : null;

  const avgCat = (arr, key) => arr.length > 0
    ? Math.round(arr.filter(t => t[key] != null).reduce((s, t) => s + (t[key] || 0), 0) / arr.filter(t => t[key] != null).length)
    : null;

  // Tendance sur 6 semaines (sans heures ni lieux)
  const weekly_trend = [];
  for (let i = 5; i >= 0; i--) {
    const wStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const wEnd = startOfWeek(subWeeks(now, i - 1), { weekStartsOn: 1 });
    const wTrips = completed.filter(t => {
      const d = new Date(t.start_time);
      return d >= wStart && d < wEnd;
    });
    weekly_trend.push({
      week_label: format(wStart, 'dd MMM', { locale: fr }),
      score: avg(wTrips) ?? 0,
      trips: wTrips.length,
    });
  }

  // Alertes importantes (sans localisation, sans heure précise)
  const alerts = [];
  const recentTrips = completed.slice(0, 10);

  const fatigueTrips = recentTrips.filter(t => (t.fatigue_summary?.alertCount || 0) > 0);
  if (fatigueTrips.length >= 2) {
    alerts.push({
      type: 'fatigue',
      message: `Fatigue détectée sur ${fatigueTrips.length} trajets récents — encouragez des pauses`,
      date: fatigueTrips[0].start_time?.split('T')[0] || '',
    });
  }

  const phoneTrips = recentTrips.filter(t => (t.distraction_summary?.count || 0) > 0);
  if (phoneTrips.length >= 2) {
    alerts.push({
      type: 'phone',
      message: `Téléphone utilisé pendant ${phoneTrips.length} trajets récents`,
      date: phoneTrips[0].start_time?.split('T')[0] || '',
    });
  }

  const weekScore = avg(weekTrips);
  const monthScore = avg(monthTrips);

  // Scores catégorie sur le dernier mois
  const catBase = monthTrips.length > 0 ? monthTrips : completed.slice(0, 20);
  const category_scores = {
    anticipation: avgCat(catBase, 'anticipation_score'),
    stop: avgCat(catBase, 'stop_score'),
    speed: avgCat(catBase, 'speed_score'),
    smoothness: avgCat(catBase, 'smoothness_score'),
    attention: catBase.length > 0
      ? Math.round(catBase.reduce((s, t) => {
          const pen = (t.distraction_summary?.scorePenalty || 0) + (t.fatigue_summary?.scorePenalty || 0);
          return s + Math.max(0, 100 - pen);
        }, 0) / catBase.length)
      : null,
  };

  const encouraging_message = generateEncouraging(weekScore, monthScore, category_scores, weekTrips.length, alerts);

  return {
    weekly_score: weekScore,
    monthly_score: monthScore,
    total_km: Math.round(completed.reduce((s, t) => s + (t.distance_km || 0), 0) * 10) / 10,
    trips_count_week: weekTrips.length,
    trips_count_month: monthTrips.length,
    category_scores,
    weekly_trend,
    alerts,
    encouraging_message,
    last_sync: new Date().toISOString(),
  };
}

function generateEncouraging(weekScore, monthScore, cats, tripsCount, alerts) {
  if (tripsCount === 0) return "Aucun trajet cette semaine — la route est libre ! 🛣️";

  if (weekScore >= 90) return "Excellente semaine ! La conduite est vraiment exemplaire 🌟";
  if (weekScore >= 80) {
    const bestCat = getBestCat(cats);
    return `Bonne semaine ! ${bestCat ? `La ${bestCat} est particulièrement soignée` : 'Le score global est très bon'} 👍`;
  }
  if (weekScore >= 70) {
    const worst = getWorstCat(cats);
    return `Semaine correcte. ${worst ? `Un peu de travail sur ${worst} et ça sera top` : 'Continuez comme ça !'} 💪`;
  }
  if (weekScore != null) {
    return "La semaine a été difficile — rappelez-lui d'anticiper et d'être doux au volant 🙏";
  }
  return "En route pour une belle semaine de conduite ! 🚗";
}

function getBestCat(cats) {
  const labels = { anticipation: "l'anticipation", stop: "le respect des STOP", speed: "les vitesses", smoothness: "la douceur", attention: "la vigilance" };
  let best = null, bestScore = 0;
  for (const [k, v] of Object.entries(cats)) {
    if (v != null && v > bestScore) { bestScore = v; best = k; }
  }
  return best ? labels[best] : null;
}

function getWorstCat(cats) {
  const labels = { anticipation: "l'anticipation", stop: "les STOP", speed: "la vitesse", smoothness: "la douceur", attention: "l'attention" };
  let worst = null, worstScore = 101;
  for (const [k, v] of Object.entries(cats)) {
    if (v != null && v < worstScore) { worstScore = v; worst = k; }
  }
  return worst ? labels[worst] : null;
}

/**
 * Synchronise les stats du jeune vers le ParentLink (appelé côté jeune uniquement).
 * Ne transmet JAMAIS de données individuelles de trajet.
 */
export async function syncParentStats(parentLinkId, trips) {
  const stats = computeParentStats(trips);
  await base44.entities.ParentLink.update(parentLinkId, stats);
  return stats;
}