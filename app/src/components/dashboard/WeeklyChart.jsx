import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-primary">{payload[0].value} pts</p>
    </div>
  );
};

export default function WeeklyChart({ data }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#C8F230" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#C8F230" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="day" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: 'hsl(0 0% 55%)' }} 
          />
          <YAxis 
            domain={[0, 100]} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: 'hsl(0 0% 55%)' }} 
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#C8F230"
            strokeWidth={2.5}
            fill="url(#scoreGradient)"
            dot={false}
            activeDot={{ r: 5, stroke: '#C8F230', strokeWidth: 2, fill: '#0A0A0A' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}