import React from 'react';
import { motion } from 'framer-motion';
import { Circle } from 'lucide-react';

export default function StatCard({ icon: Icon = Circle, label, value, unit, trend, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * index, duration: 0.4 }}
      className="p-4 rounded-xl bg-card border border-border"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-primary" />
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend > 0 ? 'bg-primary/10 text-primary' : 'bg-amber-400/10 text-amber-300'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground">
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}