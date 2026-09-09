import React from 'react';

function Row({ label, value, color = 'text-lime-300' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-xs text-zinc-500 flex-shrink-0">{label}</span>
      <span className={`text-xs font-mono truncate text-right ${color}`}>{value ?? '—'}</span>
    </div>
  );
}

function compassDir(deg) {
  if (deg == null) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

export default function OsmDebugPanel({ state }) {
  const {
    lastPosition,
    currentHeading,
    matchedSegment,
    currentSpeedLimit,
    nearbyRoundabout,
    approachingElement,
    lastOsmRefresh,
    lastFetchMs,
    gpsPointsCount,
  } = state || {};

  const stopNearby = approachingElement?.type === 'stop';
  const rbNearby = !!nearbyRoundabout;

  const fetchOk = lastOsmRefresh && !lastOsmRefresh.failed;
  const fetchFail = lastOsmRefresh?.failed;

  return (
    <div className="font-mono bg-zinc-950/95 border border-lime-500/20 rounded-xl p-3 space-y-1 text-left">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-lime-400 font-bold tracking-widest uppercase">OSM Debug</span>
        <span className="text-xs text-zinc-500">{gpsPointsCount ?? 0} pts GPS</span>
      </div>

      {/* GPS */}
      <Row label="GPS lat,lng"
        value={lastPosition ? `${lastPosition.lat.toFixed(5)}, ${lastPosition.lng.toFixed(5)}` : '—'} />
      <Row label="Cap"
        value={currentHeading != null ? `${Math.round(currentHeading)}° ${compassDir(currentHeading)}` : '—'} />

      <div className="border-t border-zinc-800 my-1" />

      {/* Route matchée */}
      <Row label="Route name"
        value={matchedSegment?.name || '(sans nom)'}
        color={matchedSegment?.name ? 'text-lime-300' : 'text-zinc-500'} />
      <Row label="highway"
        value={matchedSegment?.highway || '—'}
        color="text-sky-400" />
      <Row label="OSM id"
        value={matchedSegment?.osm_id ? `#${matchedSegment.osm_id}` : '—'}
        color="text-zinc-400" />
      <Row label="dist. segment"
        value={matchedSegment?.dist != null ? `${matchedSegment.dist}m` : '—'}
        color="text-zinc-400" />
      <Row label="maxspeed src"
        value={matchedSegment ? (matchedSegment.explicit ? 'OSM tag' : 'défaut FR') : '—'}
        color={matchedSegment?.explicit ? 'text-lime-400' : 'text-yellow-500'} />

      <div className="border-t border-zinc-800 my-1" />

      {/* Valeurs détectées */}
      <Row label="Limite vitesse"
        value={currentSpeedLimit ? `${currentSpeedLimit} km/h` : 'no information'}
        color={currentSpeedLimit ? 'text-lime-400 font-bold' : 'text-red-400'} />
      <Row label="Rond-point"
        value={rbNearby ? `✓ ${Math.round(nearbyRoundabout.dist ?? 0)}m` : '✗'}
        color={rbNearby ? 'text-orange-400' : 'text-zinc-600'} />
      <Row label="Stop sign"
        value={stopNearby ? `✓ ${Math.round(approachingElement.dist ?? 0)}m` : '✗'}
        color={stopNearby ? 'text-red-400' : 'text-zinc-600'} />

      <div className="border-t border-zinc-800 my-1" />

      {/* Temps réponse API */}
      <Row label="Fetch speed_limits"
        value={lastFetchMs?.speed_limits != null ? `${lastFetchMs.speed_limits}ms` : '—'}
        color={lastFetchMs?.speed_limits > 5000 ? 'text-red-400' : 'text-sky-400'} />
      <Row label="Fetch roundabouts"
        value={lastFetchMs?.roundabouts != null ? `${lastFetchMs.roundabouts}ms` : '—'}
        color={lastFetchMs?.roundabouts > 5000 ? 'text-red-400' : 'text-sky-400'} />
      <Row label="Fetch stops"
        value={lastFetchMs?.stops != null ? `${lastFetchMs.stops}ms` : '—'}
        color={lastFetchMs?.stops > 5000 ? 'text-red-400' : 'text-sky-400'} />
      <Row label="Dernier fetch"
        value={
          lastOsmRefresh
            ? `${lastOsmRefresh.type} ${fetchFail ? '✗ FAIL' : '✓ OK'}`
            : '—'
        }
        color={fetchFail ? 'text-red-400' : fetchOk ? 'text-lime-400' : 'text-zinc-500'} />
    </div>
  );
}