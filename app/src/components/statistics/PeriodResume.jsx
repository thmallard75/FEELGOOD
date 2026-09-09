import React from 'react';
import { Clock, Route, RotateCw, ShieldCheck } from 'lucide-react';

export default function PeriodResume({ kpis }) {
  const items = [
    { icon: Route, label: 'km parcourus', value: kpis?.period?.km ?? 0 },
    { icon: RotateCw, label: 'ronds-points', value: kpis?.anticipation?.roundabouts ?? 0 },
    { icon: ShieldCheck, label: 'arrêts respectés', value: kpis?.stops?.respected_pct != null ? `${kpis.stops.respected_pct}%` : '—' },
    { icon: Clock, label: 'excès vitesse', value: kpis?.speed?.excess_count ?? 0 },
  ];
  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-4">Résumé période</h3>
      <div className="grid grid-cols-2 gap-4">
        {items.map((it, i) => (
          <div key={i} className="p-4 rounded-xl bg-secondary/30 text-center">
            <it.icon className="w-4 h-4 text-muted-foreground mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{it.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}