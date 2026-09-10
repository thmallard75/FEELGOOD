import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold = 72 }) {
  const progress = Math.min(pullDistance / threshold, 1);
  const show = pullDistance > 8 || isRefreshing;

  if (!show) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: `calc(env(safe-area-inset-top) + 52px + ${Math.min(pullDistance * 0.5, 36)}px)` }}
    >
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium shadow-lg transition-all ${
        isRefreshing ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'
      }`}>
        <RefreshCw
          className={`w-4 h-4 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
          style={{ transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)` }}
        />
        {isRefreshing ? 'Actualisation...' : progress >= 1 ? 'Relâcher pour actualiser' : 'Tirer pour actualiser'}
      </div>
    </div>
  );
}