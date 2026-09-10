/**
 * FeelGood Conduite — Système de Défis temporaires
 * Les défis sont glissants sur une fenêtre de jours.
 * Chaque défi débloque un visuel exclusif pour le profil.
 */

import { differenceInDays, isAfter, subDays, startOfDay } from 'date-fns';

// ─── Récompenses visuelles (avatars/frames/badges profil) ────────────────────

export const REWARDS = {
  lightning: { id: 'lightning', emoji: '⚡', label: 'Éclair vert', description: 'Cadre électrique exclusif', gradient: 'from-primary to-emerald-400' },
  zen:       { id: 'zen',       emoji: '🧘', label: 'Mode Zen',    description: 'Cadre bleu apaisant',       gradient: 'from-blue-400 to-cyan-300' },
  guardian:  { id: 'guardian',  emoji: '🛡️', label: 'Gardien',    description: 'Cadre argent protection',   gradient: 'from-slate-400 to-slate-200' },
  phoenix:   { id: 'phoenix',   emoji: '🔥', label: 'Phénix',     description: 'Cadre orange flamme',       gradient: 'from-orange-400 to-red-400' },
  eco:       { id: 'eco',       emoji: '🌿', label: 'Éco-pilote',  description: 'Cadre vert nature',         gradient: 'from-green-500 to-lime-400' },
  diamond:   { id: 'diamond',   emoji: '💠', label: 'Diamant',    description: 'Cadre bleu glacier',        gradient: 'from-blue-500 to-indigo-400' },
  night:     { id: 'night',     emoji: '🌙', label: 'Nuit étoilée','description': 'Cadre nuit exclusive',   gradient: 'from-indigo-600 to-purple-500' },
  champion:  { id: 'champion',  emoji: '🏆', label: 'Champion',   description: 'Cadre or legendaire',      gradient: 'from-yellow-400 to-amber-500' },
};

// ─── Définition des défis ─────────────────────────────────────────────────────
// windowDays : fenêtre temporelle glissante
// check(trips, windowTrips) → { progress: 0–1, completed: bool }

export const CHALLENGES = [
  // ── Douceur ────────────────────────────────────────────────────────────────
  {
    id: 'no_harsh_3days',
    emoji: '🪶',
    label: 'Conduite veloutée',
    description: 'Zéro freinage/accélération brusque sur 3 jours consécutifs',
    windowDays: 3,
    rewardId: 'zen',
    category: 'douceur',
    check: (trips, windowTrips) => {
      const total = windowTrips.length;
      if (total === 0) return { progress: 0, completed: false };
      const clean = windowTrips.filter(t =>
        (t.harsh_braking_count || 0) === 0 && (t.harsh_acceleration_count || 0) === 0
      ).length;
      return { progress: Math.min(clean / Math.max(total, 1), 1), completed: clean === total && total >= 1 };
    },
  },
  {
    id: 'smooth_5trips',
    emoji: '😌',
    label: 'Maître de la douceur',
    description: 'Score douceur ≥ 85 sur 5 trajets',
    windowDays: 7,
    rewardId: 'eco',
    category: 'douceur',
    check: (trips, windowTrips) => {
      const good = windowTrips.filter(t => (t.smoothness_score || 0) >= 85).length;
      return { progress: Math.min(good / 5, 1), completed: good >= 5 };
    },
  },

  // ── Anticipation ───────────────────────────────────────────────────────────
  {
    id: 'anticipation_90_15km',
    emoji: '👁️',
    label: 'Vision d\'aigle',
    description: 'Score anticipation > 90 sur un trajet de 15 km minimum',
    windowDays: 7,
    rewardId: 'lightning',
    category: 'anticipation',
    check: (trips, windowTrips) => {
      const done = windowTrips.some(t =>
        (t.anticipation_score || 0) > 90 && (t.distance_km || 0) >= 15 && (t.roundabouts_count || 0) > 0
      );
      if (done) return { progress: 1, completed: true };
      const best = Math.max(0, ...windowTrips
        .filter(t => (t.distance_km || 0) >= 15 && (t.roundabouts_count || 0) > 0)
        .map(t => t.anticipation_score || 0));
      return { progress: Math.min(best / 90, 1), completed: false };
    },
  },
  {
    id: 'roundabout_clean_3',
    emoji: '🔄',
    label: 'Ronds-points parfaits',
    description: '3 ronds-points parfaitement anticipés en 2 jours',
    windowDays: 2,
    rewardId: 'guardian',
    category: 'anticipation',
    check: (trips, windowTrips) => {
      const count = windowTrips.reduce((s, t) => s + (t.roundabouts_good || 0), 0);
      return { progress: Math.min(count / 3, 1), completed: count >= 3 };
    },
  },

  // ── Stops ──────────────────────────────────────────────────────────────────
  {
    id: 'stop_zero_3days',
    emoji: '🛑',
    label: 'Tolérance zéro',
    description: 'Aucun STOP grillé sur 3 jours',
    windowDays: 3,
    rewardId: 'guardian',
    category: 'stops',
    check: (trips, windowTrips) => {
      const withStops = windowTrips.filter(t =>
        (t.stops_respected || 0) + (t.stops_violated || 0) > 0
      );
      if (withStops.length === 0) return { progress: 0, completed: false };
      const clean = withStops.every(t => (t.stops_violated || 0) === 0);
      return { progress: clean ? 1 : 0.5, completed: clean };
    },
  },

  // ── Score global ───────────────────────────────────────────────────────────
  {
    id: 'score_85_3trips',
    emoji: '⭐',
    label: 'Série gagnante',
    description: 'Score global ≥ 85 sur 3 trajets consécutifs',
    windowDays: 5,
    rewardId: 'phoenix',
    category: 'score',
    check: (trips, windowTrips) => {
      const sorted = [...windowTrips].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      let streak = 0;
      for (const t of sorted) {
        if ((t.overall_score || 0) >= 85) streak++;
        else break;
      }
      return { progress: Math.min(streak / 3, 1), completed: streak >= 3 };
    },
  },
  {
    id: 'perfect_score',
    emoji: '💎',
    label: 'Score parfait',
    description: 'Obtenir 100/100 sur un trajet',
    windowDays: 14,
    rewardId: 'diamond',
    category: 'score',
    check: (trips, windowTrips) => {
      const done = windowTrips.some(t => (t.overall_score || 0) >= 100);
      const best = Math.max(0, ...windowTrips.map(t => t.overall_score || 0));
      return { progress: Math.min(best / 100, 1), completed: done };
    },
  },

  // ── Vigilance ──────────────────────────────────────────────────────────────
  {
    id: 'no_phone_week',
    emoji: '📵',
    label: 'Concentration absolue',
    description: 'Aucune utilisation du téléphone sur 7 jours',
    windowDays: 7,
    rewardId: 'night',
    category: 'vigilance',
    check: (trips, windowTrips) => {
      const valid = windowTrips.filter(t => (t.distance_km || 0) >= 2);
      if (valid.length === 0) return { progress: 0, completed: false };
      const clean = valid.filter(t => (t.phone_usage_seconds || 0) === 0).length;
      return { progress: Math.min(clean / Math.max(valid.length, 3), 1), completed: clean >= 3 && clean === valid.length };
    },
  },

  // ── Distance ───────────────────────────────────────────────────────────────
  {
    id: 'distance_100_week',
    emoji: '🗺️',
    label: 'Grand explorateur',
    description: '100 km parcourus en 7 jours avec score moyen ≥ 75',
    windowDays: 7,
    rewardId: 'champion',
    category: 'distance',
    check: (trips, windowTrips) => {
      const dist = windowTrips.reduce((s, t) => s + (t.distance_km || 0), 0);
      const avgScore = windowTrips.length > 0
        ? windowTrips.reduce((s, t) => s + (t.overall_score || 0), 0) / windowTrips.length
        : 0;
      const distOk = Math.min(dist / 100, 1);
      const scoreOk = avgScore >= 75;
      return { progress: distOk * (scoreOk ? 1 : 0.7), completed: dist >= 100 && scoreOk };
    },
  },
];

// ─── Calcul de la progression d'un défi ──────────────────────────────────────

export function evaluateChallenge(challenge, allTrips) {
  const cutoff = startOfDay(subDays(new Date(), challenge.windowDays));
  const windowTrips = allTrips.filter(t => t.start_time && isAfter(new Date(t.start_time), cutoff));
  return challenge.check(allTrips, windowTrips);
}

// ─── Récupération des récompenses débloquées (stockées dans user data) ───────

export function getUnlockedRewards(user) {
  return user?.unlocked_rewards || [];
}

export function computeNewlyUnlockedRewards(allTrips, user) {
  const alreadyUnlocked = new Set(getUnlockedRewards(user));
  const newRewards = [];
  for (const challenge of CHALLENGES) {
    if (alreadyUnlocked.has(challenge.rewardId)) continue;
    const { completed } = evaluateChallenge(challenge, allTrips);
    if (completed) newRewards.push(challenge.rewardId);
  }
  return newRewards;
}