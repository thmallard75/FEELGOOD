import React from 'react';
import { motion } from 'framer-motion';
import { Circle } from 'lucide-react';

export default function ScoreCategory({ icon: Icon = Circle, label, score, index = 0 }) {
  const getColor = (s) => {
    if (s >= 80) return 'bg-primary/20 text-primary';
    if (s >= 60) return 'bg-yellow-500/20 text-yellow-400';
    if (s >= 40) return 'bg-orange-500/20 text-orange-400';
    return 'bg-red-500/20 text-red-400';
  };

  const getBarColor = (s) => {
    if (s >= 80) return 'bg-primary';
    if (s >= 60) return 'bg-yellow-400';
    if (s >= 40) return 'bg-orange-400';
    return 'bg-red-400';
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 * index, duration: 0.4 }}
      className="flex items-center gap-4 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColor(score)}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
          <span className="text-sm font-bold text-foreground ml-2">{score}</span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${getBarColor(score)}`}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 + 0.1 * index }}
          />
        </div>
      </div>
    </motion.div>
  );
}