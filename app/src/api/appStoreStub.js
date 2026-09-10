/**
 * Remplace le client de démo (moteur OSM dans le navigateur) pour que Vite
 * ne compile jamais analyzeTrip dans le binaire App Store.
 */
export async function createDemoClient() {
  throw new Error("Le moteur de démo n'est pas dans le binaire App Store");
}
