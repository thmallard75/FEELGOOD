import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import {
  GraduationCap, RefreshCw, Target, AlertTriangle, Sparkles,
  Eye, Gauge, Zap, Smartphone, Route, TrendingDown,
} from 'lucide-react';
import AxisGauge from '../components/coach/AxisGauge';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';

const PERIODS = [
  { id: 'week', label: '7 jours' },
  { id: 'month', label: '30 jours' },
];

const AXIS_META = {
  anticipation: { label: 'Anticipation aux carrefours', icon: Eye },
  stop: { label: 'Respect des arrêts', icon: AlertTriangle },
  speed: { label: 'Adaptation de la vitesse', icon: Gauge },
  smoothness: { label: 'Douceur de conduite', icon: Zap },
  attention: { label: 'Attention au volant', icon: Smartphone },
};

const LEVEL_STYLES = {
  critique: { ring: 'border-red-500/40 bg-red-500/5', text: 'text-red-400', label: 'Critique' },
  serieux: { ring: 'border-orange-500/40 bg-orange-500/5', text: 'text-orange-400', label: 'Sérieux' },
  corriger: { ring: 'border-amber-400/30 bg-amber-400/5', text: 'text-amber-300', label: 'À corriger' },
  mineur: { ring: 'border-border bg-secondary/30', text: 'text-muted-foreground', label: 'Mineur' },
};

export default function Coaching() {
  const [period, setPeriod] = useState('week');
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['coaching', period],
    queryFn: () => base44.functions.invoke('computeCoaching', { period }),
  });
  const { pullDistance, isRefreshing } = usePullToRefresh(refetch);

  const review = data?.data?.review;
  const k = review?.kpis || {};
  const m = k.mastery || {};
  const recurring = k.recurring_errors || [];
  const weeks = k.weeks || [];
  const axes = review?.axes || [];

  return (
    <div className="space-y-5">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2.5">
            <GraduationCap className="w-7 h-7 text-primary" /> Mon moniteur
          </h1>
          <p className="text-sm text-muted-foreground mt-1">KPI de conduite & axes d'amélioration, façon auto-école</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === p.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : !review ? (
        <div className="p-10 rounded-2xl bg-card border border-border text-center">
          <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">Pas encore assez de trajets</p>
          <p className="text-sm text-muted-foreground mt-1">Reviens après quelques sorties pour ton bilan moniteur.</p>
        </div>
      ) : (
        <>
          {/* Synthèse + plan d'action */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl bg-card border border-primary/20"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Synthèse du moniteur</h2>
                <p className="text-xs text-muted-foreground">{k.period?.trips || 0} trajet{(k.period?.trips || 0) > 1 ? 's' : ''} · {k.period?.km || 0} km</p>
              </div>
            </div>
            <p className="text-sm text-foreground leading-relaxed mb-4">{review.summary}</p>

            {axes.length > 0 && (
              <div className="pt-3 border-t border-border/40">
                <p className="text-xs font-semibold text-primary mb-3">Plan d'action</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {axes.map((a, i) => (
                    <div key={i} className="p-3 rounded-xl bg-secondary/30 border border-border">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <Target className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <p className="text-xs font-semibold text-foreground">{a.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{a.advice}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Maîtrise par axe */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h2 className="text-sm font-semibold text-foreground mb-3">Maîtrise par axe</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {['anticipation', 'stop', 'speed', 'smoothness', 'attention'].map(key => {
                const meta = AXIS_META[key];
                const v = m[key];
                return (
                  <AxisGauge
                    key={key}
                    label={meta.label}
                    icon={meta.icon}
                    value={v}
                    hint={v == null ? 'Non rencontré sur la période' : undefined}
                  />
                );
              })}
            </div>
          </motion.div>

          {/* KPI détaillés */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-sm font-semibold text-foreground mb-3">KPI détaillés</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-card border border-border">
                <Eye className="w-4 h-4 text-muted-foreground mb-2" />
                <p className="text-2xl font-bold text-primary">{k.anticipation?.zone1_pct ?? '—'}%</p>
                <p className="text-xs text-muted-foreground">Ronds-points Zone 1</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{k.anticipation?.roundabouts || 0} ronds-points</p>
              </div>
              <div className="p-4 rounded-2xl bg-card border border-border">
                <AlertTriangle className="w-4 h-4 text-muted-foreground mb-2" />
                <p className="text-2xl font-bold text-primary">{k.stops?.respected_pct ?? '—'}%</p>
                <p className="text-xs text-muted-foreground">Stops respectés</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{k.stops?.total || 0} arrêts détectés</p>
              </div>
              <div className="p-4 rounded-2xl bg-card border border-border">
                <Gauge className="w-4 h-4 text-muted-foreground mb-2" />
                <p className={`text-2xl font-bold ${(k.speed?.excess_count || 0) > 0 ? 'text-orange-400' : 'text-primary'}`}>{k.speed?.excess_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">Excès de vitesse</p>
              </div>
              <div className="p-4 rounded-2xl bg-card border border-border">
                <Zap className="w-4 h-4 text-muted-foreground mb-2" />
                <p className={`text-2xl font-bold ${(k.smoothness?.harsh_total || 0) > 0 ? 'text-orange-400' : 'text-primary'}`}>{k.smoothness?.harsh_total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Freinages/Accél.</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{k.smoothness?.per_km ?? '—'} /km</p>
              </div>
            </div>
          </motion.div>

          {/* Progression 6 semaines */}
          {weeks.some(w => w.score != null) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-primary" /> Progression — 6 dernières semaines
              </h2>
              <div className="p-4 rounded-2xl bg-card border border-border">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weeks} margin={{ top: 10, right: 10, bottom: 5, left: -15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#888' }} />
                    <Tooltip
                      contentStyle={{ background: '#161616', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                      formatter={(v, n) => v == null ? ['—', n] : [`${Math.round(v)}`, n]}
                    />
                    <ReferenceLine y={70} stroke="#C8F23040" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="score" name="Indice" stroke="#C8F230" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="anticipation" name="Anticipation" stroke="#60a5fa" strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="speed" name="Vitesse" stroke="#fbbf24" strokeWidth={1.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-3 text-xs text-muted-foreground mt-2 justify-center flex-wrap">
                  <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-primary rounded" /> Indice global</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-blue-400 rounded" /> Anticipation</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-amber-400 rounded" /> Vitesse</div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Erreurs récurrentes */}
          {recurring.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h2 className="text-sm font-semibold text-foreground mb-3">Ce qui revient sur la période</h2>
              <div className="space-y-2">
                {recurring.map((e, i) => {
                  const st = LEVEL_STYLES[e.level] || LEVEL_STYLES.mineur;
                  const label = AXIS_META[e.category]?.label || e.category;
                  return (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${st.ring}`}>
                      <div className="flex items-center gap-2.5">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${st.text} px-2 py-0.5 rounded-full ${st.ring}`}>{st.label}</span>
                        <span className="text-sm text-foreground">{label}</span>
                      </div>
                      <span className="text-sm font-bold text-muted-foreground">{e.count}×</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {review.source === 'fallback' && (
            <p className="text-xs text-muted-foreground/40 italic text-center">
              Bilan généré sans IA — clique sur « Actualiser » pour une analyse enrichie.
            </p>
          )}
        </>
      )}
    </div>
  );
}