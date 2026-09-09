/**
 * FeelGood Conduite — Détecteur de distraction téléphone
 * Module 2 : Page Visibility API + Touch events
 */

const DISTRACTION_CONFIG = {
  MIN_SPEED_KMH: 30,          // Vitesse minimale pour comptabiliser
  MIN_SPEED_SERIOUS_KMH: 50,  // Vitesse pour événement grave
  MIN_SPEED_IGNORE_KMH: 5,    // Ignore si < 5 km/h
  BG_MIN_DURATION_MS: 8000,   // 8s en arrière-plan = événement
  TOUCH_MIN_DURATION_MS: 3000, // 3s de touch = événement
  SESSION_CLEAR_MS: 15000,     // 15s sans interaction pour fermer session
};

export class DistractionDetector {
  constructor(onEvent, onAlert) {
    this.onEvent = onEvent;       // Callback pour enregistrer un événement
    this.onAlert = onAlert;       // Callback pour afficher une alerte UI

    this.currentSpeedKmh = 0;
    this.events = [];             // Événements enregistrés
    this.totalScore = 0;

    // Visibility
    this._bgStart = null;
    this._bgSession = false;

    // Touch
    this._touchStart = null;
    this._touchTimer = null;

    this._handleVisibility = this._handleVisibility.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
  }

  start() {
    document.addEventListener('visibilitychange', this._handleVisibility);
    document.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    document.addEventListener('touchend', this._handleTouchEnd, { passive: true });
  }

  stop() {
    document.removeEventListener('visibilitychange', this._handleVisibility);
    document.removeEventListener('touchstart', this._handleTouchStart);
    document.removeEventListener('touchend', this._handleTouchEnd);
    if (this._touchTimer) clearTimeout(this._touchTimer);
  }

  updateSpeed(speedKmh) {
    this.currentSpeedKmh = speedKmh;
  }

  _handleVisibility() {
    const now = Date.now();
    if (document.hidden) {
      // App passe en arrière-plan
      if (this.currentSpeedKmh >= DISTRACTION_CONFIG.MIN_SPEED_IGNORE_KMH) {
        this._bgStart = now;
        this._bgSession = true;
      }
    } else {
      // App revient au premier plan
      if (this._bgSession && this._bgStart) {
        const duration = now - this._bgStart;
        if (
          duration >= DISTRACTION_CONFIG.BG_MIN_DURATION_MS &&
          this.currentSpeedKmh >= DISTRACTION_CONFIG.MIN_SPEED_KMH
        ) {
          this._recordEvent('phone_background', duration, now);
        }
      }
      this._bgSession = false;
      this._bgStart = null;
    }
  }

  _handleTouchStart() {
    if (this.currentSpeedKmh < DISTRACTION_CONFIG.MIN_SPEED_IGNORE_KMH) return;
    if (this._touchStart) return; // Déjà en cours
    this._touchStart = Date.now();

    // Si > 3s de touch → c'est une interaction longue
    this._touchTimer = setTimeout(() => {
      if (this._touchStart && this.currentSpeedKmh >= DISTRACTION_CONFIG.MIN_SPEED_KMH) {
        this._recordEvent('phone_touch', Date.now() - this._touchStart, Date.now());
      }
      this._touchStart = null;
    }, DISTRACTION_CONFIG.TOUCH_MIN_DURATION_MS);
  }

  _handleTouchEnd() {
    if (this._touchTimer) {
      clearTimeout(this._touchTimer);
      this._touchTimer = null;
    }
    this._touchStart = null;
  }

  _recordEvent(type, durationMs, timestamp) {
    const speed = this.currentSpeedKmh;
    const isSerious = speed >= DISTRACTION_CONFIG.MIN_SPEED_SERIOUS_KMH || durationMs > 15000;
    const durationSec = Math.round(durationMs / 1000);

    const event = {
      type,
      duration_ms: durationMs,
      duration_sec: durationSec,
      speed_kmh: Math.round(speed),
      severity: isSerious ? 'high' : 'medium',
      timestamp: new Date(timestamp).toISOString(),
      description: type === 'phone_background'
        ? `App en arrière-plan ${durationSec}s à ${Math.round(speed)} km/h`
        : `Interaction écran ${durationSec}s à ${Math.round(speed)} km/h`,
      is_high_speed: speed >= DISTRACTION_CONFIG.MIN_SPEED_SERIOUS_KMH,
    };

    this.events.push(event);

    // Callback pour enregistrer dans les events du trip
    if (this.onEvent) this.onEvent(event);

    // Alerte sonore + visuelle (bip)
    this._playBeep();
    if (this.onAlert) this.onAlert('📵 Garde les yeux sur la route !');
  }

  _playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio non disponible
    }
  }

  getScorePenalty() {
    const count = this.events.length;
    const hasSerious = this.events.some(e => e.severity === 'high');
    if (count === 0) return 0;
    if (count >= 2) return 15;
    if (hasSerious) return 10;
    return 5;
  }

  getSummary() {
    return {
      count: this.events.length,
      events: this.events,
      hasHighSpeed: this.events.some(e => e.is_high_speed),
      scorePenalty: this.getScorePenalty(),
      hasRedAlert: this.events.length >= 2,
    };
  }
}