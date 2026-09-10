import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { GraduationCap, RefreshCw, Target, AlertTriangle, Sparkles } from 'lucide-react';

const LEVEL_STYLES = {
  critique: { ring: 'border-red-500/40 bg-red-500/5', text: 'text-red-400', label: 'Critique', dot: 'bg-red-500' },
  serieux: { ring: 'border-orange-500/40 bg-orange-500/5', text: 'text-orange-400', label: 'Sérieux', dot: 'bg-orange-500' },
  corriger: { ring: 'border-amber-400/30 bg-amber-400/5', text: 'text-amber-300', label: 'À corriger', dot: 'bg-amber-400' },
  mineur: { ring: 'border-border bg-secondary/30', text: 'text-muted-foreground', label: 'Mineur', dot: 'bg-muted-foreground' },
};

function KpiChip({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/60">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none">{label}</p>
        <p className={`text-sm font-bold leading-tight ${accent || 'text-foreground'}`}>{value}</p>
      </div>
    </div>
  );
}

export default function CoachReviewCard({ tripId, initial }) {
  const [review, setReview] = useState(initial || null);
  const [loading, setLoading] = useState(!initial);
  const queryClient = useQueryClient();

  const generate = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('computeCoaching', { tripId });
      if (res?.data?.review) setReview(res.data.review);
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (e) {
      // silent — l'utilisateur voit juste le spinner s'arrêter
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initial) {
      setReview(initial);
      setLoading(false);
    } else if (tripId) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, tripId]);

  if (loading && !review) {
    return (
      <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Le moniteur analyse ton trajet…</span>
      </div>
    );
  }
  if (!review) return null;

  const k = review.kpis || {};
  const errors = review.errors || [];
  const axes = review.axes || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-2xl bg-card border border-primary/20"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Le regard du moniteur</h3>
            <p className="text-xs text-muted-foreground">Bilan pédagogique de ce trajet</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading} className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40" aria-label="Rafraîchir">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-sm text-foreground leading-relaxed mb-4">{review.summary}</p>

      {/* KPI chips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {k.roundabouts?.count > 0 && (
          <KpiChip icon={Target} label="Ronds-points Zone 1" value={`${k.roundabouts.zone1_pct ?? '—'}%`} accent="text-primary" />
        )}
        {k.roundabouts?.avg_entry_speed != null && (
          <KpiChip icon={Target} label="Vitesse d'entrée moy." value={`${k.roundabouts.avg_entry_speed} km/h`} accent={k.roundabouts.avg_entry_speed > 34 ? 'text-orange-400' : 'text-primary'} />
        )}
        {k.stops?.count > 0 && (
          <KpiChip icon={AlertTriangle} label="Stops respectés" value={`${Math.round((k.stops.respected / k.stops.count) * 100)}%`} accent="text-primary" />
        )}
        {k.speed?.excess_count > 0 && (
          <KpiChip icon={AlertTriangle} label="Excès de vitesse" value={k.speed.excess_count} accent="text-orange-400" />
        )}
        {(k.smoothness?.harsh_braking + k.smoothness?.harsh_acceleration) > 0 && (
          <KpiChip icon={AlertTriangle} label="Freinages/Accél." value={k.smoothness.harsh_braking + k.smoothness.harsh_acceleration} accent="text-orange-400" />
        )}
        {k.attention && (
          <KpiChip icon={AlertTriangle} label="Attention" value={`${k.attention.score}/100`} accent={k.attention.score >= 80 ? 'text-primary' : 'text-orange-400'} />
        )}
      </div>

      {/* Erreurs hiérarchisées */}
      {errors.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-foreground mb-2">Points repérés</p>
          <div className="space-y-1.5">
            {errors.slice(0, 5).map((e, i) => {
              const st = LEVEL_STYLES[e.level] || LEVEL_STYLES.mineur;
              return (
                <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${st.ring}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot} mt-1.5 flex-shrink-0`} />
                  <div className="min-w-0">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${st.text}`}>{st.label}</span>
                    <p className="text-xs text-foreground leading-snug">{e.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Axes d'amélioration */}
      {axes.length > 0 && (
        <div className="pt-3 border-t border-border/40">
          <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Axes pour progresser
          </p>
          <div className="space-y-2.5">
            {axes.map((a, i) => (
              <div key={i} className="flex gap-2.5">
                <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{a.advice}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {review.source === 'fallback' && (
        <p className="text-xs text-muted-foreground/40 italic mt-3">Bilan généré sans IA — relance pour une analyse enrichie.</p>
      )}
    </motion.div>
  );
}