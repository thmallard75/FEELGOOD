import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ChevronRight, Lock } from 'lucide-react';
import { BADGES, BADGE_CATEGORIES, computeUnlockedBadges, computeBadgeProgress, computeDriverLevel } from '@/lib/badges';

function DriverLevelBar({ trips }) {
  const { label, nextLabel, progress, level } = computeDriverLevel(trips);
  const stars = Math.min(level + 1, 5);

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{label}</span>
          </div>
          {nextLabel && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Prochain niveau : <span className="text-primary font-medium">{nextLabel}</span>
            </p>
          )}
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`text-base ${i < stars ? 'text-primary' : 'text-muted-foreground/30'}`}>★</span>
          ))}
        </div>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      {nextLabel && (
        <p className="text-xs text-muted-foreground mt-1.5 text-right">{Math.round(progress * 100)}%</p>
      )}
    </div>
  );
}

function BadgePill({ badge, unlocked, progress }) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative">
      <motion.button
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowTip(v => !v)}
        className={`relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all w-full ${
          unlocked
            ? 'bg-card border-primary/30 shadow-[0_0_12px_rgba(200,242,48,0.1)]'
            : 'bg-secondary/30 border-border opacity-50'
        }`}
        aria-label={`${badge.label} — ${unlocked ? 'débloqué' : 'verrouillé'}`}
      >
        <span className={`text-2xl ${unlocked ? '' : 'grayscale opacity-40'}`}>{badge.emoji}</span>
        <span className="text-xs font-medium text-center leading-tight text-foreground">{badge.label}</span>

        {/* Barre de progression pour badges non débloqués */}
        {!unlocked && progress > 0 && (
          <div className="w-full h-1 rounded-full bg-secondary mt-0.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        {unlocked && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
            <span className="text-[8px] text-primary-foreground font-bold">✓</span>
          </div>
        )}
        {!unlocked && (
          <Lock className="absolute -top-1 -right-1 w-3 h-3 text-muted-foreground" />
        )}
      </motion.button>

      {/* Tooltip */}
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-3 rounded-xl bg-popover border border-border shadow-xl text-xs text-muted-foreground leading-relaxed"
            onClick={() => setShowTip(false)}
          >
            <p className="font-semibold text-foreground mb-1">{badge.emoji} {badge.label}</p>
            <p>{badge.description}</p>
            {!unlocked && progress > 0 && (
              <p className="text-primary font-medium mt-1">{Math.round(progress * 100)}% accompli</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BadgesSection({ trips }) {
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);

  const unlocked = computeUnlockedBadges(trips);
  const unlockedIds = new Set(unlocked.map(b => b.id));

  const filteredBadges = activeCategory
    ? BADGES.filter(b => b.category === activeCategory)
    : BADGES;

  const visibleBadges = expanded ? filteredBadges : filteredBadges.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Niveau conducteur */}
      <DriverLevelBar trips={trips} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Badges</h3>
          <span className="text-xs text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-full">
            {unlocked.length}/{BADGES.length}
          </span>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? 'Réduire' : 'Voir tout'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Filtres par catégorie */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveCategory(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
            !activeCategory ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          Tous
        </button>
        {BADGE_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              activeCategory === cat.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Grille de badges */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {visibleBadges.map((badge, i) => (
          <BadgePill
            key={badge.id}
            badge={badge}
            unlocked={unlockedIds.has(badge.id)}
            progress={computeBadgeProgress(badge, trips)}
          />
        ))}
      </div>

      {!expanded && filteredBadges.length > 8 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl transition-colors"
        >
          +{filteredBadges.length - 8} badges à débloquer
        </button>
      )}
    </div>
  );
}