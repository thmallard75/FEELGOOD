/**
 * Substitut navigateur de `base44:runtime`.
 * Les fonctions protegees par cle de service restent appelables en local.
 */

const DEFAULTS = {
  GEOFABRIK_SERVICE_KEY: 'dev-geofabrik-key',
};

export const secrets = {
  get(name) {
    return DEFAULTS[name];
  },
};

export default { secrets };
