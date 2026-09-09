import React from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const AXES = [
  { key: 'anticipation', label: 'Anticipation' },
  { key: 'stop', label: 'Arrêts' },
  { key: 'speed', label: 'Vitesse' },
  { key: 'smoothness', label: 'Fluidité' },
  { key: 'attention', label: 'Attention' },
];

export default function RadarAxes({ mastery }) {
  const data = AXES.map(a => ({ subject: a.label, value: Math.round(mastery?.[a.key] ?? 0) }));
  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-4">Profil de conduite — tes axes</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="hsl(0 0% 20%)" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'hsl(0 0% 55%)' }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Score" dataKey="value" stroke="#C8F230" fill="#C8F230" fillOpacity={0.2} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}