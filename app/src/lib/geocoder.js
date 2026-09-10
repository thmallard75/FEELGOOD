/**
 * Géocodage inverse via Nominatim (OpenStreetMap)
 * Module 3 : Adresses départ/arrivée
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Obtenir l'adresse complète à partir de coordonnées GPS
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Promise<{ full: string, short: string, city: string }>}
 */
export async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fr&addressdetails=1`;

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'FeelGoodConduite/1.0' },
  });

  if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
  const data = await resp.json();

  const addr = data.address || {};
  const road = addr.road || addr.pedestrian || addr.path || '';
  const houseNumber = addr.house_number ? `${addr.house_number} ` : '';
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
  const postcode = addr.postcode || '';

  const full = [houseNumber + road, postcode, city].filter(Boolean).join(', ');
  const short = city || data.display_name?.split(',')[0] || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;

  return { full: full || data.display_name || short, short, city };
}