import React from 'react';

export default function AxisGauge({ label, value, icon: Icon, hint }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 75 ? '#C8F230' : v >= 60 ? '#F2C230' : '#ef4444';
  return (
    <div className="p-3 rounded-xl bg-card border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
          <span className="text-xs text-muted-foreground truncate">{label}</span>
        </div>
        <span className="text-sm font-bold text-foreground">{value == null ? '—' : Math.round(v)}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${v}%`, background: color }} />
      </div>
      {hint && <p className="text-xs text-muted-foreground/60 mt-1.5">{hint}</p>}
    </div>
  );
}