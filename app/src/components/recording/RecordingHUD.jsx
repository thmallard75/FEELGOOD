import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

/**
 * Affiche le statut GPS en temps réel pendant l'enregistrement.
 * Les alertes OSM (stops, ronds-points) sont analysées en backend après le trajet.
 */
export default function RecordingHUD({ state }) {
  const { isPaused, gpsPointsCount = 0 } = state || {};

  if (isPaused) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
        <WifiOff className="w-4 h-4 text-orange-400 animate-pulse" />
        <span className="text-xs font-medium text-orange-400">GPS en pause — Signal perdu</span>
      </div>
    );
  }

  if (gpsPointsCount === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
        <Wifi className="w-4 h-4 text-yellow-400 animate-pulse" />
        <span className="text-xs font-medium text-yellow-400">Acquisition du signal GPS…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20">
      <Wifi className="w-4 h-4 text-primary" />
      <span className="text-xs font-medium text-primary">GPS actif</span>
      <span className="text-xs text-muted-foreground">· {gpsPointsCount} pts enregistrés</span>
    </div>
  );
}