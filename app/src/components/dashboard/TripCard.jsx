import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Gauge, ChevronRight, Route } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Extrait la ville depuis une adresse complète
function extractCity(address) {
  if (!address) return '?';
  // Format: "12 Rue X, 67000, Strasbourg" → prendre la dernière partie
  const parts = address.split(',');
  const city = parts[parts.length - 1]?.trim();
  return city || parts[0]?.trim() || address;
}

export default function TripCard({ trip, index = 0 }) {
  const getScoreBg = (s) => {
    if (s >= 70) return 'bg-primary/15 text-primary';
    if (s >= 50) return 'bg-yellow-400/15 text-yellow-400';
    if (s >= 35) return 'bg-orange-400/15 text-orange-400';
    return 'bg-secondary text-muted-foreground';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <Link
        to={`/trips/${trip.id}`}
        className="block p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-300 group"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted-foreground font-medium">
                {trip.start_time ? format(new Date(trip.start_time), "EEEE d MMMM • HH:mm", { locale: fr }) : 'Date inconnue'}
              </span>
            </div>
            {/* Départ → Arrivée forme courte */}
            {(trip.start_address || trip.end_address) ? (
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">
                  {extractCity(trip.start_address)} → {extractCity(trip.end_address)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">Départ → Arrivée</span>
              </div>
            )}
            
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Route className="w-3.5 h-3.5" />
                <span>{trip.distance_km?.toFixed(1) || '0'} km</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{trip.duration_minutes || '0'} min</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gauge className="w-3.5 h-3.5" />
                <span>{trip.avg_speed_kmh?.toFixed(0) || '0'} km/h</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${getScoreBg(trip.overall_score || 0)}`}>
              {trip.overall_score || '-'}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}