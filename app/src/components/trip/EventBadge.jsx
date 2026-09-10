import React from 'react';
import { 
  AlertTriangle, 
  Zap, 
  CornerUpRight, 
  Gauge, 
  CircleStop, 
  CircleDot,
  Smartphone,
  ThumbsUp
} from 'lucide-react';

const eventConfig = {
  harsh_braking: { icon: AlertTriangle, label: 'Freinage brusque', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  harsh_acceleration: { icon: Zap, label: 'Accélération brusque', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  sharp_turn: { icon: CornerUpRight, label: 'Virage brusque', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  speeding: { icon: Gauge, label: 'Excès de vitesse', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  stop_respected: { icon: CircleStop, label: 'STOP respecté', color: 'bg-primary/15 text-primary border-primary/20' },
  stop_violated: { icon: CircleStop, label: 'STOP non respecté', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  roundabout_good: { icon: CircleDot, label: 'Rond-point OK', color: 'bg-primary/15 text-primary border-primary/20' },
  roundabout_poor: { icon: CircleDot, label: 'Rond-point à améliorer', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  phone_usage: { icon: Smartphone, label: 'Téléphone', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  good_anticipation: { icon: ThumbsUp, label: 'Bonne anticipation', color: 'bg-primary/15 text-primary border-primary/20' },
};

export default function EventBadge({ event, showDetails = false }) {
  const config = eventConfig[event.event_type] || eventConfig.harsh_braking;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${config.color} transition-all`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{config.label}</p>
        {showDetails && event.description && (
          <p className="text-xs opacity-70 mt-0.5 truncate">{event.description}</p>
        )}
      </div>
      {event.speed_kmh && (
        <span className="text-xs font-mono opacity-60">{event.speed_kmh} km/h</span>
      )}
    </div>
  );
}