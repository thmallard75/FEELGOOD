/**
 * Client API de l'application.
 *
 * - Version de test statique (GitHub Pages) : instantane local, VITE_DEMO_MODE.
 * - App Store / serveur perso : HTTP vers TON API (VITE_API_URL), sans Base44.
 *   L'iPhone envoie la trace GPS ; analyzeTrip calcule les KPI sur le serveur.
 */

const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
const apiUrl = import.meta.env.VITE_API_URL || '';

export const base44 = isDemo
  ? await (await import('@/api/demoClient')).createDemoClient()
  : await (await import('@/api/selfHostedClient')).createSelfHostedClient(apiUrl);
