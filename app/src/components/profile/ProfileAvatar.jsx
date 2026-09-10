import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Lock } from 'lucide-react';
import { REWARDS } from '@/lib/challenges';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function ProfileAvatar({ user, onUpdate }) {
  const unlockedRewards = user?.unlocked_rewards || [];
  const activeReward = user?.active_reward || null;
  const [saving, setSaving] = useState(false);

  const handleSelect = async (rewardId) => {
    if (!unlockedRewards.includes(rewardId)) {
      toast.error('Complétez le défi pour débloquer ce visuel !');
      return;
    }
    const next = activeReward === rewardId ? null : rewardId;
    setSaving(true);
    await base44.auth.updateMe({ active_reward: next });
    onUpdate?.({ ...user, active_reward: next });
    toast.success(next ? `Visuel "${REWARDS[next].label}" activé !` : 'Visuel retiré');
    setSaving(false);
  };

  const active = activeReward ? REWARDS[activeReward] : null;

  return (
    <div className="space-y-5">
      {/* Avatar preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          {active ? (
            <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${active.gradient} p-0.5 shadow-lg`}>
              <div className="w-full h-full rounded-[22px] bg-card flex items-center justify-center">
                <User className="w-9 h-9 text-foreground" />
              </div>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-3xl bg-secondary border border-border flex items-center justify-center">
              <User className="w-9 h-9 text-muted-foreground" />
            </div>
          )}
          {active && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-base shadow">
              {active.emoji}
            </div>
          )}
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{user?.full_name || 'Utilisateur'}</p>
          {active ? (
            <p className="text-xs text-primary font-medium">{active.emoji} {active.label}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Aucun visuel actif</p>
          )}
        </div>
      </div>

      {/* Reward grid */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Visuels profil</h4>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(REWARDS).map((reward) => {
            const isUnlocked = unlockedRewards.includes(reward.id);
            const isActive = activeReward === reward.id;

            return (
              <motion.button
                key={reward.id}
                whileTap={{ scale: 0.92 }}
                onClick={() => handleSelect(reward.id)}
                disabled={saving}
                className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                  isActive
                    ? 'border-primary bg-primary/10 shadow-[0_0_10px_rgba(200,242,48,0.2)]'
                    : isUnlocked
                    ? 'border-border hover:border-primary/40 bg-card'
                    : 'border-border bg-secondary/20 opacity-50 cursor-default'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${reward.gradient} p-0.5 ${!isUnlocked ? 'grayscale opacity-40' : ''}`}>
                  <div className="w-full h-full rounded-[10px] bg-card flex items-center justify-center text-lg">
                    {isUnlocked ? reward.emoji : <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>
                <span className="text-xs text-center leading-tight font-medium text-muted-foreground">
                  {isUnlocked ? reward.label : '???'}
                </span>
                {isActive && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-[7px] text-primary-foreground font-black">✓</span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center italic">
        Complétez des défis pour débloquer de nouveaux visuels exclusifs
      </p>
    </div>
  );
}