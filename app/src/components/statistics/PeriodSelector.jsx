import React from 'react';

const PERIODS = [
  { key: '7', label: '7 jours' },
  { key: '30', label: '30 jours' },
  { key: '90', label: '90 jours' },
  { key: 'all', label: 'Tout' },
];

export default function PeriodSelector({ value, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl">
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            value === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}