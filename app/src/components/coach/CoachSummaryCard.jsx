import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { GraduationCap, ArrowRight, RefreshCw, Eye, AlertTriangle, Gauge, Zap, Smartphone } from 'lucide-react';

const AXIS_META = {
  anticipation: { label: 'Anticipation', icon: Eye },
  stop: { label: 'Arrêts', icon: AlertTriangle },
  speed: { label: 'Vitesse', icon: Gauge },
  smoothness: { label: 'Douceur', icon: Zap },
  attention: { label: 'Attention', icon: Smartphone },
};

export default function CoachSummaryCard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['coaching-summary', 'week'],
    queryFn: () => base44.functions.invoke('computeCoaching', { period: 'week' }),
  });
  const review = data?.data?.review;
  const m = review?.kpis?.mastery || {};
  const overall = m.overall ?? null;
  const recurring = review?.kpis?.recurring_errors || [];
  const topDefect = recurring[0];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-2xl bg-card border border-primary/20"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Ton moniteur — 7 derniers jours</h3>
            <p className="text-xs text-muted-foreground">Synthèse pédagogique de ta conduite</p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40" aria-label="Rafraîchir">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Le moniteur compile ta semaine…</span>
        </div>
      ) : !review ? (
        <p className="text-sm text-muted-foreground py-4">Pas encore assez de trajets pour un bilan moniteur. Reviens après quelques sorties.</p>
      ) : (
        <>
          <p className="text-sm text-foreground leading-relaxed mb-4">{review.summary}</p>

          {/* Maîtrise par axe — mini jauges */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {['anticipation', 'stop', 'speed', 'smoothness', 'attention'].map(key => {
              const meta = AXIS_META[key];
              const v = m[key] ?? null;
              const pct = v == null ? 0 : Math.max(0, Math.min(100, v));
              const color = pct >= 75 ? '#C8F230' : pct >= 60 ? '#F2C230' : '#ef4444';
              return (
                <div key={key} className="text-center">
                  <div className="flex items-center justify-center mb-1.5">
                    <meta.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-1">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.label}</p>
                  <p className="text-xs font-bold text-foreground">{v == null ? '—' : Math.round(v)}</p>
                </div>
              );
            })}
          </div>

          {/* Top défaut */}
          {topDefect && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border/60 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Point récurrent : <span className="text-foreground font-medium">{AXIS_META[topDefect.category]?.label || topDefect.category}</span>{' '}
                <span className="text-muted-foreground/60">· {topDefect.count} fois</span>
              </p>
            </div>
          )}

          <Link
            to="/coach"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:gap-2.5 transition-all"
          >
            Voir mon plan d'action <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </>
      )}
    </motion.section>
  );
}