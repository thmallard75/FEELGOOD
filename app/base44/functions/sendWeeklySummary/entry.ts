import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Vocabulaire Feelgood — version backend (src/lib/feelgoodVocab n'est pas importable côté serveur)
const CATEGORIES = {
  anticipation: {
    label: 'Anticipation aux carrefours',
    mastered: 'bonne anticipation aux ronds-points',
    consolidate: 'Commencer à ralentir un peu plus tôt à l’approche des ronds-points.',
  },
  stop: {
    label: 'Respect des arrêts',
    mastered: 'arrêts abordés sereinement',
    consolidate: 'Marquer un peu mieux l’arrêt aux stops et cédez-le-passage.',
  },
  speed: {
    label: 'Adaptation de la vitesse',
    mastered: 'vitesse bien adaptée aux limitations',
    consolidate: 'Adapter un peu mieux ta vitesse aux limitations et au contexte.',
  },
  smoothness: {
    label: 'Douceur de conduite',
    mastered: 'conduite souple et fluide',
    consolidate: 'Rendre tes freinages et accélérations plus progressifs.',
  },
  attention: {
    label: 'Attention au volant',
    mastered: 'téléphone au repos, regard sur la route',
    consolidate: 'Continuer à garder le téléphone de côté pendant la conduite.',
  },
};

const CAT_ORDER = ['anticipation', 'stop', 'speed', 'smoothness', 'attention'];

function catScore(trip, key) {
  if (key === 'attention') {
    const d = trip.distraction_summary?.scorePenalty || 0;
    const f = trip.fatigue_summary?.scorePenalty || 0;
    return Math.max(0, 100 - d - f);
  }
  return trip[`${key}_score`];
}

function serenityLabel(s) {
  if (s == null) return 'indicatif';
  if (s >= 80) return 'sereine';
  if (s >= 60) return 'stable';
  if (s >= 45) return 'à apaiser';
  return 'à accompagner';
}

function summarize(trips) {
  const n = trips.length;
  const totalKm = trips.reduce((s, t) => s + (t.distance_km || 0), 0);
  const totalMin = trips.reduce((s, t) => s + (t.duration_minutes || 0), 0);
  const scores = trips.map(t => t.overall_score).filter(x => x != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const catAvgs = {};
  for (const key of CAT_ORDER) {
    let vals;
    if (key === 'anticipation') {
      vals = trips.filter(t => (t.roundabouts_count || 0) > 0).map(t => t.anticipation_score).filter(v => v != null);
    } else if (key === 'stop') {
      vals = trips.filter(t => ((t.stops_respected || 0) + (t.stops_violated || 0)) > 0).map(t => t.stop_score).filter(v => v != null);
    } else {
      vals = trips.map(t => catScore(t, key)).filter(v => v != null);
    }
    if (vals.length) catAvgs[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  const strengths = Object.keys(catAvgs)
    .filter(k => catAvgs[k] >= 80)
    .sort((a, b) => catAvgs[b] - catAvgs[a])
    .map(k => ({ key, score: catAvgs[k] }));

  const sortedLow = Object.keys(catAvgs).sort((a, b) => catAvgs[a] - catAvgs[b]);
  const consolidateKey = sortedLow[0];
  const consolidate = consolidateKey && catAvgs[consolidateKey] < 80
    ? { key: consolidateKey, score: catAvgs[consolidateKey] }
    : null;

  const moments = trips.reduce((s, t) => ({
    harshBraking: s.harshBraking + (t.harsh_braking_count || 0),
    harshAccel: s.harshAccel + (t.harsh_acceleration_count || 0),
    speeding: s.speeding + (t.speeding_count || 0),
    phoneSec: s.phoneSec + (t.phone_usage_seconds || 0),
  }), { harshBraking: 0, harshAccel: 0, speeding: 0, phoneSec: 0 });

  const advices = trips.flatMap(t => t.ai_comments || []).slice(0, 3);

  return { n, totalKm, totalMin, avgScore, catAvgs, strengths, consolidate, moments, advices };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function progressRow(key, score) {
  const pct = Math.max(3, Math.min(100, score ?? 0));
  const color = score == null ? '#6b7280' : score >= 80 ? '#C8F230' : score >= 60 ? '#F2C230' : '#F28C30';
  return `
    <tr>
      <td style="padding:6px 0;color:#e5e7eb;font-size:13px">${esc(CATEGORIES[key].label)}</td>
      <td style="padding:6px 0;text-align:right;font-weight:600;color:#fff;font-size:13px">${score == null ? '—' : score + '/100'}</td>
    </tr>
    <tr><td colspan="2" style="padding:0 0 10px 0">
      <div style="height:6px;border-radius:99px;background:#1f2937;overflow:hidden">
        <div style="height:6px;width:${pct}%;background:${color};border-radius:99px"></div>
      </div>
    </td></tr>`;
}

function buildEmail(name, trips, weekStart, weekEnd) {
  const sm = summarize(trips);
  const first = (name && name.trim()) ? esc(name.trim().split(' ')[0]) : 'Bonjour';
  const periode = `${weekStart.toLocaleDateString('fr-FR')} → ${weekEnd.toLocaleDateString('fr-FR')}`;
  const strengthsHtml = sm.strengths.length
    ? sm.strengths.map(s => `<li style="margin:4px 0;color:#e5e7eb;font-size:13px">✓ ${esc(CATEGORIES[s.key].mastered)} <span style="color:#9ca3af">(${s.score}/100)</span></li>`).join('')
    : `<li style="color:#9ca3af;font-size:13px">Aucun point fort marqué cette semaine — l’évolution viendra avec les prochains trajets.</li>`;
  const consolidateHtml = sm.consolidate
    ? `<p style="color:#9ca3af;font-size:13px;margin:6px 0 0 0">Ce semaine, ton axe de progression : <br><span style="color:#F2C230;font-weight:600">${esc(CATEGORIES[sm.consolidate.key].label)} (${sm.consolidate.score}/100)</span></p>
       <p style="color:#e5e7eb;font-size:13px;margin:8px 0 0 0">→ ${esc(CATEGORIES[sm.consolidate.key].consolidate)}</p>`
    : `<p style="color:#C8F230;font-size:13px;margin:6px 0 0 0">Toutes tes catégories sont au vert cette semaine, bravo !</p>`;
  const adviceHtml = sm.advices.length
    ? sm.advices.map(a => `<li style="margin:4px 0;color:#e5e7eb;font-size:13px">💡 ${esc(a)}</li>`).join('')
    : `<li style="color:#9ca3af;font-size:13px">Continue à observer la route avec anticipation.</li>`;
  const progressHtml = CAT_ORDER.filter(k => sm.catAvgs[k] != null).map(k => progressRow(k, sm.catAvgs[k])).join('');

  const body = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#0d0d0d;border:1px solid #1f2937;border-radius:16px;overflow:hidden">
  <div style="background:#C8F230;padding:22px 24px">
    <div style="font-size:11px;letter-spacing:1px;color:#131700;text-transform:uppercase;font-weight:700">Feelgood Conduite</div>
    <div style="font-size:20px;font-weight:800;color:#131700;margin-top:2px">Ton bilan de conduite</div>
    <div style="font-size:13px;color:#131700;opacity:.8;margin-top:2px">${periode}</div>
  </div>
  <div style="padding:24px">
    <p style="color:#e5e7eb;font-size:15px;margin:0 0 4px 0">${first},</p>
    <p style="color:#9ca3af;font-size:13px;margin:0 0 18px 0">Voici un aperçu bienveillant de ta semaine au volant — pas de jugement, juste tes progrès et quelques pistes douces pour continuer.</p>

    <div style="background:#161616;border:1px solid #1f2937;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Indice de sérénité de la semaine</div>
      <div style="font-size:40px;font-weight:800;color:#C8F230;line-height:1.1;margin:4px 0">${sm.avgScore == null ? '—' : sm.avgScore}<span style="font-size:16px;color:#9ca3af;font-weight:500">/100</span></div>
      <div style="font-size:13px;color:#fff">${esc(serenityLabel(sm.avgScore))}</div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div style="flex:1;background:#161616;border:1px solid #1f2937;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#fff">${sm.n}</div><div style="font-size:11px;color:#9ca3af">trajets</div>
      </div>
      <div style="flex:1;background:#161616;border:1px solid #1f2937;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#fff">${Math.round(sm.totalKm)}</div><div style="font-size:11px;color:#9ca3af">km</div>
      </div>
      <div style="flex:1;background:#161616;border:1px solid #1f2937;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#fff">${Math.round(sm.totalMin)}</div><div style="font-size:11px;color:#9ca3af">min</div>
      </div>
    </div>

    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0">Tes points forts</div>
    <ul style="list-style:none;padding:0;margin:0 0 14px 0">${strengthsHtml}</ul>

    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0">Ton axe de progression</div>
    ${consolidateHtml}

    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px 0">Détail par catégorie</div>
    <table style="width:100%;border-collapse:collapse">${progressHtml}</table>

    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:10px 0 8px 0">Conseils personnalisés</div>
    <ul style="list-style:none;padding:0;margin:0 0 18px 0">${adviceHtml}</ul>

    <div style="background:#161616;border:1px solid #1f2937;border-radius:10px;padding:12px;margin:6px 0 18px 0">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Moments repérés en route</div>
      <div style="color:#e5e7eb;font-size:13px;line-height:1.7">
        Freinages marqués : <b>${sm.moments.harshBraking}</b><br>
        Accélérations marquées : <b>${sm.moments.harshAccel}</b><br>
        Vitesses à surveiller : <b>${sm.moments.speeding}</b><br>
        Téléphone (durée) : <b>${Math.round(sm.moments.phoneSec)}s</b>
      </div>
    </div>

    <p style="color:#6b7280;font-size:12px;margin:14px 0 0 0;line-height:1.5">Un regard sur la conduite, pas sur la destination. Tes trajets détaillés restent privés, ce résumé ne contient aucune destination ni itinéraire.</p>
    <p style="color:#6b7280;font-size:11px;margin:10px 0 0 0">Tu peux désactiver ce résumé à tout moment dans ton profil Feelgood.</p>
  </div>
</div>
</body></html>`;
  return { subject: `Ton bilan de conduite Feelgood — ${periode}`, html: body };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const targetEmail = body?.email;
    const all = !!body?.all;

    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    // Rassemble les trajets par utilisateur
    const byUser = new Map();

    if (all) {
      const trips = await sr.entities.Trip.list('-created_date', 1000) || [];
      for (const t of trips) {
        if (!t.start_time || new Date(t.start_time) < since || t.status === 'recording') continue;
        const uid = t.created_by_id;
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid).push(t);
      }
    } else {
      let user = null;
      if (targetEmail) {
        const users = await sr.entities.User.filter({ email: targetEmail }) || [];
        user = users[0];
        if (!user) return Response.json({ error: 'user not found' }, { status: 404 });
      } else {
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        user = me;
      }
      const trips = await sr.entities.Trip.filter({ created_by_id: user.id }) || [];
      for (const t of trips) {
        if (!t.start_time || new Date(t.start_time) < since || t.status === 'recording') continue;
        if (!byUser.has(user.id)) byUser.set(user.id, []);
        byUser.get(user.id).push(t);
      }
      // conserver l'email/nom même si aucun trajet
      if (!byUser.has(user.id)) byUser.set(user.id, { __user: user, trips: [] });
    }

    let sent = 0;
    let recipients = 0;

    for (const [uid, payload] of byUser) {
      const trips = Array.isArray(payload) ? payload : payload.trips;
      let email, name;
      if (!all && !Array.isArray(payload) && payload.__user) {
        email = payload.__user.email;
        name = payload.__user.full_name;
      } else {
        try {
          const u = await sr.entities.User.get(uid);
          email = u?.email;
          name = u?.full_name;
        } catch { continue; }
      }
      if (!email) continue;
      recipients++;
      const { subject, html } = buildEmail(name || '', trips, since, now);
      try {
        await sr.integrations.Core.SendEmail({ to: email, subject, body: html });
        sent++;
      } catch (e) { /* skip individual failure */ }
    }

    return Response.json({ sent, recipients, scope: all ? 'all' : 'single' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}