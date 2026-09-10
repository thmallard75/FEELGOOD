import React from 'react';

/**
 * Affiche le chronomètre du trajet et les métriques clés.
 */
export default function TripTimer({ elapsed = 0, distanceKm = 0, gpsPointsCount = 0 }) {
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="flex items-center gap-6">
      {/* Timer */}
      <div className="text-center">
        <p className="text-3xl font-black tabular-nums text-foreground font-mono">
          {hours > 0 && `${pad(hours)}:`}{pad(minutes)}:{pad(seconds)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Durée</p>
      </div>

      <div className="w-px h-10 bg-border" />

      {/* Distance */}
      <div className="text-center">
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {distanceKm.toFixed(2)}
          <span className="text-sm font-normal text-muted-foreground ml-1">km</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Distance</p>
      </div>

      <div className="w-px h-10 bg-border" />

      {/* Points GPS */}
      <div className="text-center">
        <p className="text-2xl font-bold tabular-nums text-primary">
          {gpsPointsCount}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Points GPS</p>
      </div>
    </div>
  );
}