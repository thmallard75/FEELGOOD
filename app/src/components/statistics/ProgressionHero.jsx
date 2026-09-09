import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Route, Gauge, Shield } from 'lucide-react';

function Delta({ value }) {
  if (value == null || value === 0) {
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Minus className="w-3.5 h-3.5" /> stable vs période précédente</span>;
  }
  const up = value > 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-primary' : 'text-orange-400'}`}>
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{Math.round(value)} pts vs période précédente
    </span>
  );
}

function Chip({ icon: Icon, label, value, unit }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary/40 border border-border/60">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none">{label}</p>
        <p className="text-sm font-bold text-foreground leading-tight">{value}{unit}</p>
      </div>
    </div>
  );
}

export default function ProgressionHero({ kpis, delta }) {
  const overall = kpis?.mastery?.overall ?? null;
  const p = kpis?.period;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-2xl bg-card border border-border">
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-3xl font-bold text-primary">{overall != null ? Math.round(overall) : '—'}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Indice moyen</p>
            <p className="text-lg font-bold text-foreground">sur la période</p>
            <div className="mt-1"><Delta value={delta?.overall} /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
          <Chip icon={Route} label="Trajets" value={p?.trips ?? 0} />
          <Chip icon={Gauge} label="Distance" value={p?.km ?? 0} unit=" km" />
          <Chip icon={Shield} label="% sereins" value={kpis?.serene_pct ?? '—'} unit={kpis?.serene_pct != null ? '%' : ''} />
          <Chip icon={TrendingUp} label="Attention" value={Math.round(kpis?.mastery?.attention ?? 0)} unit="/100" />
        </div>
      </div>
    </motion.div>
  );
}