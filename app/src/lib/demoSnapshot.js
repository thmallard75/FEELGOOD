/**
 * Contrat de l'instantane du mode demonstration, partage entre le script qui
 * le produit (devserver/export-demo.mjs) et le client qui le consomme
 * (src/api/demoClient.js) — pour que les deux cotes s'accordent sur les cles.
 */

export const SNAPSHOT_FILE = 'demo-snapshot.json';

/** Cle stable d'un appel de fonction : les arguments sont ordonnes. */
export function functionKey(name, args) {
  const obj = args && typeof args === 'object' ? args : {};
  const ordered = Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = obj[k];
    return acc;
  }, {});
  return `${name}:${JSON.stringify(ordered)}`;
}
