import React from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  AlertTriangle, Zap, Gauge, CircleDot, OctagonX,
  ThumbsUp, Smartphone, Wifi, WifiOff, CheckCircle
} from 'lucide-react';
import { formatRoundaboutRating, formatStopRating, formatConfidence } from '@/lib/gpsEngine';

const EVENT_CONFIG = {
  harsh_braking:        { icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: 'Freinage brusque' },
  harsh_acceleration:   { icon: Zap,           color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Accélération brusque' },
  speeding:             { icon: Gauge,          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: 'Excès de vitesse' },
  stop_respected:       { icon: OctagonX,       color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20',    label: 'STOP respecté' },
  stop_violated:        { icon: OctagonX,       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: 'STOP non respecté' },
  roundabout_good:      { icon: CircleDot,      color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20',    label: 'Rond-point' },
  roundabout_poor:      { icon: CircleDot,      color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Rond-point' },
  roundabout_dangerous: { icon: CircleDot,      color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: 'Rond-point' },
  phone_usage:          { icon: Smartphone,     color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: 'Téléphone' },
  good_anticipation:    { icon: ThumbsUp,       color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20',    label: 'Bonne anticipation' },
  gps_lost:             { icon: WifiOff,        color: 'text-muted-foreground', bg: 'bg-secondary/30', border: 'border-border', label: 'GPS perdu' },
  gps_resumed:          { icon: Wifi,           color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20',    label: 'GPS rétabli' },
};

function RoundaboutDetail({ detail }) {
  if (!detail?.rating) return null;
  const rating = formatRoundaboutRating(detail.rating);
  return (
    <div className="mt-2 space-y-1 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Anticipation :</span>
        <span className={rating.color}>{rating.emoji} {rating.text}</span>
      </div>
      {detail.entry_speed_kmh != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Vitesse entrée :</span>
          <span className={detail.entry_speed_kmh > 34 ? 'text-red-400' : 'text-primary'}>
            {Math.round(detail.entry_speed_kmh)} km/h
            {detail.entry_speed_kmh > 34 ? ' ⚠️ > 34 km/h' : ' ✅'}
          </span>
        </div>
      )}
      {detail.speed_at_150m != null && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
          <span className="text-muted-foreground">À 150m : {Math.round(detail.speed_at_150m)} km/h</span>
          {detail.speed_at_100m != null && <span className="text-muted-foreground">À 100m : {Math.round(detail.speed_at_100m)} km/h</span>}
          {detail.speed_at_65m != null && <span className="text-muted-foreground">À 65m : {Math.round(detail.speed_at_65m)} km/h</span>}
        </div>
      )}
    </div>
  );
}

function StopDetail({ detail }) {
  if (!detail?.rating) return null;
  const rating = formatStopRating(detail.rating);
  return (
    <div className="mt-2 space-y-1 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Résultat :</span>
        <span className={rating.color}>{rating.emoji} {rating.text}</span>
      </div>
      {detail.min_speed_kmh != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Vitesse min :</span>
          <span className={detail.min_speed_kmh <= 3 ? 'text-primary' : detail.min_speed_kmh <= 8 ? 'text-yellow-400' : 'text-red-400'}>
            {Math.round(detail.min_speed_kmh * 10) / 10} km/h
          </span>
        </div>
      )}
    </div>
  );
}

export default function EventTimeline({ events = [] }) {
  const significantEvents = events.filter(e => EVENT_CONFIG[e.event_type]);

  if (significantEvents.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="w-8 h-8 text-primary mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">Trajet exemplaire</p>
        <p className="text-xs text-muted-foreground mt-1">Aucun événement notable détecté</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Ligne verticale */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-3">
        {significantEvents.map((event, i) => {
          const cfg = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.harsh_braking;
          const Icon = cfg.icon;
          const confidence = event.confidence ? formatConfidence(event.confidence) : null;

          return (
            <motion.div
              key={event.id || i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex gap-4 relative"
            >
              {/* Icône */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 z-10 border ${cfg.bg} ${cfg.border}`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>

              {/* Contenu */}
              <div className={`flex-1 p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${cfg.color}`}>
                    {cfg.label}
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {confidence && (
                      <span className={`text-xs ${confidence.color}`}>
                        {confidence.text}
                      </span>
                    )}
                    {event.timestamp && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(new Date(event.timestamp), 'HH:mm:ss')}
                      </span>
                    )}
                  </div>
                </div>

                {event.description && (
                  <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                )}

                {event.speed_kmh != null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Vitesse : {Math.round(event.speed_kmh)} km/h
                    {event.speed_limit_kmh && ` (limite : ${event.speed_limit_kmh} km/h)`}
                  </p>
                )}

                {event.acceleration_value != null && (
                  <p className="text-xs text-muted-foreground">
                    Décelération : {Math.abs(Math.round(event.acceleration_value * 100) / 100)} m/s²
                  </p>
                )}

                {/* Détails ronds-points */}
                {event.roundabout_detail && (
                  <RoundaboutDetail detail={event.roundabout_detail} />
                )}

                {/* Détails stops */}
                {event.stop_detail && (
                  <StopDetail detail={event.stop_detail} />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}