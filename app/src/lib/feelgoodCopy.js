/**
 * Feelgood — Vocabulaire & helpers de repositionnement
 * Centralise le ton « sérénité / progression » et la fabrication
 * des points forts / point à consolider / conseil depuis un trajet.
 */

// Appréciation synthétique pour un indice 0-100
export function serenityAppreciation(score) {
  if (score == null) return "Bilan partiel — données insuffisantes.";
  if (score >= 85) return "Une conduite très sereine et régulière.";
  if (score >= 70) return "Une conduite globalement sereine.";
  if (score >= 55) return "Une conduite correcte, quelques points à consolider.";
  if (score >= 40) return "Une conduite à apaiser sur les prochains trajets.";
  return "Un bilan à construire progressivement, trajet après trajet.";
}

export function serenityLabel(score) {
  if (score == null) return "Indice partiel";
  if (score >= 85) return "Très serein";
  if (score >= 70) return "Serein";
  if (score >= 55) return "Correct";
  if (score >= 40) return "À consolider";
  return "À construire";
}

// Nuance douce pour un score (évite le rouge comme couleur primaire)
export function serenityTone(score) {
  if (score == null) return { ring: 'bg-secondary text-muted-foreground', text: 'text-muted-foreground', bar: 'bg-secondary' };
  if (score >= 70) return { ring: 'bg-primary/15 text-primary', text: 'text-primary', bar: 'bg-primary' };
  if (score >= 50) return { ring: 'bg-yellow-400/15 text-yellow-400', text: 'text-yellow-400', bar: 'bg-yellow-400' };
  return { ring: 'bg-orange-400/15 text-orange-400', text: 'text-orange-400', bar: 'bg-orange-400' };
}

/**
 * Construit points forts / point à consolider / conseil à partir
 * d'un trajet et de ses événements. Aucune affirmation catégorique
 * sur une détection incertaine.
 */
export function buildTripInsights(trip, events = []) {
  const strengths = [];
  const toImprove = [];
  let conseil = "";

  if (!trip) return { strengths, toImprove, conseil };

  const s = (v) => (v == null ? 0 : v);

  if (s(trip.speed_score) >= 80) strengths.push("Vitesse bien adaptée aux limitations");
  if (s(trip.smoothness_score) >= 80) strengths.push("Conduite souple et régulière");
  if ((trip.roundabouts_count || 0) > 0 && s(trip.anticipation_score) >= 80) {
    strengths.push("Bonne anticipation aux ronds-points");
  }
  if ((trip.stops_respected || 0) > 0 && (trip.stops_violated || 0) === 0) {
    strengths.push("Arrêts bien négociés");
  }
  if ((trip.harsh_braking_count || 0) + (trip.harsh_acceleration_count || 0) === 0) {
    strengths.push("Aucun freinage brusque détecté");
  }
  if (strengths.length === 0 && s(trip.overall_score) >= 70) {
    strengths.push("Conduite régulière");
  }

  // Point à consolider : catégorie la plus basse parmi celles applicables
  const cats = [
    { key: "anticipation", score: s(trip.anticipation_score), label: "Commencer à ralentir plus tôt avant les intersections" },
    { key: "stop", score: s(trip.stop_score), label: "Marquer un arrêt plus marqué aux stops" },
    { key: "speed", score: s(trip.speed_score), label: "Mieux adapter la vitesse aux limitations" },
    { key: "smoothness", score: s(trip.smoothness_score), label: "Adoucir freinages et accélérations" },
  ].filter((c) => {
    if (c.key === "anticipation") return (trip.roundabouts_count || 0) > 0;
    if (c.key === "stop") return (trip.stops_respected || 0) + (trip.stops_violated || 0) > 0;
    return true;
  });
  cats.sort((a, b) => a.score - b.score);
  if (cats.length && cats[0].score < 80) toImprove.push(cats[0].label);

  // Événements remarquables (formulation douce, « semble »)
  const evts = events || [];
  const lateRb = evts.filter(
    (e) => e.event_type === "roundabout_poor" || e.event_type === "roundabout_dangerous"
  ).length;
  if (lateRb > 0 && !toImprove.some((t) => t.toLowerCase().includes("ronds-points"))) {
    toImprove.push(
      `${lateRb} rond${lateRb > 1 ? "s" : ""}-point${lateRb > 1 ? "s" : ""} semble${lateRb > 1 ? "nt" : ""} abordé${lateRb > 1 ? "s" : ""} un peu tardivement`
    );
  }
  const speeding = (trip.speeding_count || 0) + evts.filter((e) => e.event_type === "speeding").length;
  if (speeding > 0 && !toImprove.some((t) => t.toLowerCase().includes("vitesse"))) {
    toImprove.push(`${speeding} événement${speeding > 1 ? "s" : ""} de vitesse à surveiller`);
  }

  if (toImprove.length === 0) {
    conseil = "Continue sur cette lancée — la régularité est ta meilleure alliée.";
  } else {
    const first = toImprove[0];
    conseil = first.charAt(0).toUpperCase() + first.slice(1) + " — c'est ton prochain axe de progression.";
  }

  return { strengths, toImprove, conseil };
}

// Une détection est-elle présentée comme indicative (données insuffisantes) ?
export function isIndicatif(trip) {
  if (!trip) return true;
  if (trip.status === "pending_osm") return true;
  if ((trip.gps_points_count || 0) < 20) return true;
  return false;
}

// Texte d'évolution par rapport au score précédent
export function evolutionText(score, previousScore) {
  if (score == null || previousScore == null) return null;
  if (score > previousScore) return `En progression (+${score - previousScore} pts).`;
  if (score < previousScore) return `Légère baisse (${previousScore - score} pts) — un point de vigilance à reprendre.`;
  return "Conduite stable, régularité maintenue.";
}