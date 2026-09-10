// Catalogue régions pour affichage frontend (le backend possède la source bbox dans base44/shared/regionCatalog.ts).
export const REGIONS = [
  { code: "auvergne_rhone_alpes", name: "Auvergne-Rhône-Alpes", size: "large" },
  { code: "bourgogne_franche_comte", name: "Bourgogne-Franche-Comté", size: "medium" },
  { code: "bretagne", name: "Bretagne", size: "medium" },
  { code: "centre_val_de_loire", name: "Centre-Val de Loire", size: "medium" },
  { code: "corse", name: "Corse", size: "small" },
  { code: "grand_est", name: "Grand Est", size: "medium" },
  { code: "hauts_de_france", name: "Hauts-de-France", size: "medium" },
  { code: "ile_de_france", name: "Île-de-France", size: "small" },
  { code: "normandie", name: "Normandie", size: "medium" },
  { code: "nouvelle_aquitaine", name: "Nouvelle-Aquitaine", size: "large" },
  { code: "occitanie", name: "Occitanie", size: "medium" },
  { code: "pays_de_la_loire", name: "Pays de la Loire", size: "medium" },
  { code: "paca", name: "Provence-Alpes-Côte d'Azur", size: "medium" },
  { code: "guadeloupe", name: "Guadeloupe", size: "small" },
  { code: "martinique", name: "Martinique", size: "small" },
  { code: "guyane", name: "Guyane", size: "large" },
  { code: "la_reunion", name: "La Réunion", size: "small" },
  { code: "mayotte", name: "Mayotte", size: "small" },
];

export const SIZE_LABEL = { small: "Léger", medium: "Moyen", large: "Lourd" };

export const GRAND_EST_DEPT_CODES = ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'];