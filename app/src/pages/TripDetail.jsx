import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useParams } from 'react-router-dom';
import BackButton from '@/components/ui/BackButton';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Clock, Gauge, Route,
  AlertTriangle, Smartphone,
  Eye, ThumbsUp, Map, List, BarChart3,
  Shield, Zap, Activity, RefreshCw
} from 'lucide-react';
import ScoreRing from '../components/dashboard/ScoreRing';
import ScoreCategory from '../components/dashboard/ScoreCategory';
import TripMapView from '../components/trip/TripMapView';
import EventTimeline from '../components/trip/EventTimeline';
import RoundaboutDetailModal from '../components/trip/RoundaboutDetailModal';
import CoachReviewCard from '../components/coach/CoachReviewCard';
import SerenityPanel from '../components/feelgood/SerenityPanel';
import { computeOverallScore, computeScoreWeights, computeAnticipationScore, computeStopScore, computeSpeedScore, computeSmoothnessScore, formatRoundaboutRating, formatStopRating, getRoundaboutExplanation, getStopExplanation } from '@/lib/gpsEngine';

function NACategory({ icon: Icon, label, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 border border-border/40 opacity-50"
    >
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground truncate">{label}</span>
          <span className="text-xs italic text-muted-foreground/60 ml-2 flex-shrink-0">non applicable</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary/50 w-full" />
      </div>
    </motion.div>
  );
}

const TABS = [
  { id: 'overview', label: 'Vue générale', icon: BarChart3 },
  { id: 'map', label: 'Carte', icon: Map },
  { id: 'timeline', label: 'Événements', icon: List },
];

export default function TripDetail() {
  const { id: tripId } = useParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [reanalyzing, setReanalyzing] = useState(false);
  const [selectedRoundabout, setSelectedRoundabout] = useState(null);
  const queryClient = useQueryClient();

  const { data: trips = [], isLoading: loadingTrip } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => base44.entities.Trip.filter({ id: tripId }),
    refetchInterval: (data) => {
      const t = data?.[0];
      return t?.status === 'pending_analysis' || t?.status === 'syncing' || t?.status === 'pending_osm' ? 4000 : false;
    },
  });
  const trip = trips[0];

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['events', tripId],
    queryFn: () => base44.entities.DrivingEvent.filter({ trip_id: tripId }),
    enabled: !!tripId,
  });

  const isLoading = loadingTrip || loadingEvents;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isAnalyzing = trip?.status === 'pending_analysis';
  const isSyncing = trip?.status === 'syncing';
  const isPendingOsm = trip?.status === 'pending_osm';

  if (!trip) {
    return (
      <div className="text-center py-16">
        <p className="text-foreground font-medium">Trajet introuvable</p>
        <BackButton fallbackPath="/trips" label="Retour aux trajets" />
      </div>
    );
  }

  const roundaboutEvents = events.filter(e => e.event_type?.startsWith('roundabout'));
  const stopEvents = events.filter(e => e.event_type?.startsWith('stop'));

  const hasRoundabouts = roundaboutEvents.length > 0 || (trip.roundabouts_count || 0) > 0;
  const hasStops = stopEvents.length > 0 || (trip.stops_respected || 0) + (trip.stops_violated || 0) > 0;

  const fatiguePenalty = trip.fatigue_summary?.scorePenalty || 0;
  const distractionPenalty = trip.distraction_summary?.scorePenalty || 0;

  const anticipationScore = roundaboutEvents.length > 0
    ? computeAnticipationScore(roundaboutEvents)
    : (trip.anticipation_score ?? 100);
  const stopScore = stopEvents.length > 0
    ? computeStopScore(stopEvents)
    : (trip.stop_score ?? 100);

  const overallScore = trip.overall_score || computeOverallScore({
    anticipation_score: anticipationScore,
    stop_score: stopScore,
    speed_score: trip.speed_score,
    smoothness_score: trip.smoothness_score,
    distraction_penalty: distractionPenalty,
    fatigue_penalty: fatiguePenalty,
    hasRoundabouts,
    hasStops,
  });

  const weights = computeScoreWeights({ hasRoundabouts, hasStops });
  const attentionScore = Math.max(0, 100 - distractionPenalty - fatiguePenalty);
  const speedEvents = events.filter(e => e.event_type === 'speeding');
  const harshEvents = events.filter(e => ['harsh_braking', 'harsh_acceleration'].includes(e.event_type));

  const gpsQuality = trip.gps_points_count
    ? Math.round(((trip.gps_points_count - (trip.gps_low_precision_count || 0)) / trip.gps_points_count) * 100)
    : null;

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      const result = await base44.functions.invoke('analyzeTrip', { tripId });
      if (result.data?.osm_failed) {
        toast.error('OSM indisponible — réessaie dans quelques instants');
      } else {
        toast.success('Analyse OSM terminée avec succès');
      }
    } catch (err) {
      toast.error('Erreur analyse OSM : ' + (err.message || 'échec inconnu'));
    }
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    await queryClient.invalidateQueries({ queryKey: ['events', tripId] });
    setReanalyzing(false);
  };

  return (
    <div className="space-y-5">
      {(isAnalyzing || isSyncing || trip?.status === 'pending_osm') && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/30 text-sm text-primary"
        >
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>
            {trip?.status === 'pending_osm' 
              ? 'Analyse OSM échouée — les serveurs OpenStreetMap sont temporairement indisponibles. Réessaie "Relancer OSM" dans quelques instants…'
              : trip?.status === 'pending_analysis'
                ? 'Analyse en cours — récupération des données routières, détection et calcul des scores…'
                : 'Analyse OSM en cours — les scores et événements se mettront à jour automatiquement…'
            }
          </span>
        </motion.div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-3">
          <BackButton fallbackPath="/trips" label="Retour aux trajets" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Bilan de conduite</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {trip.start_time ? format(new Date(trip.start_time), "EEEE d MMMM yyyy · HH:mm", { locale: fr }) : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-all disabled:opacity-40"
            >
              {reanalyzing
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Analyse…</span></>
                : <><Zap className="w-3.5 h-3.5" /><span>Relancer OSM</span></>
              }
            </button>
            <div className="flex flex-col items-end gap-1">
              <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                overallScore >= 70 ? 'bg-primary/15 text-primary' :
                overallScore >= 50 ? 'bg-yellow-400/15 text-yellow-400' :
                overallScore >= 40 ? 'bg-orange-400/15 text-orange-400' : 'bg-secondary text-muted-foreground'
              }`}>
                {overallScore >= 70 ? 'Conduite sereine' : overallScore >= 50 ? 'Conduite stable' : overallScore >= 40 ? 'À apaiser' : 'À accompagner'}
              </span>
              <span className="text-xs text-muted-foreground">Indice {overallScore ?? '—'}/100</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:block">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB : VUE GÉNÉRALE ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <SerenityPanel trip={trip} events={events} previousScore={null} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Distance', value: `${trip.distance_km?.toFixed(1) || 0} km`, icon: Route },
              { label: 'Durée', value: `${trip.duration_minutes || 0} min`, icon: Clock },
              { label: 'Vitesse moy.', value: `${trip.avg_speed_kmh?.toFixed(0) || 0} km/h`, icon: Gauge },
              { label: 'Vitesse max', value: `${trip.max_speed_kmh?.toFixed(0) || 0} km/h`, icon: Activity },
            ].map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-3 rounded-xl bg-card border border-border"
              >
                <m.icon className="w-4 h-4 text-muted-foreground mb-2" />
                <p className="text-lg font-bold text-foreground">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5 rounded-2xl bg-card border border-border flex flex-col items-center justify-center gap-4">
              <ScoreRing score={overallScore} size={160} />
              <div className="w-full space-y-1.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-center mb-2">Pondération du trajet</p>
                {[
                  { label: 'Anticipation ronds-points', weight: weights.anticipation, score: hasRoundabouts ? anticipationScore : null, na: !hasRoundabouts },
                  { label: 'Respect STOP', weight: weights.stop, score: hasStops ? stopScore : null, na: !hasStops },
                  { label: 'Respect vitesses', weight: weights.speed, score: trip.speed_score },
                  { label: 'Douceur de conduite', weight: weights.smoothness, score: trip.smoothness_score },
                  { label: 'Téléphone & Fatigue', weight: weights.attention, score: attentionScore },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className={row.na ? 'text-muted-foreground/40 line-through' : ''}>
                      {row.label} <span className="text-muted-foreground/50">({row.weight}%)</span>
                    </span>
                    {row.na ? (
                      <span className="text-muted-foreground/40 italic text-xs">non applicable</span>
                    ) : (
                      <span className={`font-bold ${(row.score || 0) >= 80 ? 'text-primary' : (row.score || 0) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {row.score ?? 0}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-card border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">Scores par catégorie</h3>
              <div className="space-y-3" key={`${anticipationScore}-${stopScore}-${trip.speed_score}-${trip.smoothness_score}`}>
                {hasRoundabouts
                  ? <ScoreCategory icon={Eye} label="Anticipation ronds-points" score={anticipationScore} index={0} />
                  : <NACategory icon={Eye} label="Anticipation ronds-points" index={0} />
                }
                {hasStops
                  ? <ScoreCategory icon={AlertTriangle} label="Respect STOP" score={stopScore} index={1} />
                  : <NACategory icon={AlertTriangle} label="Respect STOP" index={1} />
                }
                <ScoreCategory icon={Gauge} label="Respect vitesses" score={trip.speed_score || 0} index={2} />
                <ScoreCategory icon={Zap} label="Douceur de conduite" score={trip.smoothness_score || 0} index={3} />
                <ScoreCategory icon={Smartphone} label="Téléphone & Fatigue" score={attentionScore} index={4} />
              </div>
            </div>
          </div>

          <CoachReviewCard tripId={trip.id} initial={trip.coach_review} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-card border border-border text-center">
              <p className="text-2xl font-bold text-foreground">
                {roundaboutEvents.length || trip.roundabouts_count || 0}
              </p>
              <p className="text-xs text-muted-foreground">Ronds-points</p>
              {(trip.roundabouts_good != null && (roundaboutEvents.length || trip.roundabouts_count)) ? (
                <p className="text-xs text-primary mt-0.5">{trip.roundabouts_good} bien passés</p>
              ) : null}
            </div>
            <div className="p-3 rounded-xl bg-card border border-border text-center">
              <p className="text-2xl font-bold text-foreground">
                {stopEvents.length || ((trip.stops_respected || 0) + (trip.stops_violated || 0))}
              </p>
              <p className="text-xs text-muted-foreground">Arrêts détectés</p>
              {(trip.stops_respected != null && (stopEvents.length || trip.stops_respected || trip.stops_violated)) ? (
                <p className="text-xs text-primary mt-0.5">{trip.stops_respected} respectés</p>
              ) : null}
            </div>
            <div className="p-3 rounded-xl bg-card border border-border text-center">
              <p className={`text-2xl font-bold ${speedEvents.length > 0 ? 'text-orange-400' : 'text-foreground'}`}>
                {speedEvents.length}
              </p>
              <p className="text-xs text-muted-foreground">Vitesses à surveiller</p>
            </div>
            <div className="p-3 rounded-xl bg-card border border-border text-center">
              <p className={`text-2xl font-bold ${harshEvents.length > 0 ? 'text-orange-400' : 'text-foreground'}`}>
                {harshEvents.length}
              </p>
              <p className="text-xs text-muted-foreground">Freinages/Accél.</p>
            </div>
          </div>

          {speedEvents.length > 0 && (
            <div className="p-4 rounded-xl bg-card border border-orange-500/20">
              <h3 className="text-sm font-semibold text-orange-400 mb-3">⚡ Vitesses à surveiller</h3>
              <div className="space-y-2">
                {speedEvents.map((e, i) => {
                  const d = e.speeding_detail;
                  return (
                    <div key={e.id || i} className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/5 border border-red-500/10 text-sm">
                      <div>
                        <span className="font-medium text-foreground">
                          {d?.start_time ? new Date(d.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                        </span>
                        <span className="text-muted-foreground ml-2">· Limite {d?.limit_kmh || e.speed_limit_kmh || '?'} km/h</span>
                      </div>
                      <span className="font-bold text-red-400">{Math.round(d?.max_speed_kmh || e.speed_kmh || 0)} km/h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {roundaboutEvents.length > 0 && (
            <div className="p-4 rounded-xl bg-card border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">🔄 Analyse ronds-points</h3>
              <div className="space-y-2">
                {roundaboutEvents.map((e, i) => {
                  const d = e.roundabout_detail;
                  const { text, color, emoji } = formatRoundaboutRating(d?.rating);
                  return (
                    <div key={e.id || i} className="p-3 rounded-lg bg-secondary/30 border border-border cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => setSelectedRoundabout(e)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">Rond-point #{i + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground/60">Appuyer pour détail</span>
                          <span className={`text-xs font-bold ${color}`}>{emoji} {text}</span>
                        </div>
                      </div>
                      {d && d.anticipation_zone ? (
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              d.anticipation_zone === 'zone1' ? 'bg-primary/20 text-primary' :
                              d.anticipation_zone === 'zone2' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {d.anticipation_zone === 'zone1' ? '✅ Zone 1 (150–100m)' :
                               d.anticipation_zone === 'zone2' ? '⚠️ Zone 2 (99–60m)' :
                               '🔴 Zone 3 (<60m)'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-xs text-center">
                            <div className="p-1.5 rounded bg-secondary/50">
                              <div className="font-bold text-sm text-foreground">{d.base_score}</div>
                              <div className="text-muted-foreground">Base zone</div>
                            </div>
                            <div className={`p-1.5 rounded bg-secondary/50 ${d.irregular_braking_penalty > 0 ? 'border border-red-500/30' : ''}`}>
                              <div className={`font-bold text-sm ${d.irregular_braking_penalty > 0 ? 'text-red-400' : 'text-primary'}`}>
                                {d.irregular_braking_penalty > 0 ? `-${d.irregular_braking_penalty}` : '✓'}
                              </div>
                              <div className="text-muted-foreground">Freinage</div>
                            </div>
                            <div className={`p-1.5 rounded bg-secondary/50 ${d.entry_speed_penalty > 0 ? 'border border-red-500/30' : ''}`}>
                              <div className={`font-bold text-sm ${d.entry_speed_penalty > 0 ? 'text-red-400' : 'text-primary'}`}>
                                {d.entry_speed_penalty > 0 ? `-${d.entry_speed_penalty}` : '✓'}
                              </div>
                              <div className="text-muted-foreground">
                                {d.speed_at_entry != null ? `${d.speed_at_entry} km/h` : 'Entrée'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/40">
                            <span className="text-xs text-muted-foreground">Score du rond-point</span>
                            <span className={`text-sm font-bold ${(d.roundabout_score ?? 0) >= 80 ? 'text-primary' : (d.roundabout_score ?? 0) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {d.roundabout_score ?? '—'}/100
                            </span>
                          </div>
                        </div>
                      ) : d && (
                        <div className="grid grid-cols-4 gap-1 text-xs text-center">
                          {[
                            { label: '150m', val: d.speed_at_150m },
                            { label: '100m', val: d.speed_at_100m },
                            { label: '65m', val: d.speed_at_65m },
                            { label: 'Entrée', val: d.speed_at_entry, danger: d.speed_at_entry > 35 },
                          ].map(z => z.val != null && (
                            <div key={z.label} className="p-1.5 rounded bg-secondary/50">
                              <div className={`font-bold text-sm ${z.danger ? 'text-red-400' : 'text-foreground'}`}>
                                {Math.round(z.val)} km/h
                              </div>
                              <div className="text-muted-foreground">{z.label}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground italic mt-2">{getRoundaboutExplanation(d)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stopEvents.length > 0 && (
            <div className="p-4 rounded-xl bg-card border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">🛑 Tes arrêts</h3>
              <div className="space-y-2">
                {stopEvents.map((e, i) => {
                  const d = e.stop_detail;
                  const { text, color, emoji } = formatStopRating(d?.rating);
                  return (
                    <div key={e.id || i} className="p-3 rounded-lg bg-secondary/30 border border-border flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-foreground">STOP #{i + 1}</span>
                        {d?.min_speed_kmh != null && (
                          <span className="text-xs text-muted-foreground ml-2">
                            · {Math.round(d.min_speed_kmh)} km/h au panneau
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground italic mt-0.5">{getStopExplanation(d)}</p>
                      </div>
                      <span className={`text-xs font-bold ${color}`}>{emoji} {text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Qualité des données</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Points GPS collectés</span>
                  <span className="font-medium">{trip.gps_points_count || '—'}</span>
                </div>
                {trip.gps_low_precision_count != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Points basse précision (&gt;20m)</span>
                    <span className={`font-medium ${trip.gps_low_precision_count > 0 ? 'text-orange-400' : 'text-primary'}`}>
                      {trip.gps_low_precision_count}
                    </span>
                  </div>
                )}
                {gpsQuality != null && (
                  <div className="flex justify-between items-center pt-1 border-t border-border">
                    <span className="text-muted-foreground">Niveau de confiance</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      gpsQuality >= 90 ? 'bg-primary/10 text-primary' :
                      gpsQuality >= 70 ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-orange-500/10 text-orange-400'
                    }`}>
                      {gpsQuality >= 90 ? 'Élevé' : gpsQuality >= 70 ? 'Moyen' : 'Faible'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {trip.road_types && (
              <div className="p-4 rounded-xl bg-card border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">Types de routes</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Urbain', value: trip.road_types.urban, emoji: '🏙️' },
                    { label: 'Périurbain', value: trip.road_types.periurban, emoji: '🌳' },
                    { label: 'Autoroute', value: trip.road_types.highway, emoji: '🛣️' },
                  ].map((rt) => (
                    <div key={rt.label} className="text-center p-2 rounded-lg bg-secondary/30">
                      <p className="text-lg mb-0.5">{rt.emoji}</p>
                      <p className="text-base font-bold text-foreground">{rt.value || 0}%</p>
                      <p className="text-xs text-muted-foreground">{rt.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {trip.fatigue_summary && trip.fatigue_summary.alertCount > 0 && (
            <div className={`p-4 rounded-xl bg-card border ${trip.fatigue_summary.alertCount >= 2 ? 'border-orange-500/40' : 'border-orange-500/20'}`}>
              <h3 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2">
                😴 Fatigue détectée
                {trip.fatigue_summary.hasFatigueMention && (
                  <span className="text-xs font-normal bg-orange-500/20 px-2 py-0.5 rounded-full">Attention à la fatigue</span>
                )}
              </h3>
              <div className="space-y-2">
                {trip.fatigue_summary.alerts?.map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-orange-400 font-medium flex-shrink-0">
                      {new Date(alert.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-muted-foreground">{alert.message}</span>
                  </div>
                ))}
              </div>
              {trip.fatigue_summary.scorePenalty > 0 && (
                <p className="text-xs text-orange-400/70 mt-2 italic">
                  Impact score : -{trip.fatigue_summary.scorePenalty} points
                </p>
              )}
            </div>
          )}

          {trip.distraction_summary && trip.distraction_summary.count > 0 && (
            <div className={`p-4 rounded-xl bg-card border ${trip.distraction_summary.hasRedAlert ? 'border-red-500/40' : 'border-purple-500/20'}`}>
              <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                📵 Utilisation téléphone
                {trip.distraction_summary.hasRedAlert && (
                  <span className="text-xs font-normal bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠️ Alerte rouge</span>
                )}
              </h3>
              <div className="space-y-2">
                {trip.distraction_summary.events?.map((evt, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-secondary/30 border border-border flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-foreground">
                        {new Date(evt.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-muted-foreground ml-2">· {evt.description}</span>
                    </div>
                    <span className={`font-bold ${evt.severity === 'high' ? 'text-red-400' : 'text-purple-400'}`}>
                      {evt.duration_sec}s
                    </span>
                  </div>
                ))}
                {trip.distraction_summary.hasHighSpeed && (
                  <p className="text-xs text-red-400 font-medium">🚨 Téléphone utilisé à haute vitesse (&gt;50 km/h)</p>
                )}
              </div>
              {trip.distraction_summary.scorePenalty > 0 && (
                <p className="text-xs text-purple-400/70 mt-2 italic">
                  Impact score : -{trip.distraction_summary.scorePenalty} points
                </p>
              )}
            </div>
          )}

          {trip.ai_comments?.length > 0 && (
            <div className="p-5 rounded-2xl bg-card border border-primary/20">
              <h3 className="text-sm font-semibold text-primary mb-3">💡 Conseils IA personnalisés</h3>
              <div className="space-y-3">
                {trip.ai_comments.map((comment, i) => (
                  <div key={i} className="flex gap-3">
                    <ThumbsUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB : CARTE ── */}
      {activeTab === 'map' && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-card border border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Tracé GPS</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { color: '#C8F230', label: 'Vitesse respectée' },
                { color: '#F2C230', label: 'Légèrement au-dessus' },
                { color: '#ef4444', label: 'Excès de vitesse' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs font-medium text-muted-foreground pt-1">Marqueurs (cliquer pour détails)</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { color: '#C8F230', label: '🔄 Rond-point bien passé' },
                { color: '#f97316', label: '🔄 Rond-point tardif' },
                { color: '#ef4444', label: '🔄 Rond-point dangereux' },
                { color: '#C8F230', label: '🛑 STOP respecté' },
                { color: '#ef4444', label: '🛑 STOP non respecté' },
                { color: '#ef4444', label: '🚨 Excès vitesse' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: l.color, backgroundColor: l.color + '33' }} />
                  <span className="text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {events.length > 0 && (
            <div className="flex gap-2 flex-wrap text-xs">
              {roundaboutEvents.length > 0 && (
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  🔄 {roundaboutEvents.length} rond{roundaboutEvents.length > 1 ? 's' : ''}-point{roundaboutEvents.length > 1 ? 's' : ''}
                </span>
              )}
              {stopEvents.length > 0 && (
                <span className="px-2 py-1 rounded-full bg-card border border-border font-medium">
                  🛑 {stopEvents.length} STOP{stopEvents.length > 1 ? 's' : ''} · {stopEvents.filter(e => e.event_type === 'stop_respected').length} respecté{stopEvents.filter(e => e.event_type === 'stop_respected').length > 1 ? 's' : ''}
                </span>
              )}
              {speedEvents.length > 0 && (
                <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 font-medium">
                  🚨 {speedEvents.length} excès
                </span>
              )}
            </div>
          )}

          <div className="rounded-2xl overflow-hidden border border-border" style={{ height: 'calc(100vh - 380px)', minHeight: '380px' }}>
            <TripMapView trip={trip} events={events} onRoundaboutClick={setSelectedRoundabout} />
          </div>
        </div>
      )}

      {/* ── TAB : TIMELINE ── */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {events.length} événement{events.length !== 1 ? 's' : ''} détecté{events.length !== 1 ? 's' : ''}
            </h3>
          </div>
          <EventTimeline events={events} />
        </div>
      )}

      {selectedRoundabout && (
        <RoundaboutDetailModal
          event={selectedRoundabout}
          trip={trip}
          onClose={() => setSelectedRoundabout(null)}
        />
      )}
    </div>
  );
}