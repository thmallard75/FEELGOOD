import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const COLORS = ['#C8F230', '#F2C230', '#F28C30', '#3B82F6', '#8B8F98'];

export default function MomentsBreakdown({ kpis }) {
  const data = [
    { name: 'Ronds-points', value: kpis?.anticipation?.roundabouts || 0 },
    { name: 'Arrêts', value: kpis?.stops?.total || 0 },
    { name: 'Excès vitesse', value: kpis?.speed?.excess_count || 0 },
    { name: 'Freinages/Accél.', value: kpis?.smoothness?.harsh_total || 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-4">Répartition de tes moments repérés</h3>
      {data.length > 0 ? (
        <div className="flex items-center gap-6">
          <div className="h-48 w-48 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-muted-foreground">{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-12">Pas de moments repérés sur la période</p>
      )}
    </div>
  );
}