/**
 * FeelGood Conduite — Système de badges et progression
 * Calcul basé sur l'historique des trajets.
 */

export const BADGES = [
  // ── Premiers pas ──────────────────────────────────────────────────────────
  {
    id: 'first_trip',
    emoji: '🚗',
    label: 'Premier trajet',
    description: 'Vous avez enregistré votre premier trajet !',
    category: 'parcours',
    check: (trips) => trips.length >= 1,
  },
  {
    id: 'ten_trips',
    emoji: '🏁',
    label: '10 trajets',
    description: '10 trajets enregistrés — vous prenez de bonnes habitudes !',
    category: 'parcours',
    check: (trips) => trips.length >= 10,
  },
  {
    id: 'fifty_trips',
    emoji: '🎖️',
    label: '50 trajets',
    description: 'Conducteur confirmé — 50 trajets au compteur.',
    category: 'parcours',
    check: (trips) => trips.length >= 50,
  },

  // ── Distance ──────────────────────────────────────────────────────────────
  {
    id: 'km_100',
    emoji: '📍',
    label: '100 km parcourus',
    description: '100 km au total sous surveillance FeelGood.',
    category: 'distance',
    check: (trips) => trips.reduce((s, t) => s + (t.distance_km || 0), 0) >= 100,
  },
  {
    id: 'km_500',
    emoji: '🗺️',
    label: '500 km parcourus',
    description: 'Un vrai routard éco-responsable.',
    category: 'distance',
    check: (trips) => trips.reduce((s, t) => s + (t.distance_km || 0), 0) >= 500,
  },
  {
    id: 'km_1000',
    emoji: '🌍',
    label: '1 000 km parcourus',
    description: 'Paris → Berlin sous votre roue !',
    category: 'distance',
    check: (trips) => trips.reduce((s, t) => s + (t.distance_km || 0), 0) >= 1000,
  },

  // ── Score global ──────────────────────────────────────────────────────────
  {
    id: 'score_80',
    emoji: '⭐',
    label: 'Conducteur fiable',
    description: 'Score moyen ≥ 80 sur au moins 5 trajets.',
    category: 'score',
    check: (trips) => {
      const valid = trips.filter(t => t.overall_score);
      return valid.length >= 5 && valid.reduce((s, t) => s + t.overall_score, 0) / valid.length >= 80;
    },
  },
  {
    id: 'score_90',
    emoji: '🌟',
    label: 'Expert FeelGood',
    description: 'Score moyen ≥ 90 sur au moins 5 trajets — excellent !',
    category: 'score',
    check: (trips) => {
      const valid = trips.filter(t => t.overall_score);
      return valid.length >= 5 && valid.reduce((s, t) => s + t.overall_score, 0) / valid.length >= 90;
    },
  },
  {
    id: 'perfect_trip',
    emoji: '💎',
    label: 'Trajet parfait',
    description: 'Score de 100/100 sur un trajet.',
    category: 'score',
    check: (trips) => trips.some(t => t.overall_score === 100),
  },

  // ── Anticipation / Ronds-points ───────────────────────────────────────────
  {
    id: 'roundabout_5',
    emoji: '🔄',
    label: 'As du rond-point',
    description: '5 ronds-points bien anticipés.',
    category: 'anticipation',
    check: (trips) => trips.reduce((s, t) => s + (t.roundabouts_good || 0), 0) >= 5,
  },
  {
    id: 'roundabout_20',
    emoji: '🎯',
    label: 'Maître de l\'anticipation',
    description: '20 ronds-points parfaitement anticipés.',
    category: 'anticipation',
    check: (trips) => trips.reduce((s, t) => s + (t.roundabouts_good || 0), 0) >= 20,
  },
  {
    id: 'anticipation_100',
    emoji: '👁️',
    label: 'Vision parfaite',
    description: 'Score anticipation de 100 sur un trajet avec ronds-points.',
    category: 'anticipation',
    check: (trips) => trips.some(t => t.anticipation_score === 100 && (t.roundabouts_count || 0) > 0),
  },

  // ── Respect des stops ─────────────────────────────────────────────────────
  {
    id: 'stop_5',
    emoji: '🛑',
    label: 'Respectueux des STOP',
    description: '5 panneaux STOP parfaitement respectés.',
    category: 'stops',
    check: (trips) => trips.reduce((s, t) => s + (t.stops_respected || 0), 0) >= 5,
  },
  {
    id: 'stop_zero_violation',
    emoji: '✅',
    label: 'Zéro infraction',
    description: 'Aucun STOP grillé sur 5 trajets consécutifs avec stops.',
    category: 'stops',
    check: (trips) => {
      const withStops = trips.filter(t => (t.stops_respected || 0) + (t.stops_violated || 0) > 0);
      if (withStops.length < 5) return false;
      return withStops.slice(0, 5).every(t => (t.stops_violated || 0) === 0);
    },
  },

  // ── Douceur de conduite ───────────────────────────────────────────────────
  {
    id: 'smooth_driver',
    emoji: '🪶',
    label: 'Conduite veloutée',
    description: 'Score douceur ≥ 90 sur 3 trajets.',
    category: 'douceur',
    check: (trips) => trips.filter(t => (t.smoothness_score || 0) >= 90).length >= 3,
  },
  {
    id: 'no_harsh',
    emoji: '😌',
    label: 'Sans à-coups',
    description: '0 freinage/accélération brusque sur un trajet de + de 5 km.',
    category: 'douceur',
    check: (trips) => trips.some(t =>
      (t.distance_km || 0) >= 5 &&
      (t.harsh_braking_count || 0) === 0 &&
      (t.harsh_acceleration_count || 0) === 0
    ),
  },

  // ── Vigilance (téléphone/fatigue) ─────────────────────────────────────────
  {
    id: 'no_phone',
    emoji: '📵',
    label: 'Focus total',
    description: 'Aucune utilisation du téléphone sur 5 trajets.',
    category: 'vigilance',
    check: (trips) => trips.filter(t => (t.phone_usage_seconds || 0) === 0 && (t.distance_km || 0) >= 2).length >= 5,
  },
  {
    id: 'no_fatigue',
    emoji: '😎',
    label: 'Toujours alerte',
    description: 'Aucune alerte fatigue sur 10 trajets.',
    category: 'vigilance',
    check: (trips) => {
      const valid = trips.filter(t => t.fatigue_summary);
      return valid.length >= 10 && valid.slice(0, 10).every(t => (t.fatigue_summary?.alertCount || 0) === 0);
    },
  },

  // ── Régularité ────────────────────────────────────────────────────────────
  {
    id: 'consistent_week',
    emoji: '📅',
    label: 'Cap sur la semaine',
    description: 'Au moins un trajet par jour sur 5 jours consécutifs.',
    category: 'régularité',
    check: (trips) => {
      if (trips.length < 5) return false;
      const days = new Set(trips.map(t => t.start_time?.slice(0, 10)));
      const sorted = [...days].sort();
      let streak = 1, max = 1;
      for (let i = 1; i < sorted.length; i++) {
        const diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
        streak = diff === 1 ? streak + 1 : 1;
        max = Math.max(max, streak);
      }
      return max >= 5;
    },
  },
  {
    id: 'eco_champion',
    emoji: '🌱',
    label: 'Champion éco',
    description: 'Score global ≥ 85 sur 10 trajets — conduite éco-responsable exemplaire.',
    category: 'score',
    check: (trips) => {
      const valid = trips.filter(t => t.overall_score >= 85);
      return valid.length >= 10;
    },
  },
];

// ─── Catégories pour affichage groupé ─────────────────────────────────────

export const BADGE_CATEGORIES = [
  { id: 'score', label: 'Score global', emoji: '🏆' },
  { id: 'anticipation', label: 'Anticipation', emoji: '👁️' },
  { id: 'stops', label: 'Respect STOP', emoji: '🛑' },
  { id: 'douceur', label: 'Douceur', emoji: '🪶' },
  { id: 'vigilance', label: 'Vigilance', emoji: '📵' },
  { id: 'distance', label: 'Distance', emoji: '🗺️' },
  { id: 'parcours', label: 'Parcours', emoji: '🚗' },
  { id: 'régularité', label: 'Régularité', emoji: '📅' },
];

// ─── Calcul des badges débloqués ─────────────────────────────────────────

export function computeUnlockedBadges(trips) {
  return BADGES.filter(b => b.check(trips));
}

// ─── Calcul de la progression par badge (0–1) ────────────────────────────

export function computeBadgeProgress(badge, trips) {
  // Quelques badges ont une progression calculable
  switch (badge.id) {
    case 'ten_trips': return Math.min(trips.length / 10, 1);
    case 'fifty_trips': return Math.min(trips.length / 50, 1);
    case 'km_100': return Math.min(trips.reduce((s, t) => s + (t.distance_km || 0), 0) / 100, 1);
    case 'km_500': return Math.min(trips.reduce((s, t) => s + (t.distance_km || 0), 0) / 500, 1);
    case 'km_1000': return Math.min(trips.reduce((s, t) => s + (t.distance_km || 0), 0) / 1000, 1);
    case 'roundabout_5': return Math.min(trips.reduce((s, t) => s + (t.roundabouts_good || 0), 0) / 5, 1);
    case 'roundabout_20': return Math.min(trips.reduce((s, t) => s + (t.roundabouts_good || 0), 0) / 20, 1);
    case 'stop_5': return Math.min(trips.reduce((s, t) => s + (t.stops_respected || 0), 0) / 5, 1);
    case 'smooth_driver': return Math.min(trips.filter(t => (t.smoothness_score || 0) >= 90).length / 3, 1);
    case 'no_phone': return Math.min(trips.filter(t => (t.phone_usage_seconds || 0) === 0 && (t.distance_km || 0) >= 2).length / 5, 1);
    case 'eco_champion': return Math.min(trips.filter(t => t.overall_score >= 85).length / 10, 1);
    default: return badge.check(trips) ? 1 : 0;
  }
}

// ─── Score de niveau global (0–5 étoiles) ────────────────────────────────

export function computeDriverLevel(trips) {
  if (!trips.length) return { level: 0, label: 'Débutant', nextLabel: 'Novice', progress: 0 };
  const total = trips.reduce((s, t) => s + (t.overall_score || 0), 0);
  const avg = total / trips.length;
  const dist = trips.reduce((s, t) => s + (t.distance_km || 0), 0);
  const unlocked = computeUnlockedBadges(trips).length;

  // Niveau composite : score + km + badges
  const points = avg * 0.5 + Math.min(dist / 20, 25) + unlocked * 2;

  const LEVELS = [
    { min: 0,   label: 'Débutant',  next: 'Novice' },
    { min: 30,  label: 'Novice',    next: 'Apprenti' },
    { min: 55,  label: 'Apprenti',  next: 'Confirmé' },
    { min: 75,  label: 'Confirmé',  next: 'Expert' },
    { min: 90,  label: 'Expert',    next: 'Champion' },
    { min: 110, label: 'Champion FeelGood', next: null },
  ];

  let level = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) level = i;
  }

  const current = LEVELS[level];
  const next = LEVELS[level + 1];
  const progress = next
    ? Math.min((points - current.min) / (next.min - current.min), 1)
    : 1;

  return { level, label: current.label, nextLabel: current.next, progress, points };
}