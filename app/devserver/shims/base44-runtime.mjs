// Substitut de `base44:runtime`, le module de secrets du runtime Base44.
//
// Les valeurs viennent de l'environnement, avec un defaut de developpement
// pour que les fonctions protegees par cle de service restent appelables
// localement sans configuration.

const DEFAULTS = {
  GEOFABRIK_SERVICE_KEY: 'dev-geofabrik-key',
};

export const secrets = {
  get(name) {
    return process.env[name] ?? DEFAULTS[name];
  },
};

export default { secrets };
