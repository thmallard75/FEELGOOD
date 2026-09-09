import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Route, Clock, Gauge, AlertTriangle, Play } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import WeeklyChart from '../components/dashboard/WeeklyChart';
import TripCard from '../components/dashboard/TripCard';
import SerenityPanel from '../components/feelgood/SerenityPanel';
import TrustPact from '../components/feelgood/TrustPact';
import ChallengesSection from '../components/challenges/ChallengesSection';
import CoachSummaryCard from '../components/coach/CoachSummaryCard';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';


export default function Dashboard() {
  const { data: trips = [], isLoading, refetch } = useQuery({
    queryKey: ['trips'],
    queryFn: () => base44.entities.Trip.list('-start_time', 50),
    refetchInterval: (query) => query.state.data?.some(t => t.status === 'pending_analysis' || t.status === 'syncing') ? 5000 : false,
  });
  const { data: events = [] } = useQuery({
    queryKey: ['latest-events'],
    queryFn: () => base44.entities.DrivingEvent.list('-created_date', 30),
  });
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { pullDistance, isRefreshing } = usePullToRefresh(refetch);

  const syncingCount = trips.filter(t => t.status === 'pending_analysis' || t.status === 'syncing').length;
  const completedTrips = trips.filter(t => t.status === 'completed');
  const latestTrip = completedTrips[0] || trips[0];
  const previousTrip = completedTrips[1];

  const totalDistance = completedTrips.reduce((sum, t) => sum + (t.distance_km || 0), 0);
  const totalDuration = completedTrips.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
  const totalHarsh = completedTrips.reduce((sum, t) => sum + (t.harsh_braking_count || 0) + (t.harsh_acceleration_count || 0), 0);

  // Données hebdomadaires réelles (7 derniers jours)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const day = subDays(new Date(), 6 - i);
    const dayStart = startOfDay(day).getTime();
    const dayEnd = dayStart + 86400000;
    const dayTrips = completedTrips.filter(t => {
      const ts = t.start_time ? new Date(t.start_time).getTime() : 0;
      return ts >= dayStart && ts < dayEnd;
    });
    const score = dayTrips.length > 0
      ? Math.round(dayTrips.reduce((s, t) => s + (t.overall_score || 0), 0) / dayTrips.length)
      : 0;
    return {
      day: format(day, 'EEE', { locale: fr }).slice(0, 3),
      score,
    };
  });

  // Progression sur les 6 derniers trajets vs précédents
  const recent = completedTrips.slice(0, 6).reverse();
  const recentAvg = recent.length ? Math.round(recent.reduce((s, t) => s + (t.overall_score || 0), 0) / recent.length) : null;
  const olderTrips = completedTrips.slice(6);
  const olderAvg = olderTrips.length ? Math.round(olderTrips.reduce((s, t) => s + (t.overall_score || 0), 0) / olderTrips.length) : null;

  // « Ce que tu maîtrises » / « Ce que tu peux travailler » sur les derniers trajets
  const masteryAgg = { speed: [], smoothness: [], anticipation: [], stop: [] };
  for (const t of completedTrips.slice(0, 10)) {
    if (t.speed_score != null) masteryAgg.speed.push(t.speed_score);
    if (t.smoothness_score != null) masteryAgg.smoothness.push(t.smoothness_score);
    if (t.anticipation_score != null && (t.roundabouts_count || 0) > 0) masteryAgg.anticipation.push(t.anticipation_score);
    if (t.stop_score != null && ((t.stops_respected || 0) + (t.stops_violated || 0)) > 0) masteryAgg.stop.push(t.stop_score);
  }
  const avgOf = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const mastery = [
    { key: 'speed', score: avgOf(masteryAgg.speed), label: 'Vitesse bien adaptée' },
    { key: 'smoothness', score: avgOf(masteryAgg.smoothness), label: 'Conduite souple' },
    { key: 'anticipation', score: avgOf(masteryAgg.anticipation), label: 'Bonne anticipation' },
    { key: 'stop', score: avgOf(masteryAgg.stop), label: 'Arrêts bien négociés' },
  ].filter(m => m.score != null);

  const mastered = mastery.filter(m => m.score >= 75).map(m => m.label);
  const toWork = mastery.filter(m => m.score < 70).sort((a, b) => a.score - b.score).map(m => m.label).slice(0, 2);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

      {/* Bannière trajets en analyse */}
      {syncingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary"
        >
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>{syncingCount} trajet{syncingCount > 1 ? 's' : ''} en cours d'analyse — ton bilan se met à jour automatiquement</span>
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Mon bilan</h1>
          <p className="text-sm text-muted-foreground mt-1">Une conduite plus sereine, trajet après trajet</p>
        </div>
        <Link
          to="/record"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(200,242,48,0.25)] hover:shadow-[0_0_30px_rgba(200,242,48,0.4)]"
        >
          <Play className="w-4 h-4 fill-current" />
          <span className="hidden sm:block">Conduire</span>
        </Link>
      </motion.div>

      {/* Dernier bilan de conduite */}
      {latestTrip ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Dernier trajet — bilan de conduite</h2>
            <Link to={`/trips/${latestTrip.id}`} className="text-xs text-primary hover:underline">Voir le détail</Link>
          </div>
          <SerenityPanel trip={latestTrip} events={events.filter(e => e.trip_id === latestTrip.id)} previousScore={previousTrip?.overall_score} />
        </section>
      ) : (
        <div className="text-center py-16 rounded-2xl bg-card border border-border">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Route className="w-8 h-8 text-primary" />
          </div>
          <p className="text-foreground font-medium">Prêt pour un premier trajet ?</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">
            Feelgood analyse automatiquement ta conduite. Tes destinations restent privées.
          </p>
          <Link
            to="/record"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            Démarrer un trajet
          </Link>
        </div>
      )}

      {/* Regard du moniteur — synthèse agrégée */}
      <CoachSummaryCard />

      {/* Tendance hebdomadaire + progression */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Ton évolution — 7 derniers jours</h3>
          <WeeklyChart data={weeklyData} />
          <div className="flex items-center justify-center mt-3 gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">Indice quotidien moyen</span>
          </div>
          {recentAvg != null && olderAvg != null && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {recentAvg >= olderAvg
                ? 'Ta conduite est plus régulière depuis tes derniers trajets.'
                : 'Une légère baisse — reprends tes bonnes habitudes, rien de grave.'}
            </p>
          )}
        </div>

        {/* Ce que tu maîtrises / à travailler */}
        <div className="p-5 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Ta progression</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Ce que tu maîtrises</p>
              {mastered.length > 0 ? (
                <ul className="space-y-1.5">
                  {mastered.map((m, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <span className="text-primary">✓</span>{m}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Encore quelques trajets pour identifier tes points forts.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Ce que tu peux travailler</p>
              {toWork.length > 0 ? (
                <ul className="space-y-1.5">
                  {toWork.map((m, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <span className="text-yellow-400">→</span>{m}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Aucun point prioritaire pour le moment.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Défis actifs */}
      {completedTrips.length > 0 && (
        <section className="p-5 rounded-2xl bg-card border border-border">
          <ChallengesSection trips={completedTrips} user={user} />
        </section>
      )}

      {/* Stats clés (vocabulaire adouci) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border">
          <Route className="w-4 h-4 text-muted-foreground mb-2" />
          <p className="text-lg font-bold text-foreground">{totalDistance.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">km au compteur</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border">
          <Clock className="w-4 h-4 text-muted-foreground mb-2" />
          <p className="text-lg font-bold text-foreground">{Math.round(totalDuration)}</p>
          <p className="text-xs text-muted-foreground">min de conduite</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border">
          <Gauge className="w-4 h-4 text-muted-foreground mb-2" />
          <p className="text-lg font-bold text-foreground">{latestTrip?.avg_speed_kmh?.toFixed(0) || '0'}</p>
          <p className="text-xs text-muted-foreground">km/h (dernier trajet)</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border">
          <AlertTriangle className="w-4 h-4 text-muted-foreground mb-2" />
          <p className="text-lg font-bold text-foreground">{totalHarsh}</p>
          <p className="text-xs text-muted-foreground">moments repérés</p>
        </div>
      </div>

      {/* Derniers trajets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Derniers trajets</h3>
          <Link to="/trips" className="text-xs text-primary hover:underline">Voir tout</Link>
        </div>
        {trips.length > 0 ? (
          <div className="space-y-3">
            {trips.slice(0, 5).map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} />
            ))}
          </div>
        ) : null}
      </div>

      {/* Pacte de confiance */}
      <TrustPact />
    </div>
  );
}