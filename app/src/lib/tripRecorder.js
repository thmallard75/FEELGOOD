/**
 * FeelGood Conduite — Gestionnaire d'enregistrement de trajet (capture-only)
 *
 * Responsabilités frontend (UNIQUEMENT la capture) :
 *  - Enregistrement de la trace GPS brute (lat/lng/vitesse/précision/timestamp)
 *  - Capture brute des signaux de distraction (visibility + touch) horodatés
 *  - Affichage HUD : vitesse, durée, distance, statut GPS, trace brute
 *
 * Toute l'interprétation (freinages, fatigue, distraction, excès, ronds-points,
 * stops, scores, sérénité) est déléguée à la fonction backend `analyzeTrip`,
 * déclenchée à la fin du trajet. Le frontend ne fait que la restitution.
 */

import { haversineDistance, bearing, THRESHOLDS } from './gpsEngine';
import { reverseGeocode } from './geocoder';
import { base44 } from '@/api/base44Client';
import { backgroundKeepAlive } from './backgroundKeepAlive';

export class TripRecorder {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;

    this.isRecording = false;
    this.isPaused = false;
    this.watchId = null;
    this.intervalId = null;
    this.gpsLostTimer = null;

    this.tripId = null;
    this.startTime = null;
    this.lastPosition = null;
    this.lastTimestamp = null;
    this.lastSpeed = 0;
    this._speedBuffer = [];

    this.gpsTrack = [];
    this.totalDistanceM = 0;
    this._currentHeading = null;

    this.startAddress = null;

    // Signaux bruts de distraction (horodatés) — interprétés côté backend
    this.distractionSignals = [];
    this._bgActive = false;
    this._touchActive = false;
    this._handleVisibility = this._handleVisibility.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);

    // Simulation
    this._simIndex = 0;
    this._simTrack = null;
  }

  // ─── Démarrage / Arrêt ───────────────────────────────────────────────────

  async startManual() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this._initState();

    const trip = await base44.entities.Trip.create({
      start_time: new Date(this.startTime).toISOString(),
      status: 'recording',
    });
    this.tripId = trip.id;

    backgroundKeepAlive.start(() => this.gpsTrack);
    this._startDistractionCapture();
    this._startWatching();
    this._emitUpdate();
    return this.tripId;
  }

  async stopManual() {
    if (!this.isRecording) return;
    return await this._finalizeTrip();
  }

  async startSimulation() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this._initState();

    const trip = await base44.entities.Trip.create({
      start_time: new Date(this.startTime).toISOString(),
      status: 'recording',
    });
    this.tripId = trip.id;

    this._startSimulation();
    this._emitUpdate();
    return this.tripId;
  }

  _initState() {
    this.gpsTrack = [];
    this.totalDistanceM = 0;
    this.lastPosition = null;
    this.lastTimestamp = null;
    this.lastSpeed = 0;
    this._speedBuffer = [];
    this._currentHeading = null;
    this.startAddress = null;
    this.distractionSignals = [];
    this._bgActive = false;
    this._touchActive = false;
  }

  destroy() {
    this._stopWatching();
    this._stopDistractionCapture();
    backgroundKeepAlive.stop();
  }

  // ─── Géolocalisation ─────────────────────────────────────────────────────

  _startWatching() {
    if (!navigator.geolocation) {
      console.warn('Geolocation non disponible — mode simulation');
      this._startSimulation();
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => this._handleGpsError(err),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }

  _stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    if (this.gpsLostTimer) { clearTimeout(this.gpsLostTimer); this.gpsLostTimer = null; }
  }

  _handleGpsError(err) {
    console.warn('Erreur GPS:', err.message);
    if (this.isRecording && !this.isPaused) this._pauseForGpsLoss();
  }

  _pauseForGpsLoss() {
    this.isPaused = true;
    this.gpsLostTimer = setTimeout(() => { if (this.isPaused) this._emitUpdate(); }, THRESHOLDS.GPS_LOST_TIMEOUT_MS);
    this._emitUpdate();
  }

  async _handlePosition(pos) {
    const now = Date.now();
    const { latitude: lat, longitude: lng, speed, accuracy } = pos.coords;

    if (this.isPaused) {
      this.isPaused = false;
      if (this.gpsLostTimer) { clearTimeout(this.gpsLostTimer); this.gpsLostTimer = null; }
    }

    // Vitesse GPS native + lissage sur 3 points (affichage HUD uniquement)
    const rawSpeedKmh = speed != null ? Math.max(0, speed * 3.6) : this.lastSpeed;
    this._speedBuffer.push(rawSpeedKmh);
    if (this._speedBuffer.length > 3) this._speedBuffer.shift();
    const speedKmh = Math.round(
      (this._speedBuffer.reduce((a, b) => a + b, 0) / this._speedBuffer.length) * 10
    ) / 10;

    const lowPrecision = accuracy > THRESHOLDS.GPS_LOW_PRECISION_M;

    if (this.lastPosition) {
      this._currentHeading = bearing(this.lastPosition.lat, this.lastPosition.lng, lat, lng);
    }

    // Géocodage au premier point GPS
    if (this.gpsTrack.length === 0 && !this.startAddress) {
      reverseGeocode(lat, lng).then(addr => {
        this.startAddress = addr;
        this._emitUpdate();
      }).catch(() => {});
    }

    // Point GPS brut
    this.gpsTrack.push({
      lat, lng,
      speed_kmh: speedKmh,
      accuracy_m: Math.round(accuracy),
      timestamp: new Date(now).toISOString(),
      low_precision: lowPrecision,
    });

    // Distance (pour le HUD)
    if (this.lastPosition && !lowPrecision) {
      this.totalDistanceM += haversineDistance(this.lastPosition.lat, this.lastPosition.lng, lat, lng);
    }

    this.lastPosition = { lat, lng };
    this.lastTimestamp = now;
    this.lastSpeed = speedKmh;
    this._emitUpdate();
  }

  // ─── Capture brute distraction (signaux horodatés) ───────────────────────

  _startDistractionCapture() {
    document.addEventListener('visibilitychange', this._handleVisibility);
    document.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    document.addEventListener('touchend', this._handleTouchEnd, { passive: true });
  }

  _stopDistractionCapture() {
    document.removeEventListener('visibilitychange', this._handleVisibility);
    document.removeEventListener('touchstart', this._handleTouchStart);
    document.removeEventListener('touchend', this._handleTouchEnd);
  }

  _handleVisibility() {
    if (!this.isRecording || this.isPaused) return;
    if (document.hidden) {
      if (!this._bgActive && this.lastSpeed >= 5) {
        this._bgActive = true;
        this.distractionSignals.push({ type: 'bg_start', t: Date.now() });
      }
    } else if (this._bgActive) {
      this._bgActive = false;
      this.distractionSignals.push({ type: 'bg_end', t: Date.now() });
    }
  }

  _handleTouchStart() {
    if (!this.isRecording || this.isPaused) return;
    if (this.lastSpeed < 5 || this._touchActive) return;
    this._touchActive = true;
    this.distractionSignals.push({ type: 'touch_start', t: Date.now() });
  }

  _handleTouchEnd() {
    if (!this._touchActive) return;
    this._touchActive = false;
    this.distractionSignals.push({ type: 'touch_end', t: Date.now() });
  }

  // ─── Finalisation ─────────────────────────────────────────────────────────

  async _finalizeTrip() {
    this.isRecording = false;
    this._stopWatching();
    this._stopDistractionCapture();
    await backgroundKeepAlive.stop();

    const endTime = Date.now();
    const durationMin = Math.round((endTime - this.startTime) / 60000);
    const distKm = Math.round(this.totalDistanceM / 10) / 100;

    const firstPoint = this.gpsTrack[0];
    const lastPoint = this.gpsTrack[this.gpsTrack.length - 1];
    const avgSpeed = this.gpsTrack.length
      ? this.gpsTrack.reduce((s, p) => s + p.speed_kmh, 0) / this.gpsTrack.length : 0;
    const maxSpeed = this.gpsTrack.length
      ? Math.max(...this.gpsTrack.map(p => p.speed_kmh)) : 0;
    const lowPrecisionCount = this.gpsTrack.filter(p => p.low_precision).length;

    // Géocodage adresse d'arrivée
    let endAddr = null;
    if (lastPoint) {
      endAddr = await reverseGeocode(lastPoint.lat, lastPoint.lng).catch(() => null);
    }

    // ── Sauvegarder la trace brute + signaux — l'analyse se fait en backend ──
    if (this.tripId) {
      await base44.entities.Trip.update(this.tripId, {
        end_time: new Date(endTime).toISOString(),
        status: 'pending_analysis',
        duration_minutes: durationMin,
        distance_km: distKm,
        start_latitude: firstPoint?.lat,
        start_longitude: firstPoint?.lng,
        end_latitude: lastPoint?.lat,
        end_longitude: lastPoint?.lng,
        start_address: this.startAddress?.full || null,
        end_address: endAddr?.full || null,
        avg_speed_kmh: Math.round(avgSpeed * 10) / 10,
        max_speed_kmh: Math.round(maxSpeed * 10) / 10,
        gps_points_count: this.gpsTrack.length,
        gps_low_precision_count: lowPrecisionCount,
        gps_track: this.gpsTrack,
        distraction_signals: this.distractionSignals,
      });
    }

    // ── Déclencher l'analyse complète en backend (non bloquant) ─────────────
    base44.functions.invoke('analyzeTrip', { tripId: this.tripId }).catch(err => {
      console.warn('Analyse backend échouée:', err.message);
    });

    return { tripId: this.tripId, distKm, durationMin };
  }

  // ─── Simulation GPS ───────────────────────────────────────────────────────

  _startSimulation() {
    this._simTrack = generateDossenheimTrack();
    this._simIndex = 0;
    this.intervalId = setInterval(() => this._simulateNextPoint(), 1000);
  }

  _simulateNextPoint() {
    if (!this.isRecording || !this._simTrack) return;
    if (this._simIndex >= this._simTrack.length) { clearInterval(this.intervalId); return; }
    const p = this._simTrack[this._simIndex++];
    this._handlePosition({
      coords: { latitude: p.lat, longitude: p.lng, speed: p.speed_kmh / 3.6, accuracy: p.accuracy || 8 },
    });
  }

  // ─── État courant (affichage uniquement) ─────────────────────────────────

  getState() {
    const elapsed = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      tripId: this.tripId,
      elapsed,
      currentSpeed: this.lastSpeed,
      distanceKm: Math.round(this.totalDistanceM / 10) / 100,
      gpsPointsCount: this.gpsTrack.length,
      gpsTrack: this.gpsTrack,
      lastPosition: this.lastPosition,
      currentHeading: this._currentHeading,
      startAddress: this.startAddress,
      // Compat UI (données OSM/fatigue = post-trajet backend)
      nearbyRoundabout: null,
      approachingElement: null,
      activeExcess: null,
    };
  }

  _emitUpdate() {
    if (this.onUpdate) this.onUpdate(this.getState());
  }
}

// ─── Trajet simulé — Dossenheim (GPS réel) ────────────────────────────────────

function generateDossenheimTrack() {
  const raw = [
    [48.80580036905483,7.3965172469684815,0],[48.8057687824889,7.396480478139055,1.5],
    [48.805727983559336,7.3964058587908,6.3],[48.80571093161233,7.396303145490612,10.7],
    [48.805687858303095,7.39616939890185,15.4],[48.805663825733745,7.3960205837620645,18.9],
    [48.80563912652147,7.395840013891741,22.1],[48.80560400430306,7.3956371637107186,24.8],
    [48.80555946696764,7.3954391439873275,25.8],[48.805533383939895,7.3952483955755,25.4],
    [48.80551493448187,7.395119407292885,21.5],[48.80551036268888,7.3950320216788725,15.0],
    [48.805556993183835,7.394966645614195,12.1],[48.80563388921913,7.394937325286999,12.8],
    [48.80572403438482,7.3949267390520115,16.0],[48.80581561953372,7.395013349161195,18.8],
    [48.80591723903082,7.395133312603718,22.6],[48.806036219665934,7.395254184148954,26.3],
    [48.806159339083564,7.39538133936597,28.3],[48.80628403290659,7.395508569740268,29.3],
    [48.80640903601294,7.395632661707584,29.7],[48.80652504622334,7.395755528245858,28.9],
    [48.80663208098166,7.395873320919945,27.4],[48.80670568259375,7.396015299863392,25.5],
    [48.80670008050337,7.396193451546083,22.7],[48.80666187470634,7.396389396186955,24.2],
    [48.80662585578012,7.39660116832921,27.1],[48.806604655519116,7.396826031316371,28.7],
    [48.80662377089002,7.397046222817535,29.4],[48.80669123830885,7.397254717692236,29.5],
    [48.8067840791921,7.397444569915681,30.2],[48.806874204636394,7.397631373583979,30.3],
    [48.80696416696077,7.397816056974934,30.2],[48.80703875127304,7.398006518498952,29.8],
    [48.80709610128427,7.398192725326264,28.3],[48.80711086505228,7.398383744293762,26.3],
    [48.80709610128427,7.398192725326264,25.0],[48.80696416696077,7.397816056974934,28.0],
    [48.80678407,7.397444,30.0],[48.80662585578012,7.39660116832921,28.0],
    [48.80652504622334,7.395755528245858,27.0],[48.80628403290659,7.395508569740268,29.0],
    [48.806036219665934,7.395254184148954,26.0],[48.80581561953372,7.395013349161195,22.0],
    [48.80563912652147,7.395840013891741,20.0],[48.80555946696764,7.3954391439873275,22.0],
    [48.80560400430306,7.3956371637107186,24.0],[48.805663825733745,7.3960205837620645,20.0],
    [48.805687858303095,7.39616939890185,16.0],[48.80571093161233,7.396303145490612,12.0],
    [48.8057687824889,7.396480478139055,8.0],[48.80580036905483,7.3965172469684815,3.0],
    [48.80580036905483,7.3965172469684815,0],
  ];
  return raw.map(([lat, lng, speed_kmh]) => ({ lat, lng, speed_kmh, accuracy: 5 }));
}