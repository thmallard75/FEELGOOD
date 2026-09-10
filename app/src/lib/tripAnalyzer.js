/**
 * TripAnalyzer — Analyse post-trajet
 * Toute la logique d'analyse est effectuée après la fin de l'enregistrement GPS.
 */

export class TripAnalyzer {
  /**
   * @param {string} tripId - L'ID du trajet à analyser
   * @param {Array} gpsTrack - Les points GPS bruts collectés
   */
  constructor(tripId, gpsTrack) {
    this.tripId = tripId;
    this.gpsTrack = gpsTrack;
    this.results = {};
  }

  async analyze() {
    // À implémenter étape par étape
    return this.results;
  }
}