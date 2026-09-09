/**
 * Fond de carte commun aux trois vues cartographiques.
 *
 * Le fond CARTO utilise precedemment renvoie desormais des tuiles tamponnees
 * « API KEY REQUIRED » : leur usage anonyme n'est plus permis. On sert donc
 * les tuiles OpenStreetMap, libres d'acces, assombries par le filtre CSS
 * `.map-tiles-dark` (defini dans index.css) pour rester dans le theme sombre.
 */

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const TILE_CLASS = 'map-tiles-dark';
