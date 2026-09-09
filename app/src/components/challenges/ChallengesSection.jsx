import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Clock, ChevronRight, Gift } from 'lucide-react';
import { CHALLENGES, REWARDS, evaluateChallenge } from '@/lib/challenges';
import { format, addDays, startOfDay, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';

const CATEGORY_COLORS = {
  douceur:     'from-blue-500/20 to-cyan-500/10 border-blue-500/20',
  anticipation:'from-primary/20 to-primary/5 border-primary/20',
  stops:       'from-red-500/20 to-orange-500/10 border-red-500/20',
  score:       'from-yellow-400/20 to-amber-400/10 border-yellow-400/20',
  vigilance:   'from-purple-500/20 to-indigo-500/10 border-purple-500/20',
  distance:    'from-emerald-500/20 to-teal-500/10 border-emerald-500/20',
};

function ChallengeCard({ challenge, progress, completed, unlockedRewards }) {
  const reward = REWARDS[challenge.rewardId];
  const isRewardUnlocked = unlockedRewards.includes(challenge.rewardId);
  const colorClass = CATEGORY_COLORS[challenge.category] || 'from-muted/30 to-muted/10 border-border';

  // Deadline = aujourd'hui + windowDays (fenêtre glissante)
  const deadline = addDays(new Date(), challenge.windowDays);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative p-4 rounded-2xl border bg-gradient-to-br ${colorClass} overflow-hidden`}
    >
      {/* Completed overlay */}
      {completed && (
        <div className="absolute inset-0 bg-primary/5 rounded-2xl flex items-center justify-end pr-4 pointer-events-none">
          <span className="text-3xl opacity-20">✓</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-2xl flex-shrink-0 mt-0.5">{challenge.emoji}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-foreground">{challenge.label}</span>
            {completed && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold">COMPLÉTÉ ✓</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{challenge.description}</p>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(progress * 100)}% accompli</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {challenge.windowDays}j
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-black/20 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${completed ? 'bg-primary' : 'bg-white/50'}`}
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {/* Reward */}
        <div className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl ${
          isRewardUnlocked ? 'bg-primary/20 border border-primary/30' : 'bg-black/20 border border-white/10'
        }`}>
          <span className={`text-lg ${isRewardUnlocked ? '' : 'grayscale opacity-40'}`}>{reward.emoji}</span>
          <span className="text-xs text-center leading-tight font-medium text-muted-foreground max-w-[44px]">
            {isRewardUnlocked ? reward.label : '???'}
          </span>
          {!isRewardUnlocked && (
            <Gift className="w-2.5 h-2.5 text-muted-foreground/50" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function ChallengesSection({ trips, user }) {
  const [showAll, setShowAll] = useState(false);
  const unlockedRewards = user?.unlocked_rewards || [];

  const evaluated = CHALLENGES.map(ch => ({
    ...ch,
    ...evaluateChallenge(ch, trips),
  }));

  // Trier : en cours d'abord (par progression desc), complétés en dernier
  const sorted = [...evaluated].sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    return b.progress - a.progress;
  });

  const visible = showAll ? sorted : sorted.slice(0, 4);
  const completedCount = evaluated.filter(c => c.completed).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">Défis actifs</h3>
          {completedCount > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
              {completedCount} complété{completedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAll(v => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {showAll ? 'Réduire' : `Voir tout (${CHALLENGES.length})`}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted-foreground">
        Relevez des défis temporaires pour débloquer des visuels exclusifs pour votre profil. Les défis se renouvellent en continu.
      </p>

      {/* Cards */}
      <div className="space-y-3">
        {visible.map(ch => (
          <ChallengeCard
            key={ch.id}
            challenge={ch}
            progress={ch.progress}
            completed={ch.completed}
            unlockedRewards={unlockedRewards}
          />
        ))}
      </div>

      {!showAll && sorted.length > 4 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl transition-colors"
        >
          +{sorted.length - 4} défis supplémentaires
        </button>
      )}
    </div>
  );
}