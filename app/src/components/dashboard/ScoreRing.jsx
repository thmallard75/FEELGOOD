import React from 'react';
import { motion } from 'framer-motion';

export default function ScoreRing({ score, size = 200, strokeWidth = 10, label = "Indice de sérénité" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const getScoreColor = (s) => {
    if (s >= 80) return '#C8F230';
    if (s >= 60) return '#F2C230';
    if (s >= 40) return '#F28C30';
    return '#F23030';
  };

  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(0 0% 14%)"
            strokeWidth={strokeWidth}
          />
          {/* Score circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span 
            className="text-5xl font-bold text-foreground"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            {score}
          </motion.span>
          <span className="text-xs text-muted-foreground font-medium mt-1">/ 100</span>
        </div>
        {/* Glow effect */}
        <div 
          className="absolute inset-0 rounded-full opacity-20 blur-xl"
          style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-3 font-medium">{label}</p>
    </div>
  );
}