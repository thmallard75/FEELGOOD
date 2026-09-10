/**
 * FeelGood Conduite — Background Keep-Alive
 *
 * Gère :
 *   1. Wake Lock — empêche la mise en veille de l'écran
 *   2. Service Worker — enregistrement + keepalive ping toutes les 20s
 *   3. Notification persistante via SW
 *   4. Sauvegarde GPS localStorage toutes les 5s
 */

const LS_KEY = 'feelgood_gps_backup';
const PING_INTERVAL_MS = 20_000;
const GPS_SAVE_INTERVAL_MS = 5_000;

class BackgroundKeepAlive {
  constructor() {
    this._wakeLock = null;
    this._swReg = null;
    this._pingInterval = null;
    this._gpsInterval = null;
    this._getTrackFn = null; // fonction () => gpsTrack[]

    // Re-acquire wake lock si visibility change
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this._wakeLock === null) {
        this._acquireWakeLock();
      }
    };
  }

  // ── API publique ────────────────────────────────────────────────────────

  /**
   * Démarrer tous les mécanismes de maintien en arrière-plan.
   * @param {function} getTrackFn — retourne le tableau gpsTrack courant
   */
  async start(getTrackFn) {
    this._getTrackFn = getTrackFn;

    await Promise.all([
      this._acquireWakeLock(),
      this._registerServiceWorker(),
    ]);

    this._startPingInterval();
    this._startGpsSaveInterval();

    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  /** Arrêter tous les mécanismes et nettoyer. */
  async stop() {
    document.removeEventListener('visibilitychange', this._onVisibilityChange);

    this._releaseWakeLock();
    this._stopPingInterval();
    this._stopGpsSaveInterval();

    // Notifier le SW d'arrêter la notification
    if (this._swReg?.active) {
      this._swReg.active.postMessage({ type: 'TRIP_STOPPED' });
    }

    // Nettoyer le backup localStorage
    localStorage.removeItem(LS_KEY);
  }

  /** Restaurer les points GPS sauvegardés en cas de crash/suspension. */
  static getBackupTrack() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static clearBackupTrack() {
    localStorage.removeItem(LS_KEY);
  }

  // ── Wake Lock ────────────────────────────────────────────────────────────

  async _acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLock.addEventListener('release', () => {
        this._wakeLock = null;
      });
    } catch (err) {
      // Permission refusée ou non supporté — silencieux
      console.warn('[WakeLock] non disponible:', err.message);
    }
  }

  _releaseWakeLock() {
    if (this._wakeLock) {
      this._wakeLock.release().catch(() => {});
      this._wakeLock = null;
    }
  }

  // ── Service Worker ────────────────────────────────────────────────────────

  async _registerServiceWorker() {
    // Capacitor embarque deja l'app : le SW du navigateur n'y est pas fiable
    // (notifications, scope) et le GPS tourne dans le process natif.
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return;
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) return;
    } catch {
      // Capacitor absent du build web classique — continuer.
    }
    if (!('serviceWorker' in navigator)) return;
    try {
      // Chemins derives de la base : l'application peut etre servie depuis un
      // sous-chemin, ou un scope '/' serait refuse.
      const base = import.meta.env.BASE_URL;
      this._swReg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });

      // Attendre que le SW soit actif
      await navigator.serviceWorker.ready;

      // Demander la permission de notifications puis notifier le SW
      const permission = await Notification.requestPermission();
      if (permission === 'granted' && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'TRIP_STARTED' });
      }
    } catch (err) {
      console.warn('[SW] Enregistrement échoué:', err.message);
    }
  }

  // ── Keepalive ping vers le SW ─────────────────────────────────────────────

  _startPingInterval() {
    this._pingInterval = setInterval(() => {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage('ping');
      }
    }, PING_INTERVAL_MS);
  }

  _stopPingInterval() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  // ── Sauvegarde GPS localStorage ───────────────────────────────────────────

  _startGpsSaveInterval() {
    this._gpsInterval = setInterval(() => {
      if (!this._getTrackFn) return;
      const track = this._getTrackFn();
      if (track?.length > 0) {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(track));
        } catch {
          // localStorage plein — silencieux
        }
      }
    }, GPS_SAVE_INTERVAL_MS);
  }

  _stopGpsSaveInterval() {
    if (this._gpsInterval) {
      clearInterval(this._gpsInterval);
      this._gpsInterval = null;
    }
  }
}

// Singleton
export const backgroundKeepAlive = new BackgroundKeepAlive();