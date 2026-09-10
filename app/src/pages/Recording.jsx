import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Square, Bug, Loader2, Shield, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TripRecorder } from '@/lib/tripRecorder';
import SpeedMeter from '../components/recording/SpeedMeter';
import TripTimer from '../components/recording/TripTimer';
import RecordingHUD from '../components/recording/RecordingHUD';
import BilanConduite from '../components/recording/BilanConduite';

export default function Recording() {
  const navigate = useNavigate();
  const recorderRef = useRef(null);
  const timerRef = useRef(null);

  const [recState, setRecState] = useState({
    isRecording: false, isPaused: false, currentSpeed: 0,
    distanceKm: 0, elapsed: 0, gpsPointsCount: 0, gpsTrack: [],
  });

  const [isSaving, setIsSaving] = useState(false);
  const [tripResult, setTripResult] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | recording | saving | done

  const handleStateUpdate = useCallback((state) => setRecState(state), []);

  useEffect(() => {
    recorderRef.current = new TripRecorder(handleStateUpdate);
    return () => {
      if (recorderRef.current?.isRecording) recorderRef.current._stopWatching();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Timer elapsed
  useEffect(() => {
    if (phase === 'recording') {
      timerRef.current = setInterval(() => {
        setRecState(prev => ({ ...prev, elapsed: prev.elapsed + 1 }));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const handleStartSim = async () => {
    if (!recorderRef.current) return;
    const { base44 } = await import('@/api/base44Client');
    try { await base44.auth.me(); } catch {
      toast.error('Session expirée');
      base44.auth.redirectToLogin(window.location.pathname);
      return;
    }
    toast('Démarrage simulation GPS (Dossenheim)…', { duration: 2000 });
    await recorderRef.current.startSimulation();
    setPhase('recording');
    toast.success('Simulation démarrée !', { duration: 2000 });
  };

  const handleStart = async () => {
    if (!recorderRef.current) return;
    if (navigator.geolocation) {
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
          });
        });
      } catch (err) {
        if (err.code === 1) {
          toast.error('Permission GPS refusée', {
            description: 'Autorisez la localisation dans les réglages de votre navigateur/téléphone.',
            duration: 6000,
          });
          return;
        }
      }
    }

    const { base44 } = await import('@/api/base44Client');
    try { await base44.auth.me(); } catch {
      toast.error('Session expirée', { description: 'Reconnectez-vous pour enregistrer un trajet.', duration: 5000 });
      base44.auth.redirectToLogin(window.location.pathname);
      return;
    }

    await recorderRef.current.startManual();
    setPhase('recording');
    toast.success('Trajet démarré !', { description: 'Bonne route ! 🚗', duration: 3000 });
  };

  const handleStop = async () => {
    if (!recorderRef.current || !recorderRef.current.isRecording) return;
    setPhase('saving');
    setIsSaving(true);
    try {
      const result = await recorderRef.current.stopManual();
      setTripResult(result);
      setPhase('done');
      toast.success(`Trajet enregistré — ${result.distKm} km en ${result.durationMin} min`, {
        description: 'Analyse OSM en cours…',
        duration: 5000,
      });
    } catch (err) {
      console.error('Erreur sauvegarde trajet:', err);
      toast.error('Erreur lors de la sauvegarde du trajet');
      setPhase('idle');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Phase DONE ───────────────────────────────────────────────────────────

  if (phase === 'done' && tripResult) {
    const resetTrip = () => {
      if (recorderRef.current) recorderRef.current.destroy();
      recorderRef.current = new TripRecorder(handleStateUpdate);
      setPhase('idle');
      setTripResult(null);
      setRecState({
        isRecording: false, isPaused: false, currentSpeed: 0,
        distanceKm: 0, elapsed: 0, gpsPointsCount: 0, gpsTrack: [],
      });
    };
    return (
      <BilanConduite
        tripResult={tripResult}
        counts={{ gpsPointsCount: recState.gpsPointsCount }}
        onDetail={() => navigate(`/trips/${tripResult.tripId}`)}
        onNewTrip={resetTrip}
      />
    );
  }

  // ─── Phase SAVING ─────────────────────────────────────────────────────────

  if (phase === 'saving') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-muted border-t-primary rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">Sauvegarde en cours…</p>
          <p className="text-sm text-muted-foreground mt-1">Enregistrement de la trace GPS et des événements</p>
        </div>
      </div>
    );
  }

  // ─── Phase IDLE ───────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Play className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Prêt pour un trajet serein ?</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Feelgood analyse automatiquement ta conduite. Aucune interaction à gérer en roulant.
            <br />Tes destinations restent privées.
          </p>
        </motion.div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avant de partir</p>
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              Pose ton téléphone, règle ta destination si besoin, puis lance l'enregistrement. Feelgood est discret pendant la conduite.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Eye className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              L'analyse (anticipation, arrêts, régularité, vitesse) s'établit à la fin du trajet. Tu reçois un bilan clair, pas une notation.
            </p>
          </div>
        </div>

        <Button
          onClick={handleStart}
          size="lg"
          className="w-full h-16 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-2xl shadow-[0_0_30px_rgba(200,242,48,0.3)]"
        >
          <Play className="w-6 h-6 mr-3 fill-current" />
          Démarrer le trajet
        </Button>
        <details className="text-center">
          <summary className="inline-block text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            Outils de test
          </summary>
          <div className="mt-3">
            <Button
              onClick={handleStartSim}
              variant="outline"
              size="sm"
              className="w-full h-10 text-xs font-semibold border-lime-500/30 text-lime-400 hover:bg-lime-500/10 rounded-xl"
            >
              <Bug className="w-3.5 h-3.5 mr-2" />
              Mode simulation (test)
            </Button>
          </div>
        </details>
      </div>
    );
  }

  // ─── Phase RECORDING ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Status bar */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-semibold text-foreground">Enregistrement en cours</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Analyse après le trajet</span>
        </div>
      </motion.div>

      {/* Vitesse */}
      <div className="p-6 rounded-2xl bg-card border border-border flex flex-col items-center gap-4">
        <SpeedMeter speed={recState.currentSpeed} />
        <RecordingHUD state={recState} />
      </div>

      {/* Timer + Métriques */}
      <div className="p-4 rounded-2xl bg-card border border-border flex justify-center">
        <TripTimer elapsed={recState.elapsed} distanceKm={recState.distanceKm} gpsPointsCount={recState.gpsPointsCount} />
      </div>

      {/* Adresse départ */}
      {recState.startAddress && (
        <div className="px-3 py-2 rounded-xl bg-card border border-border flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-primary">📍</span>
          <span className="truncate">Départ : <span className="text-foreground font-medium">{recState.startAddress.short}</span></span>
        </div>
      )}

      {/* Note pédagogique : l'analyse est différée à la fin du trajet */}
      <div className="px-3 py-2 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground text-center">
        Anticipation, arrêts, fluidité et vitesse sont analysés à la fin du trajet.
      </div>

      {/* Bouton arrêter */}
      <Button
        onClick={handleStop}
        variant="outline"
        size="lg"
        className="w-full h-14 text-base font-bold border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-2xl"
      >
        <Square className="w-5 h-5 mr-2 fill-current" />
        Terminer le trajet
      </Button>
    </div>
  );
}