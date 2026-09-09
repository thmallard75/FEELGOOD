import React, { useState, useEffect } from 'react';
import { WifiOff, Trash2, ChevronDown, ChevronUp, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const OSM_LOG_KEY = 'osm_error_log';
const MAX_ENTRIES = 50;

export function logOsmError(type, lat, lng) {
  try {
    const existing = JSON.parse(localStorage.getItem(OSM_LOG_KEY) || '[]');
    const entry = {
      id: Date.now(),
      ts: new Date().toISOString(),
      type,
      lat: lat ? parseFloat(lat.toFixed(4)) : null,
      lng: lng ? parseFloat(lng.toFixed(4)) : null,
    };
    const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(OSM_LOG_KEY, JSON.stringify(updated));
  } catch { /* silencieux */ }
}

export function getOsmErrors() {
  try {
    return JSON.parse(localStorage.getItem(OSM_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

const TYPE_LABELS = {
  roundabouts: 'Ronds-points',
  speed_limits: 'Limitations',
  stops: 'Stops',
};

const TYPE_COLORS = {
  roundabouts: 'bg-orange-500/10 text-orange-400',
  speed_limits: 'bg-blue-500/10 text-blue-400',
  stops: 'bg-red-500/10 text-red-400',
};

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(errors) {
  const groups = {};
  for (const e of errors) {
    const day = new Date(e.ts).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }
  return groups;
}

export default function OsmErrorLog() {
  const [errors, setErrors] = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setErrors(getOsmErrors());
  }, [expanded]);

  const handleClear = () => {
    localStorage.removeItem(OSM_LOG_KEY);
    setErrors([]);
  };

  const groups = groupByDay(errors);
  const dayKeys = Object.keys(groups);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between min-h-[44px]"
      >
        <div className="flex items-center gap-3">
          <WifiOff className="w-4 h-4 text-muted-foreground" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Journal OSM</p>
            <p className="text-xs text-muted-foreground">
              {errors.length === 0
                ? 'Aucun échec enregistré'
                : `${errors.length} échec${errors.length > 1 ? 's' : ''} enregistré${errors.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {errors.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
              Aucun échec de connexion OSM détecté 🎉
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Effacer
                </Button>
              </div>

              <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                {dayKeys.map(day => (
                  <div key={day}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{day}</p>
                    <div className="space-y-1.5">
                      {groups[day].map(e => (
                        <div key={e.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-secondary/40">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS[e.type] || 'bg-muted text-muted-foreground'}`}>
                            {TYPE_LABELS[e.type] || e.type}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatTime(e.ts)}
                          </div>
                          {e.lat && e.lng && (
                            <div className="flex items-center gap-0.5 text-xs text-muted-foreground ml-auto">
                              <MapPin className="w-3 h-3" />
                              <span>{e.lat}, {e.lng}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {errors.length >= MAX_ENTRIES ? `Limité à ${MAX_ENTRIES} entrées` : `${errors.length} / ${MAX_ENTRIES} entrées`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}