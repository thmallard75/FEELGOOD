// Catalogue bbox des departements francais metropolitains (96).
// Source de verite unique pour detectDepartementsToPreload.
// Note: bboxes approximatives, suffisantes en region courante pour le point-in-bbox.

export const DEPARTEMENTS = [
  { code: "01", name: "Ain", bbox: { minLat: 45.5, minLng: 4.7, maxLat: 46.5, maxLng: 6.4 } },
  { code: "02", name: "Aisne", bbox: { minLat: 48.8, minLng: 2.9, maxLat: 50.3, maxLng: 4.2 } },
  { code: "03", name: "Allier", bbox: { minLat: 45.9, minLng: 2.2, maxLat: 46.9, maxLng: 4.0 } },
  { code: "04", name: "Alpes-de-Haute-Provence", bbox: { minLat: 43.4, minLng: 5.3, maxLat: 44.7, maxLng: 7.0 } },
  { code: "05", name: "Hautes-Alpes", bbox: { minLat: 44.0, minLng: 5.5, maxLat: 45.8, maxLng: 7.5 } },
  { code: "06", name: "Alpes-Maritimes", bbox: { minLat: 43.4, minLng: 6.6, maxLat: 44.3, maxLng: 7.8 } },
  { code: "07", name: "Ardeche", bbox: { minLat: 44.3, minLng: 3.8, maxLat: 45.4, maxLng: 4.9 } },
  { code: "08", name: "Ardennes", bbox: { minLat: 49.2, minLng: 4.0, maxLat: 50.3, maxLng: 5.4 } },
  { code: "09", name: "Ariege", bbox: { minLat: 42.4, minLng: 0.8, maxLat: 43.3, maxLng: 2.2 } },
  { code: "10", name: "Aube", bbox: { minLat: 47.9, minLng: 3.4, maxLat: 48.9, maxLng: 4.9 } },
  { code: "11", name: "Aude", bbox: { minLat: 42.4, minLng: 1.6, maxLat: 43.5, maxLng: 3.3 } },
  { code: "12", name: "Aveyron", bbox: { minLat: 43.7, minLng: 1.9, maxLat: 44.9, maxLng: 3.1 } },
  { code: "13", name: "Bouches-du-Rhone", bbox: { minLat: 43.0, minLng: 4.6, maxLat: 43.8, maxLng: 5.7 } },
  { code: "14", name: "Calvados", bbox: { minLat: 48.7, minLng: -1.2, maxLat: 49.4, maxLng: 0.4 } },
  { code: "15", name: "Cantal", bbox: { minLat: 44.6, minLng: 2.0, maxLat: 45.4, maxLng: 3.3 } },
  { code: "16", name: "Charente", bbox: { minLat: 45.0, minLng: -0.4, maxLat: 46.2, maxLng: 0.9 } },
  { code: "17", name: "Charente-Maritime", bbox: { minLat: 45.0, minLng: -1.6, maxLat: 46.2, maxLng: 0.3 } },
  { code: "18", name: "Cher", bbox: { minLat: 46.4, minLng: 1.5, maxLat: 47.4, maxLng: 3.2 } },
  { code: "19", name: "Correze", bbox: { minLat: 44.9, minLng: 1.3, maxLat: 45.8, maxLng: 2.6 } },
  { code: "2A", name: "Corse-du-Sud", bbox: { minLat: 41.3, minLng: 8.5, maxLat: 42.3, maxLng: 9.3 } },
  { code: "2B", name: "Haute-Corse", bbox: { minLat: 42.3, minLng: 8.6, maxLat: 43.0, maxLng: 9.6 } },
  { code: "21", name: "Cote-d'Or", bbox: { minLat: 46.9, minLng: 3.9, maxLat: 48.1, maxLng: 5.5 } },
  { code: "22", name: "Cotes-d'Armor", bbox: { minLat: 48.2, minLng: -3.6, maxLat: 49.0, maxLng: -1.9 } },
  { code: "23", name: "Creuse", bbox: { minLat: 45.6, minLng: 1.2, maxLat: 46.5, maxLng: 2.6 } },
  { code: "24", name: "Dordogne", bbox: { minLat: 44.6, minLng: 0.0, maxLat: 45.7, maxLng: 1.5 } },
  { code: "25", name: "Doubs", bbox: { minLat: 46.8, minLng: 5.7, maxLat: 47.6, maxLng: 7.1 } },
  { code: "26", name: "Drome", bbox: { minLat: 44.2, minLng: 4.7, maxLat: 45.4, maxLng: 5.7 } },
  { code: "27", name: "Eure", bbox: { minLat: 48.5, minLng: 0.3, maxLat: 49.5, maxLng: 1.8 } },
  { code: "28", name: "Eure-et-Loir", bbox: { minLat: 47.9, minLng: 0.7, maxLat: 48.9, maxLng: 1.9 } },
  { code: "29", name: "Finistere", bbox: { minLat: 47.6, minLng: -5.2, maxLat: 48.7, maxLng: -3.6 } },
  { code: "30", name: "Gard", bbox: { minLat: 43.4, minLng: 3.2, maxLat: 44.5, maxLng: 4.8 } },
  { code: "31", name: "Haute-Garonne", bbox: { minLat: 42.7, minLng: 0.6, maxLat: 43.9, maxLng: 2.1 } },
  { code: "32", name: "Gers", bbox: { minLat: 43.3, minLng: -0.4, maxLat: 44.2, maxLng: 1.0 } },
  { code: "33", name: "Gironde", bbox: { minLat: 44.2, minLng: -1.3, maxLat: 45.6, maxLng: 0.3 } },
  { code: "34", name: "Herault", bbox: { minLat: 43.2, minLng: 2.5, maxLat: 43.9, maxLng: 4.2 } },
  { code: "35", name: "Ille-et-Vilaine", bbox: { minLat: 47.6, minLng: -2.4, maxLat: 48.7, maxLng: -1.0 } },
  { code: "36", name: "Indre", bbox: { minLat: 46.2, minLng: 0.7, maxLat: 47.2, maxLng: 1.8 } },
  { code: "37", name: "Indre-et-Loire", bbox: { minLat: 46.7, minLng: 0.1, maxLat: 47.7, maxLng: 1.3 } },
  { code: "38", name: "Isere", bbox: { minLat: 44.6, minLng: 4.8, maxLat: 45.9, maxLng: 6.4 } },
  { code: "39", name: "Jura", bbox: { minLat: 46.3, minLng: 5.1, maxLat: 47.3, maxLng: 6.1 } },
  { code: "40", name: "Landes", bbox: { minLat: 43.4, minLng: -1.3, maxLat: 44.6, maxLng: 0.1 } },
  { code: "41", name: "Loir-et-Cher", bbox: { minLat: 47.0, minLng: 0.4, maxLat: 48.0, maxLng: 1.8 } },
  { code: "42", name: "Loire", bbox: { minLat: 45.2, minLng: 3.7, maxLat: 46.0, maxLng: 4.7 } },
  { code: "43", name: "Haute-Loire", bbox: { minLat: 44.7, minLng: 3.3, maxLat: 45.4, maxLng: 4.5 } },
  { code: "44", name: "Loire-Atlantique", bbox: { minLat: 46.8, minLng: -2.6, maxLat: 47.9, maxLng: -1.0 } },
  { code: "45", name: "Loiret", bbox: { minLat: 47.4, minLng: 1.2, maxLat: 48.4, maxLng: 3.0 } },
  { code: "46", name: "Lot", bbox: { minLat: 44.0, minLng: 0.9, maxLat: 45.0, maxLng: 2.2 } },
  { code: "47", name: "Lot-et-Garonne", bbox: { minLat: 44.0, minLng: 0.0, maxLat: 44.9, maxLng: 1.2 } },
  { code: "48", name: "Lozere", bbox: { minLat: 44.0, minLng: 2.9, maxLat: 44.9, maxLng: 3.9 } },
  { code: "49", name: "Maine-et-Loire", bbox: { minLat: 46.9, minLng: -1.3, maxLat: 47.9, maxLng: 0.4 } },
  { code: "50", name: "Manche", bbox: { minLat: 48.5, minLng: -2.0, maxLat: 49.7, maxLng: -0.7 } },
  { code: "51", name: "Marne", bbox: { minLat: 48.4, minLng: 3.4, maxLat: 49.5, maxLng: 5.1 } },
  { code: "52", name: "Haute-Marne", bbox: { minLat: 47.8, minLng: 4.3, maxLat: 48.8, maxLng: 5.8 } },
  { code: "53", name: "Mayenne", bbox: { minLat: 47.7, minLng: -1.4, maxLat: 48.6, maxLng: 0.0 } },
  { code: "54", name: "Meurthe-et-Moselle", bbox: { minLat: 48.2, minLng: 5.4, maxLat: 49.4, maxLng: 7.0 } },
  { code: "55", name: "Meuse", bbox: { minLat: 48.4, minLng: 4.8, maxLat: 49.6, maxLng: 5.9 } },
  { code: "56", name: "Morbihan", bbox: { minLat: 47.2, minLng: -3.7, maxLat: 48.1, maxLng: -1.9 } },
  { code: "57", name: "Moselle", bbox: { minLat: 48.5, minLng: 6.1, maxLat: 49.6, maxLng: 7.6 } },
  { code: "58", name: "Nievre", bbox: { minLat: 46.6, minLng: 2.7, maxLat: 47.6, maxLng: 4.2 } },
  { code: "59", name: "Nord", bbox: { minLat: 49.9, minLng: 1.9, maxLat: 51.1, maxLng: 4.1 } },
  { code: "60", name: "Oise", bbox: { minLat: 49.0, minLng: 1.7, maxLat: 49.9, maxLng: 3.2 } },
  { code: "61", name: "Orne", bbox: { minLat: 48.0, minLng: -1.1, maxLat: 48.9, maxLng: 0.9 } },
  { code: "62", name: "Pas-de-Calais", bbox: { minLat: 49.9, minLng: 1.5, maxLat: 51.1, maxLng: 3.2 } },
  { code: "63", name: "Puy-de-Dome", bbox: { minLat: 45.4, minLng: 2.5, maxLat: 46.4, maxLng: 3.9 } },
  { code: "64", name: "Pyrenees-Atlantiques", bbox: { minLat: 42.7, minLng: -1.8, maxLat: 43.5, maxLng: 0.0 } },
  { code: "65", name: "Hautes-Pyrenees", bbox: { minLat: 42.5, minLng: -0.3, maxLat: 43.4, maxLng: 0.9 } },
  { code: "66", name: "Pyrenees-Orientales", bbox: { minLat: 42.2, minLng: 1.8, maxLat: 42.9, maxLng: 3.2 } },
  { code: "67", name: "Bas-Rhin", bbox: { minLat: 48.2, minLng: 7.0, maxLat: 49.1, maxLng: 8.0 } },
  { code: "68", name: "Haut-Rhin", bbox: { minLat: 47.4, minLng: 6.9, maxLat: 48.3, maxLng: 7.7 } },
  { code: "69", name: "Rhone", bbox: { minLat: 45.4, minLng: 4.4, maxLat: 46.0, maxLng: 5.1 } },
  { code: "70", name: "Haute-Saone", bbox: { minLat: 47.2, minLng: 5.4, maxLat: 48.0, maxLng: 6.9 } },
  { code: "71", name: "Saone-et-Loire", bbox: { minLat: 46.0, minLng: 3.6, maxLat: 46.9, maxLng: 5.3 } },
  { code: "72", name: "Sarthe", bbox: { minLat: 47.3, minLng: -0.4, maxLat: 48.5, maxLng: 1.0 } },
  { code: "73", name: "Savoie", bbox: { minLat: 45.1, minLng: 5.4, maxLat: 46.0, maxLng: 6.9 } },
  { code: "74", name: "Haute-Savoie", bbox: { minLat: 45.6, minLng: 5.8, maxLat: 46.4, maxLng: 7.0 } },
  { code: "75", name: "Paris", bbox: { minLat: 48.8, minLng: 2.2, maxLat: 48.9, maxLng: 2.5 } },
  { code: "76", name: "Seine-Maritime", bbox: { minLat: 49.0, minLng: 0.1, maxLat: 50.1, maxLng: 1.8 } },
  { code: "77", name: "Seine-et-Marne", bbox: { minLat: 48.1, minLng: 2.4, maxLat: 49.1, maxLng: 3.6 } },
  { code: "78", name: "Yvelines", bbox: { minLat: 48.5, minLng: 1.5, maxLat: 49.1, maxLng: 2.3 } },
  { code: "79", name: "Deux-Sevres", bbox: { minLat: 45.9, minLng: -0.7, maxLat: 47.0, maxLng: 0.5 } },
  { code: "80", name: "Somme", bbox: { minLat: 49.6, minLng: 1.2, maxLat: 50.4, maxLng: 3.0 } },
  { code: "81", name: "Tarn", bbox: { minLat: 43.4, minLng: 1.4, maxLat: 44.2, maxLng: 2.9 } },
  { code: "82", name: "Tarn-et-Garonne", bbox: { minLat: 43.7, minLng: 0.7, maxLat: 44.4, maxLng: 2.2 } },
  { code: "83", name: "Var", bbox: { minLat: 42.9, minLng: 5.6, maxLat: 43.8, maxLng: 7.2 } },
  { code: "84", name: "Vaucluse", bbox: { minLat: 43.6, minLng: 4.6, maxLat: 44.3, maxLng: 5.8 } },
  { code: "85", name: "Vendee", bbox: { minLat: 46.2, minLng: -2.4, maxLat: 47.0, maxLng: -0.6 } },
  { code: "86", name: "Vienne", bbox: { minLat: 45.9, minLng: -0.1, maxLat: 47.1, maxLng: 1.1 } },
  { code: "87", name: "Haute-Vienne", bbox: { minLat: 45.2, minLng: 0.6, maxLat: 46.3, maxLng: 1.8 } },
  { code: "88", name: "Vosges", bbox: { minLat: 47.8, minLng: 5.6, maxLat: 48.7, maxLng: 7.2 } },
  { code: "89", name: "Yonne", bbox: { minLat: 47.3, minLng: 2.9, maxLat: 48.4, maxLng: 4.4 } },
  { code: "90", name: "Territoire-de-Belfort", bbox: { minLat: 47.4, minLng: 6.7, maxLat: 47.8, maxLng: 7.2 } },
  { code: "91", name: "Essonne", bbox: { minLat: 48.3, minLng: 1.9, maxLat: 48.8, maxLng: 2.6 } },
  { code: "92", name: "Hauts-de-Seine", bbox: { minLat: 48.7, minLng: 2.1, maxLat: 48.9, maxLng: 2.4 } },
  { code: "93", name: "Seine-Saint-Denis", bbox: { minLat: 48.8, minLng: 2.3, maxLat: 49.0, maxLng: 2.6 } },
  { code: "94", name: "Val-de-Marne", bbox: { minLat: 48.7, minLng: 2.3, maxLat: 48.9, maxLng: 2.6 } },
  { code: "95", name: "Val-d'Oise", bbox: { minLat: 48.9, minLng: 1.7, maxLat: 49.2, maxLng: 2.7 } },
];

export function getDepartementForPoint(lat, lng) {
  for (const d of DEPARTEMENTS) {
    const b = d.bbox;
    if (lat >= b.minLat && lat < b.maxLat && lng >= b.minLng && lng < b.maxLng) return d;
  }
  return null;
}

export function getDepartementByCode(code) {
  return DEPARTEMENTS.find((d) => d.code === code) || null;
}

const CELL = 0.01;
export function estimateCells(bbox) {
  const a = Math.floor(bbox.maxLat / CELL) - Math.floor(bbox.minLat / CELL);
  const b = Math.floor(bbox.maxLng / CELL) - Math.floor(bbox.minLng / CELL);
  return Math.max(1, a * b);
}