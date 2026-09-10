// Catalogue des régions françaises (métropole + outre-mer) avec bbox approximatifs.
// Source unique de vérité pour les bbox utilisées par le pré-fetch de carte.

export const REGIONS = [
  { code: "auvergne_rhone_alpes", name: "Auvergne-Rhône-Alpes", size: "large", bbox: { minLat: 44.1, minLng: 2.0, maxLat: 46.8, maxLng: 7.2 } },
  { code: "bourgogne_franche_comte", name: "Bourgogne-Franche-Comté", size: "medium", bbox: { minLat: 46.2, minLng: 2.8, maxLat: 48.4, maxLng: 7.2 } },
  { code: "bretagne", name: "Bretagne", size: "medium", bbox: { minLat: 47.0, minLng: -5.6, maxLat: 49.8, maxLng: -1.0 } },
  { code: "centre_val_de_loire", name: "Centre-Val de Loire", size: "medium", bbox: { minLat: 46.2, minLng: 0.0, maxLat: 48.7, maxLng: 3.1 } },
  { code: "corse", name: "Corse", size: "small", bbox: { minLat: 41.3, minLng: 8.5, maxLat: 43.0, maxLng: 9.6 } },
  { code: "grand_est", name: "Grand Est", size: "medium", bbox: { minLat: 47.3, minLng: 3.3, maxLat: 50.3, maxLng: 8.2 } },
  { code: "hauts_de_france", name: "Hauts-de-France", size: "medium", bbox: { minLat: 48.8, minLng: 1.0, maxLat: 51.1, maxLng: 5.0 } },
  { code: "ile_de_france", name: "Île-de-France", size: "small", bbox: { minLat: 48.1, minLng: 1.4, maxLat: 49.3, maxLng: 3.6 } },
  { code: "normandie", name: "Normandie", size: "medium", bbox: { minLat: 48.0, minLng: -2.2, maxLat: 50.2, maxLng: 1.8 } },
  { code: "nouvelle_aquitaine", name: "Nouvelle-Aquitaine", size: "large", bbox: { minLat: 42.7, minLng: -1.8, maxLat: 46.8, maxLng: 1.6 } },
  { code: "occitanie", name: "Occitanie", size: "medium", bbox: { minLat: 42.2, minLng: -0.3, maxLat: 45.0, maxLng: 4.8 } },
  { code: "pays_de_la_loire", name: "Pays de la Loire", size: "medium", bbox: { minLat: 46.2, minLng: -1.9, maxLat: 48.6, maxLng: 1.0 } },
  { code: "paca", name: "Provence-Alpes-Côte d'Azur", size: "medium", bbox: { minLat: 43.0, minLng: 4.6, maxLat: 45.6, maxLng: 7.6 } },
  { code: "guadeloupe", name: "Guadeloupe", size: "small", bbox: { minLat: 15.8, minLng: -61.8, maxLat: 16.6, maxLng: -60.7 } },
  { code: "martinique", name: "Martinique", size: "small", bbox: { minLat: 14.3, minLng: -61.3, maxLat: 15.0, maxLng: -60.6 } },
  { code: "guyane", name: "Guyane", size: "large", bbox: { minLat: 1.8, minLng: -54.6, maxLat: 6.0, maxLng: -51.0 } },
  { code: "la_reunion", name: "La Réunion", size: "small", bbox: { minLat: -21.4, minLng: 55.2, maxLat: -20.8, maxLng: 55.9 } },
  { code: "mayotte", name: "Mayotte", size: "small", bbox: { minLat: -13.0, minLng: 45.0, maxLat: -12.6, maxLng: 45.3 } },
];

export function getRegion(code) {
  return REGIONS.find((r) => r.code === code) || null;
}

export function estimateCells(bbox) {
  const CELL = 0.01;
  const a = Math.floor(bbox.maxLat / CELL) - Math.floor(bbox.minLat / CELL);
  const b = Math.floor(bbox.maxLng / CELL) - Math.floor(bbox.minLng / CELL);
  return Math.max(1, a * b);
}