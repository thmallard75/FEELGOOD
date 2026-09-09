import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-primary">{payload[0].value}{p?.trips != null ? ` · ${p.trips} trajet(s)` : ''}</p>
    </div>
  );
};

const colorFor = s => s >= 80 ? '#C8F230' : s >= 60 ? '#F2C230' : s >= 40 ? '#F28C30' : '#8B8F98';

export default function ScoreHistory({ weeks }) {
  const data = (weeks || []).map(w => ({ label: w.label, score: w.score ?? 0, trips: w.trips }));
  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-4">Évolution de l'indice — 6 semaines</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(0 0% 55%)' }} />
            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(0 0% 55%)' }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {data.map((e, i) => <Cell key={i} fill={colorFor(e.score)} fillOpacity={e.trips ? 0.85 : 0.25} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}