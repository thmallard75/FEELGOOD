import React from 'react';
import { motion } from 'framer-motion';

/**
 * Affiche uniquement la vitesse actuelle en grand format.
 * Les limites OSM sont analysées en backend après le trajet.
 */
export default function SpeedMeter({ speed = 0 }) {
  const color = speed > 110 ? '#ef4444' : speed > 80 ? '#F2C230' : '#C8F230';

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-end justify-center">
        <motion.span
          key={Math.round(speed)}
          initial={{ scale: 0.9, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="text-7xl md:text-8xl font-black tabular-nums leading-none"
          style={{ color }}
        >
          {Math.round(speed)}
        </motion.span>
        <span className="text-xl font-medium mb-2 ml-1" style={{ color: 'hsl(0 0% 55%)' }}>
          km/h
        </span>
      </div>
    </div>
  );
}