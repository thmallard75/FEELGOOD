import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Zap, Gauge, CircleDot, OctagonX, ThumbsUp, Smartphone } from 'lucide-react';

const EVENT_CONFIG = {
  harsh_braking:       { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Freinage brusque' },
  harsh_acceleration:  { icon: Zap,           color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Accélération brusque' },
  speeding:            { icon: Gauge,          color: 'text-red-400', bg: 'bg-red-500/10', label: 'Excès de vitesse' },
  roundabout_good:     { icon: CircleDot,      color: 'text-primary', bg: 'bg-primary/10', label: 'Rond-point OK' },
  roundabout_poor:     { icon: CircleDot,      color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Rond-point à améliorer' },
  roundabout_dangerous:{ icon: CircleDot,      color: 'text-red-400', bg: 'bg-red-500/10', label: 'Rond-point dangereux' },
  stop_respected:      { icon: OctagonX,       color: 'text-primary', bg: 'bg-primary/10', label: 'STOP respecté' },
  stop_violated:       { icon: OctagonX,       color: 'text-red-400', bg: 'bg-red-500/10', label: 'STOP non respecté' },
  good_anticipation:   { icon: ThumbsUp,       color: 'text-primary', bg: 'bg-primary/10', label: 'Bonne anticipation' },
  phone_usage:         { icon: Smartphone,     color: 'text-red-400', bg: 'bg-red-500/10', label: 'Téléphone détecté' },
};

export default function LiveEventFeed({ events = [], maxItems = 5 }) {
  const significantEvents = events
    .filter(e => Object.keys(EVENT_CONFIG).includes(e.event_type))
    .slice(-maxItems)
    .reverse();

  if (significantEvents.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">Aucun événement pour le moment</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <AnimatePresence initial={false}>
        {significantEvents.map((event, i) => {
          const cfg = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.harsh_braking;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={`${event.event_type}_${event.timestamp}_${i}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${cfg.bg}`}
            >
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color}`} />
              <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
              {event.speed_kmh && (
                <span className="text-xs text-muted-foreground ml-auto">{Math.round(event.speed_kmh)} km/h</span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}