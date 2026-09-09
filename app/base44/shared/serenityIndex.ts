// Indice de sérénité contextuel — scoring LLM déterministe avec fallback pondéré.

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function labelFor(s) {
  if (s >= 85) return 'Sereine';
  if (s >= 65) return 'Stable';
  if (s >= 45) return 'À apaiser';
  return 'À accompagner';
}

function computeFallback(scores, ctx) {
  const cats = [];
  if (scores.anticipation_score != null && (ctx.roundaboutsCount || 0) > 0) cats.push({ k: 'Anticipation aux carrefours', s: scores.anticipation_score, w: 25 });
  if (scores.stop_score != null && (ctx.stopsCount || 0) > 0) cats.push({ k: 'Respect des arrêts', s: scores.stop_score, w: 20 });
  if (scores.speed_score != null) cats.push({ k: 'Adaptation de la vitesse', s: scores.speed_score, w: 25 });
  if (scores.smoothness_score != null) cats.push({ k: 'Douceur de conduite', s: scores.smoothness_score, w: 20 });
  const attention = Math.max(0, 100 - (ctx.distractionCount || 0) * 8 - (ctx.fatigueAlertCount || 0) * 10);
  cats.push({ k: 'Attention au volant', s: attention, w: 15 });

  const totW = cats.reduce((a, c) => a + c.w, 0) || 1;
  let idx = Math.round(cats.reduce((a, c) => a + c.s * c.w, 0) / totW);

  // Ajustements de contexte bienveillants (météo difficile, nuit)
  if (['rain', 'fog', 'snow'].includes(ctx.weather)) idx += 3;
  if (ctx.startHour != null && (ctx.startHour < 6 || ctx.startHour >= 22)) idx += 2;

  const final = clamp(idx, 0, 100);
  const sorted = [...cats].sort((a, b) => a.s - b.s);

  return {
    serenity_index: final,
    label: labelFor(final),
    primary_axis: sorted[0]?.k || 'Adaptation de la vitesse',
    secondary_axis: sorted[1]?.k || null,
    one_line_summary: final >= 75 ? 'Une conduite globalement sereine ce trajet.' : 'Quelques axes à consolider sur les prochains trajets.',
    context_note: null,
  };
}

function buildContextSummary(scores, ctx) {
  const dist = ctx.distanceKm || 0;
  const rbDensity = dist > 0 ? ((ctx.roundaboutsCount || 0) / dist).toFixed(2) : '0';
  const stopDensity = dist > 0 ? ((ctx.stopsCount || 0) / dist).toFixed(2) : '0';
  return JSON.stringify({
    scores: {
      anticipation: scores.anticipation_score,
      stop: scores.stop_score,
      speed: scores.speed_score,
      smoothness: scores.smoothness_score,
    },
    context: {
      meteo: ctx.weather,
      trafic: ctx.trafficLevel,
      heure_debut: ctx.startHour,
      conduite_nocturne: ctx.startHour != null ? (ctx.startHour < 6 || ctx.startHour >= 22) : false,
      alertes_fatigue: ctx.fatigueAlertCount || 0,
      distractions_telephone: ctx.distractionCount || 0,
      densite_ronds_points_par_km: rbDensity,
      densite_stops_par_km: stopDensity,
      types_route: ctx.roadTypes,
    },
  });
}

/**
 * Calcule l'indice de sérénité contextuel via LLM déterministe (schema strict).
 * Fallback sur moyenne pondérée si l'appel IA échoue.
 */
export async function computeSerenityIndex(base44, { scores, context }) {
  const fallback = computeFallback(scores, context);
  try {
    const prompt = `Tu es Feelgood, coach de conduite bienveillant. À partir des scores par catégorie et du contexte de conduite ci-dessous, calcule un INDICE DE SÉRÉNITÉ (0-100) qui ajuste les scores bruts selon le contexte : une météo difficile (pluie/brouillard/neige) ou une conduite nocturne rendent certains écarts plus compréhensibles (légère indulgence), mais une fatigue ou une distraction élevée pèse sur l'attention. Ne so jamais punitif : l'indice reste pédagogique.

Données (JSON) :
${buildContextSummary(scores, context)}

Réponds UNIQUEMENT avec un objet JSON respectant le schéma. sings:
- serenity_index : entier 0-100
- label : un parmi ["Sereine", "Stable", "À apaiser", "À accompagner"]
- primary_axis : la catégorie la plus à consolider (libellé court)
- secondary_axis : la 2e catégorie à consolider (libellé court, ou chaîne vide)
- one_line_summary : une phrase bienveillante et concrète pour le jeune conducteur
- context_note : éventuelle note de contexte (météo/nuit), sinon chaîne vide`;

    const schema = {
      type: 'object',
      properties: {
        serenity_index: { type: 'number' },
        label: { type: 'string', enum: ['Sereine', 'Stable', 'À apaiser', 'À accompagner'] },
        primary_axis: { type: 'string' },
        secondary_axis: { type: 'string' },
        one_line_summary: { type: 'string' },
        context_note: { type: 'string' },
      },
      required: ['serenity_index', 'label', 'primary_axis', 'one_line_summary'],
    };

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema,
      model: 'automatic',
    });
    const data = res && res.data ? res.data : res;

    const idx = clamp(typeof data.serenity_index === 'number' ? data.serenity_index : fallback.serenity_index, 0, 100);
    const validLabels = ['Sereine', 'Stable', 'À apaiser', 'À accompagner'];
    const label = validLabels.includes(data.label) ? data.label : fallback.label;
    const primary = typeof data.primary_axis === 'string' && data.primary_axis.trim() ? data.primary_axis.trim() : fallback.primary_axis;
    const secondary = typeof data.secondary_axis === 'string' && data.secondary_axis.trim() ? data.secondary_axis.trim() : fallback.secondary_axis;
    const summary = typeof data.one_line_summary === 'string' && data.one_line_summary.trim() ? data.one_line_summary.trim() : fallback.one_line_summary;
    const note = typeof data.context_note === 'string' && data.context_note.trim() ? data.context_note.trim() : null;

    return { serenity_index: Math.round(idx), label, primary_axis: primary, secondary_axis: secondary, one_line_summary: summary, context_note: note };
  } catch (e) {
    console.warn('[serenityIndex] fallback utilisé:', e.message);
    return fallback;
  }
}