import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, Loader2, Feather, Gauge, PhoneOff, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

/**
 * Bilan de conduite — écran de fin de trajet pédagogique (vocabulaire Feelgood).
 * Les compteurs (freinages, accélérations, distractions) sont calculés côté backend
 * par analyzeTrip ; on charge le trajet et on poll tant que l'analyse est en cours.
 */
export default function BilanConduite({ tripResult, counts, onDetail, onNewTrip }) {
  const tripId = tripResult?.tripId;
  const liveGps = counts?.gpsPointsCount || 0;

  const { data: trip } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => base44.entities.Trip.filter({ id: tripId }),
    enabled: !!tripId,
    refetchInterval: (query) => {
      const t = query.state.data?.[0];
      return (t?.status === 'pending_analysis' || t?.status === 'syncing' || t?.status === 'pending_osm') ? 3000 : false;
    },
  });
  const t = trip?.[0];

  const analyzing = !t || t.status === 'pending_analysis' || t.status === 'syncing' || t.status === 'pending_osm';
  const braking = t?.harsh_braking_count || 0;
  const accel = t?.harsh_acceleration_count || 0;
  const distraction = t?.distraction_summary?.count || 0;
  const gps = t?.gps_points_count || liveGps || 0;

  const repères = [
    { icon: Feather, label: 'Freinages marqués', value: braking, positif: braking === 0, positifTxt: 'freinages souples' },
    { icon: Gauge, label: 'Accélérations marquées', value: accel, positif: accel === 0, positifTxt: 'accélérations progressives' },
    { icon: PhoneOff, label: 'Moments de distraction', value: distraction, positif: distraction === 0, positifTxt: 'téléphone au repos' },
    { icon: MapPin, label: 'Points GPS collectés', value: gps, positif: gps >= 50, positifTxt: 'trace bien captée', neutre: true },
  ];

  const cleanCount = repères.filter(r => r.positif && !r.neutre).length;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="w-full max-w-md flex flex-col items-center gap-6 text-center"
      >
        <CheckCircle2 className="w-20 h-20 text-primary" strokeWidth={1.5} />

        <div>
          <h1 className="text-2xl font-bold text-foreground">Bilan de conduite</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tripResult.distKm} km · {tripResult.durationMin} min · merci pour ce trajet
          </p>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed max-w-sm">
          Premier aperçu de ton trajet. L'analyse complète (anticipation, arrêts, vitesse) arrive dans quelques instants sur la fiche détaillée.
        </p>

        {/* Analyse en cours / terminée */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm w-full max-w-sm ${
          analyzing ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-primary/5 border-primary/10 text-muted-foreground'
        }`}>
          {analyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span className="text-left">Analyse en cours — l'indice de sérénité et les détails arrivent sur la fiche.</span>
            </>
          ) : (
            <span className="text-left">Analyse terminée — retrouve le détail sur la fiche.</span>
          )}
        </div>

        {/* Moments repérés (calculés côté backend) */}
        <div className="w-full space-y-2 text-left">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Ce qu'on a repéré en route
          </p>
          <div className="grid grid-cols-2 gap-3">
            {repères.map((r, i) => (
              <motion.div
                key={r.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="p-3 rounded-xl bg-card border border-border"
              >
                <r.icon className={`w-4 h-4 mb-1.5 ${r.positif ? 'text-primary' : 'text-amber-400'}`} />
                {r.neutre ? (
                  <p className="text-lg font-bold text-foreground">{analyzing ? '…' : r.value}</p>
                ) : r.positif ? (
                  <p className="text-sm font-semibold text-primary leading-tight">{r.positifTxt}</p>
                ) : (
                  <p className="text-lg font-bold text-amber-400">{analyzing ? '…' : r.value}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{r.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <Button
            onClick={onDetail}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Voir le détail
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <Button variant="outline" onClick={onNewTrip} className="flex-1">
            Nouveau trajet
          </Button>
        </div>
      </motion.div>
    </div>
  );
}