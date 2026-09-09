/**
 * Feelgood — Vocabulaire & ton partagés
 * Centralise le repositionnement "indice de sérénité" / "bilan de conduite"
 * pour garder un wording cohérent sur tous les écrans.
 */

// Descriptions pédagogiques par catégorie d'analyse
export const CATEGORIES = {
  anticipation: {
    label: 'Anticipation aux carrefours',
    mastered: 'bonne anticipation aux ronds-points et intersections',
    consolidate: 'Mieux anticiper les ronds-points en commençant à ralentir plus tôt',
  },
  stop: {
    label: 'Respect des arrêts',
    mastered: 'arrêts abordés sereinement',
    consolidate: 'Mieux s’arrêter aux stops et cédez-le-passage',
  },
  speed: {
    label: 'Adaptation de la vitesse',
    mastered: 'vitesse bien adaptée aux limitations',
    consolidate: 'Mieux adapter ta vitesse aux limitations et au contexte',
  },
  smoothness: {
    label: 'Douceur de conduite',
    mastered: 'conduite souple, freinages et accélérations progressifs',
    consolidate: 'Rendre tes freinages et accélérations plus progressifs',
  },
  attention: {
    label: 'Attention au volant',
    mastered: 'attention soutenue, téléphone au repos',
    consolidate: 'Garder le téléphone de côté pendant la conduite',
  },
};

/**
 * Extrait les catégories d'analyse d'un trajet (avec leur valeur présente ou non).
 * Renvoie un tableau { key, label, score } pour les catégories réellement couvertes
 * par le trajet (anticipation/stop seulement si des ronds-points/stops y figurent).
 */
export function extractCategories(trip) {
  if (!trip) return [];
  const distractionPenalty = trip.distraction_summary?.scorePenalty || 0;
  const fatiguePenalty = trip.fatigue_summary?.scorePenalty || 0;
  const attention = Math.max(0, 100 - distractionPenalty - fatiguePenalty);
  const hasRb = (trip.roundabouts_count || 0) > 0;
  const stopsTotal = (trip.stops_respected || 0) + (trip.stops_violated || 0);
  const hasStops = stopsTotal > 0;

  const list = [];
  if (hasRb && trip.anticipation_score != null) {
    list.push({ key: 'anticipation', label: CATEGORIES.anticipation.label, score: trip.anticipation_score });
  }
  if (hasStops && trip.stop_score != null) {
    list.push({ key: 'stop', label: CATEGORIES.stop.label, score: trip.stop_score });
  }
  if (trip.speed_score != null) list.push({ key: 'speed', label: CATEGORIES.speed.label, score: trip.speed_score });
  if (trip.smoothness_score != null) list.push({ key: 'smoothness', label: CATEGORIES.smoothness.label, score: trip.smoothness_score });
  list.push({ key: 'attention', label: CATEGORIES.attention.label, score: attention });
  return list;
}

/**
 * Phrase synthétique décrivant le bilan (sans idée de sanction).
 */
export function serenityPhrase(score) {
  if (score == null) return 'Données insuffisantes pour conclure sur ce trajet.';
  if (score >= 90) return 'Une conduite très sereine et régulière.';
  if (score >= 80) return 'Une conduite globalement souple et régulière.';
  if (score >= 70) return 'Une conduite correcte, quelques ajustements possibles.';
  if (score >= 55) return 'Une conduite à apaiser sur quelques aspects.';
  return 'Plusieurs points méritent de l’attention sur les prochains trajets.';
}

/**
 * Court label d'appréciation (sans rouge, sans "échec").
 */
export function serenityToneLabel(score) {
  if (score == null) return 'Indicatif';
  if (score >= 80) return 'Sereine';
  if (score >= 60) return 'Stable';
  if (score >= 45) return 'À apaiser';
  return 'À accompagner';
}

/**
 * Classes de badge neutres (lime / ambre / muted — pas de rouge d'évaluation).
 */
export function serenityBadgeClass(score) {
  if (score == null) return 'bg-secondary text-muted-foreground';
  if (score >= 80) return 'bg-primary text-primary-foreground';
  if (score >= 60) return 'bg-amber-400/15 text-amber-300 border border-amber-400/30';
  return 'bg-secondary text-muted-foreground border border-border';
}

/**
 * Phrase de progression personnelle (sans comparaison aux autres).
 */
export function progressionPhrase(latestScore, previousAvg) {
  if (latestScore == null || previousAvg == null) {
    return 'Ton évolution sera visible après quelques trajets.';
  }
  const diff = latestScore - previousAvg;
  if (diff >= 3) return 'Ta conduite est plus régulière sur les derniers trajets.';
  if (diff <= -3) return 'Quelques fluctuations sur les derniers trajets — l’évolution reste à suivre.';
  return 'Ta conduite est stable sur les derniers trajets.';
}

/**
 * Conseil Feelgood : priorise le commentaire IA existant, sinon un conseil
 * pédagogique fondé sur le point le plus bas à consolider.
 */
export function feelgoodAdvice(trip, toWork) {
  if (trip?.ai_comments?.length) return trip.ai_comments[0];
  if (toWork?.length) return CATEGORIES[toWork[0].key]?.consolidate || 'Continue à observer la route avec anticipation.';
  return 'Continue à conduire avec la même attention.';
}