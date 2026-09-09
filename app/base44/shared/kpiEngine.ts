// KPI Moniteur — coach de conduite bienveillant (style auto-école).
// Calcule des KPIs par trajet + agrégés sur une période, hiérarchise les erreurs,
// et génère un coaching pédagogique via LLM (fallback déterministe si l'IA échoue).

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function avg(arr: number[]) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }
function round1(v: number | null) { return v == null ? null : Math.round(v * 10) / 10; }

const LEVEL_ORDER: Record<string, number> = { critique: 0, serieux: 1, corriger: 2, mineur: 3 };

// ── KPI par trajet ─────────────────────────────────────────────────────────────

export function computeTripKpis(trip: any, events: any[]) {
  const evts = events || [];
  const rb = evts.filter(e => e.event_type?.startsWith('roundabout'));
  const stops = evts.filter(e => e.event_type?.startsWith('stop'));
  const speeding = evts.filter(e => e.event_type === 'speeding');

  const zone1 = rb.filter(e => e.roundabout_detail?.anticipation_zone === 'zone1').length;
  const zonePct = rb.length ? Math.round((zone1 / rb.length) * 100) : null;
  const entrySpeeds = rb.map(e => e.roundabout_detail?.speed_at_entry).filter(v => v != null);
  const decelDists = rb.map(e => e.roundabout_detail?.decel_start_dist).filter(v => v != null);
  const dangerousRb = rb.filter(e => e.roundabout_detail?.rating === 'dangerous' || (e.roundabout_detail?.speed_at_entry ?? 0) > 45).length;

  const stopsRespected = stops.filter(e => e.event_type === 'stop_respected').length;
  const stopsGlisse = stops.filter(e => e.stop_detail?.rating === 'glisse').length;
  const stopsDanger = stops.filter(e => e.stop_detail?.rating === 'dangerous').length;

  const maxExcess = speeding.reduce((m, e) => Math.max(m, (e.speed_kmh || 0) - (e.speed_limit_kmh || 50)), 0);
  const highSpeedExcess = speeding.filter(e => (e.speed_kmh || 0) - (e.speed_limit_kmh || 50) > 20).length;

  const harshBraking = trip.harsh_braking_count || 0;
  const harshAccel = trip.harsh_acceleration_count || 0;
  const harshPerKm = (harshBraking + harshAccel) / Math.max(trip.distance_km || 0, 0.1);

  const phoneEvents = trip.distraction_summary?.count || 0;
  const fatigueAlerts = trip.fatigue_summary?.alertCount || 0;
  const attentionScore = Math.max(0, 100 - (trip.distraction_summary?.scorePenalty || 0) - (trip.fatigue_summary?.scorePenalty || 0));

  return {
    distance_km: trip.distance_km || 0,
    duration_min: trip.duration_minutes || 0,
    roundabouts: { count: rb.length, zone1_pct: zonePct, avg_entry_speed: round1(avg(entrySpeeds)), avg_decel_dist: round1(avg(decelDists)), dangerous: dangerousRb },
    stops: { count: stops.length, respected: stopsRespected, glisse: stopsGlisse, dangerous: stopsDanger },
    speed: { excess_count: speeding.length, max_excess: Math.round(maxExcess), high_excess: highSpeedExcess },
    smoothness: { harsh_braking: harshBraking, harsh_accel: harshAccel, per_km: round1(harshPerKm) },
    attention: { phone_events: phoneEvents, fatigue_alerts: fatigueAlerts, score: Math.round(attentionScore) },
    scores: {
      anticipation: trip.anticipation_score,
      stop: trip.stop_score,
      speed: trip.speed_score,
      smoothness: trip.smoothness_score,
      overall: trip.overall_score,
    },
  };
}

// ── Erreurs hiérarchisées (par trajet) ────────────────────────────────────────

export function detectTripErrors(trip: any, events: any[]) {
  const evts = events || [];
  const out: any[] = [];
  const rb = evts.filter(e => e.event_type?.startsWith('roundabout'));
  const stops = evts.filter(e => e.event_type?.startsWith('stop'));
  const speeding = evts.filter(e => e.event_type === 'speeding');

  // Critique
  rb.forEach(e => {
    const d = e.roundabout_detail || {};
    if (d.rating === 'dangerous' || (d.speed_at_entry ?? 0) > 45) {
      out.push({ level: 'critique', category: 'anticipation', message: `Rond-point abordé trop vite (${d.speed_at_entry ?? '?'} km/h à l'entrée).` });
    }
  });
  stops.forEach(e => {
    if (e.stop_detail?.rating === 'dangerous') {
      out.push({ level: 'critique', category: 'stop', message: `STOP non respecté (${Math.round(e.stop_detail.min_speed_kmh ?? 0)} km/h au panneau).` });
    }
  });
  speeding.forEach(e => {
    const over = (e.speed_kmh || 0) - (e.speed_limit_kmh || 50);
    if (over > 40) out.push({ level: 'critique', category: 'speed', message: `Excès important : ${Math.round(e.speed_kmh)} km/h (limite ${e.speed_limit_kmh}).` });
  });
  if (trip.distraction_summary?.hasRedAlert) {
    out.push({ level: 'critique', category: 'attention', message: 'Téléphone utilisé en conduite à vitesse élevée.' });
  }

  // Sérieux
  rb.forEach(e => {
    if (e.roundabout_detail?.rating === 'late') {
      out.push({ level: 'serieux', category: 'anticipation', message: 'Décélération amorcée tardivement sur un rond-point.' });
    }
  });
  stops.forEach(e => {
    if (e.stop_detail?.rating === 'glisse') {
      out.push({ level: 'serieux', category: 'stop', message: 'Stop glissé — arrêt incomplet.' });
    }
  });
  speeding.forEach(e => {
    const over = (e.speed_kmh || 0) - (e.speed_limit_kmh || 50);
    if (over > 20 && over <= 40) out.push({ level: 'serieux', category: 'speed', message: `Excès de vitesse : ${Math.round(e.speed_kmh)} km/h (limite ${e.speed_limit_kmh}).` });
  });
  if (trip.fatigue_summary?.alertCount >= 2) {
    out.push({ level: 'serieux', category: 'attention', message: 'Plusieurs alertes fatigue — prévoir une pause.' });
  }

  // À corriger
  rb.forEach(e => {
    const d = e.roundabout_detail || {};
    if (d.progressive_decel === false && d.rating !== 'dangerous') {
      out.push({ level: 'corriger', category: 'anticipation', message: 'Décélération irrégulière à l\'approche d\'un rond-point.' });
    }
  });
  const harshTotal = (trip.harsh_braking_count || 0) + (trip.harsh_acceleration_count || 0);
  if (harshTotal > 0) {
    out.push({ level: 'corriger', category: 'smoothness', message: `${harshTotal} freinage(s)/accélération(s) brutal(aux) détecté(s).` });
  }
  if (trip.distraction_summary?.count > 0 && !trip.distraction_summary?.hasRedAlert) {
    out.push({ level: 'corriger', category: 'attention', message: 'Téléphone manipulé pendant la conduite.' });
  }

  // Mineur
  speeding.forEach(e => {
    const over = (e.speed_kmh || 0) - (e.speed_limit_kmh || 50);
    if (over > 6 && over <= 20) out.push({ level: 'mineur', category: 'speed', message: `Léger dépassement : ${Math.round(e.speed_kmh)} km/h (limite ${e.speed_limit_kmh}).` });
  });

  // dédoublonne par message
  const seen = new Set<string>();
  return out.filter(e => {
    if (seen.has(e.message)) return false;
    seen.add(e.message); return true;
  }).sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));
}

// ── KPI agrégés sur une période ────────────────────────────────────────────────

export function computeAggregateKpis(trips: any[], events: any[]) {
  const evts = events || [];
  const completed = trips.filter(t => t.status === 'completed');
  const totalKm = completed.reduce((s, t) => s + (t.distance_km || 0), 0);
  const totalTrips = completed.length;

  const anticipationScores = completed.filter(t => (t.roundabouts_count || 0) > 0).map(t => t.anticipation_score).filter(v => v != null);
  const stopScores = completed.filter(t => ((t.stops_respected || 0) + (t.stops_violated || 0)) > 0).map(t => t.stop_score).filter(v => v != null);
  const speedScores = completed.map(t => t.speed_score).filter(v => v != null);
  const smoothScores = completed.map(t => t.smoothness_score).filter(v => v != null);
  const attentionScores = completed.map(t => Math.max(0, 100 - (t.distraction_summary?.scorePenalty || 0) - (t.fatigue_summary?.scorePenalty || 0)));

  const mastery = {
    anticipation: round1(avg(anticipationScores)),
    stop: round1(avg(stopScores)),
    speed: round1(avg(speedScores)),
    smoothness: round1(avg(smoothScores)),
    attention: round1(avg(attentionScores)),
  };
  const overall = round1(avg(completed.map(t => t.overall_score).filter(v => v != null)));

  // Erreurs récurrentes agrégées
  const errCount: Record<string, number> = {};
  for (const t of completed) {
    const tEvents = evts.filter(e => e.trip_id === t.id);
    const errs = detectTripErrors(t, tEvents);
    for (const e of errs) {
      const key = `${e.level}|${e.category}`;
      errCount[key] = (errCount[key] || 0) + 1;
    }
  }
  const recurring = Object.entries(errCount)
    .map(([key, n]) => { const [level, category] = key.split('|'); return { level, category, count: n }; })
    .sort((a, b) => b.count - a.count);

  // Progression hebdomadaire (6 semaines)
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const end = new Date(); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - i * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    const wTrips = completed.filter(t => {
      const ts = t.start_time ? new Date(t.start_time).getTime() : 0;
      return ts >= start.getTime() && ts <= end.getTime();
    });
    const wRbTrips = wTrips.filter(t => (t.roundabouts_count || 0) > 0);
    weeks.push({
      label: `S${6 - i}`,
      score: wTrips.length ? Math.round(avg(wTrips.map(t => t.overall_score)) ?? 0) : null,
      trips: wTrips.length,
      anticipation: wRbTrips.length ? round1(avg(wRbTrips.map(t => t.anticipation_score))) : null,
      speed: wTrips.length ? round1(avg(wTrips.map(t => t.speed_score))) : null,
      smoothness: wTrips.length ? round1(avg(wTrips.map(t => t.smoothness_score))) : null,
    });
  }

  const rbEvents = evts.filter(e => e.event_type?.startsWith('roundabout'));
  const zone1Pct = rbEvents.length ? Math.round(rbEvents.filter(e => e.roundabout_detail?.anticipation_zone === 'zone1').length / rbEvents.length * 100) : null;
  const stopsAll = evts.filter(e => e.event_type?.startsWith('stop'));
  const stopsRespectedPct = stopsAll.length ? Math.round(stopsAll.filter(e => e.event_type === 'stop_respected').length / stopsAll.length * 100) : null;
  const speedingAll = evts.filter(e => e.event_type === 'speeding');
  const harshTotal = completed.reduce((s, t) => s + (t.harsh_braking_count || 0) + (t.harsh_acceleration_count || 0), 0);
  const sereneCount = completed.filter(t => (t.overall_score ?? 0) >= 70).length;
  const serenePct = totalTrips ? Math.round((sereneCount / totalTrips) * 100) : null;

  return {
    period: { trips: totalTrips, km: Math.round(totalKm * 10) / 10 },
    mastery: { ...mastery, overall },
    serene_pct: serenePct,
    anticipation: { zone1_pct: zone1Pct, roundabouts: rbEvents.length },
    stops: { respected_pct: stopsRespectedPct, total: stopsAll.length },
    speed: { excess_count: speedingAll.length },
    smoothness: { harsh_total: harshTotal, per_km: round1(harshTotal / Math.max(totalKm, 0.1)) },
    recurring_errors: recurring.slice(0, 6),
    weeks,
  };
}

// ── Coaching : prompt LLM + fallback déterministe ─────────────────────────────

const AXIS_LABELS: Record<string, string> = {
  anticipation: 'Anticipation aux carrefours',
  stop: 'Respect des arrêts',
  speed: 'Adaptation de la vitesse',
  smoothness: 'Douceur de conduite',
  attention: 'Attention au volant',
};

const AXIS_ADVICE: Record<string, string> = {
  anticipation: 'Repère le rond-point 150 m avant et amorce ta décélération en levant le pied plutôt qu\'en freinant.',
  stop: 'Marque un arrêt complet aux STOP, même si la voie est libre — c\'est la mécanique qui compte.',
  speed: 'Surveille les panneaux et adapte ta vitesse au contexte, pas seulement à la limite.',
  smoothness: 'Utilise le frein moteur et étale tes ralentissements pour éviter les à-coups.',
  attention: 'Garde le téléphone de côté ; si la fatigue se fait sentir, fais une pause de 5 minutes.',
};

function coachFallback({ mode, kpis, errors }: any) {
  if (mode === 'trip') {
    const errs = errors || [];
    const critical = errs.filter((e: any) => e.level === 'critique');
    const toFix = errs.filter((e: any) => e.level === 'serieux' || e.level === 'corriger');
    const cats = Array.from(new Set(errs.map((e: any) => e.category))) as string[];
    const axes = cats.slice(0, 3).map((c: string) => ({ title: AXIS_LABELS[c] || c, advice: AXIS_ADVICE[c] || 'Continue à observer la route avec attention.' }));
    if (axes.length === 0) axes.push({ title: 'Continuer sur cette voie', advice: 'Aucun point saillant ce trajet — conserve tes bonnes habitudes.' });
    let summary: string;
    if (critical.length) summary = 'Quelques situations à surveiller ce trajet — reprenons-les ensemble pour progresser en douceur.';
    else if (toFix.length) summary = 'Un trajet globalement correct, avec deux ou trois axes à consolider.';
    else summary = 'Un beau trajet, serein et maîtrisé — bravo !';
    return { summary, axes: axes.slice(0, 3), source: 'fallback' };
  }
  // agrégé
  const m = kpis?.mastery || {};
  const entries = (Object.entries(m) as [string, number | null][]).filter(([k]) => k !== 'overall');
  const sorted = entries.sort((a, b) => (a[1] ?? 100) - (b[1] ?? 100));
  const axes = sorted.slice(0, 2).map(([k, v]) => ({
    title: AXIS_LABELS[k] || k,
    advice: `${v != null ? Math.round(v) : '—'}/100 sur la période — concentre-toi sur cet axe lors des prochaines sorties.`,
  }));
  if (axes.length === 0) axes.push({ title: 'Continuer sur cette voie', advice: 'Ta conduite est régulière — garde le cap.' });
  const summary = (m.overall ?? 0) >= 75
    ? 'Ta conduite est globalement sereine sur la période — continue ainsi.'
    : 'Plusieurs axes méritent ton attention sur la période — choisis-en un pour progresser pas à pas.';
  return { summary, axes: axes.slice(0, 3), source: 'fallback' };
}

function buildPrompt({ mode, kpis, errors }: any) {
  if (mode === 'trip') {
    return `Tu es Feelgood, moniteur de conduite bienveillant. À partir des KPI et des erreurs détectées sur UN trajet, rédige un mini-bilan pédagogique : une phrase de synthèse (encourageante, jamais punitive) et 2 à 3 axes d'amélioration concrets et actionables.

Données (JSON) :
${JSON.stringify({ kpis, errors })}

Réponds UNIQUEMENT par un objet JSON : { "summary": string, "axes": [{ "title": string, "advice": string }] }. Pas plus de 3 axes. Pas de jargon ni de scores dans le texte. Ton bienveillant, direct et concret.`;
  }
  return `Tu es Feelgood, moniteur de conduite bienveillant. À partir des KPI agrégés sur une période (maîtrise par axe, erreurs récurrentes, progression hebdomadaire), rédige un plan d'action pédagogique : une phrase de synthèse et 2 à 3 axes prioritaires avec un conseil concret pour chacun.

Données (JSON) :
${JSON.stringify({ kpis })}

Réponds UNIQUEMENT par un objet JSON : { "summary": string, "axes": [{ "title": string, "advice": string }] }. Pas plus de 3 axes. Ton bienveillant et concret.`;
}

export async function generateCoachReview(base44: any, payload: { mode: string; kpis?: any; errors?: any }) {
  const fallback = coachFallback(payload);
  try {
    const prompt = buildPrompt(payload);
    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        axes: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, advice: { type: 'string' } },
            required: ['title', 'advice'],
          },
        },
      },
      required: ['summary', 'axes'],
    };
    const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: 'automatic' });
    const data = res && (res as any).data ? (res as any).data : res;
    const summary = typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : fallback.summary;
    let axes = Array.isArray(data.axes) ? data.axes.filter((a: any) => a && a.title && a.advice).slice(0, 3) : [];
    if (axes.length === 0) axes = fallback.axes;
    return { summary, axes, source: 'llm' };
  } catch (e: any) {
    console.warn('[kpiEngine] fallback coach:', e?.message);
    return fallback;
  }
}