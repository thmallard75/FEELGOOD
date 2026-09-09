import React from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Target } from 'lucide-react';

export default function AxesToProgress({ review }) {
  if (!review) return null;
  const axes = review.axes || [];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-2xl bg-card border border-primary/20">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Axes pour progresser</h3>
          <p className="text-xs text-muted-foreground">Plan d'action du moniteur</p>
        </div>
      </div>
      <p className="text-sm text-foreground leading-relaxed mb-4">{review.summary}</p>
      {axes.length > 0 && (
        <div className="space-y-2.5">
          {axes.map((a, i) => (
            <div key={i} className="flex gap-2.5">
              <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">{a.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{a.advice}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {review.source === 'fallback' && (
        <p className="text-xs text-muted-foreground/40 italic mt-3">Bilan généré sans IA — rafraîchis pour une analyse enrichie.</p>
      )}
    </motion.div>
  );
}