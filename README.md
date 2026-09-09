# FEELGOOD — ETL Geofabrik

Ce dépôt ne contient pas l'application FeelGood Drive (hébergée sur Base44),
seulement le job lourd qu'un sandbox applicatif ne peut pas exécuter :
extraire des données routières d'OpenStreetMap et les pousser vers l'app.

## Ce que fait le pipeline

Une fois par jour (`.github/workflows/main.yml`), ou à la demande :

1. **Interroge l'app** — `GET /functions/getPendingDepartements` renvoie les
   départements à traiter, avec leur bbox.
2. **Choisit les extraits** — les régions Geofabrik qui intersectent ces bbox
   sont sélectionnées via l'index Geofabrik, puis téléchargées.
3. **Parse** — ronds-points, stops et limites de vitesse sont extraits et
   agrégés en cellules de `0.01°` (~1 km).
4. **Pousse** — `POST /functions/importGeofabrikTiles`, par batches, avec un
   drapeau `is_final` par département.

Le script sort immédiatement si aucun département n'est pending : rien n'est
téléchargé avant cette vérification.

## Pourquoi des extraits régionaux

Traiter `france-latest.osm.pbf` signifiait télécharger et parser ~5 Go à
chaque exécution, même pour un seul département. Les régions nécessaires sont
maintenant déduites des bbox pending, ce qui ramène le plus souvent le volume
à quelques centaines de Mo.

Le repli sur la France entière est automatique si l'index Geofabrik est
injoignable, si un département n'est couvert par aucune région, ou si la
sélection dépasse `MAX_REGIONS` régions (auquel cas un seul gros fichier
coûte moins cher).

Les extraits se chevauchent — un chemin traversant une frontière régionale
est présent en entier dans les deux fichiers — donc le parser déduplique par
identifiant OSM.

## Configuration

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `GEOSERVICE_KEY` | *(requis)* | Clé de service, envoyée en `X-Service-Key` |
| `APP_BASE` | `https://feel-good-drive.base44.app` | Base des fonctions Base44 |
| `PBF_CACHE_DIR` | `/tmp/geofabrik` | Répertoire de téléchargement |
| `PBF_PATH` | — | Court-circuite le téléchargement et parse ce fichier |
| `ETL_DEPARTEMENTS` | — | Restreint le run (ex. `75,77`) |
| `ETL_FORCE_FRANCE` | `false` | Force `france-latest` |
| `ETL_BATCH_CELLS` | `200` | Cellules max par batch |
| `ETL_BATCH_ELEMENTS` | `20000` | Éléments max par batch |
| `ETL_USER_AGENT` | `feelgood-etl/2.0` | En-tête `User-Agent` |

En production, `GEOSERVICE_KEY` vient du secret GitHub du même nom.

## Exécution locale

```bash
pip install -r etl/requirements-dev.txt

# Sur un extrait déjà présent, sans rien télécharger
GEOSERVICE_KEY=... ETL_DEPARTEMENTS=75 PBF_PATH=/chemin/ile-de-france-latest.osm.pbf \
  python etl/parse_geofabrik.py

python -m pytest tests -q
```

## Notes d'exploitation

- **`is_final` n'est envoyé que si tous les batches d'un département sont
  passés.** Sinon le département reste pending et sera repris au prochain run.
  Le job se termine en erreur pour que l'échec soit visible.
- **La progression est journalisée toutes les 5 s** (octets lus, nœuds, ways,
  cellules), le parse pouvant durer des heures. La position de lecture est
  sondée via `/proc/self/fdinfo` : sous un OS sans `/proc`, seul l'affichage
  est dégradé.
- **`osmium` est épinglé** dans `etl/requirements.txt`. La 4.x a réorganisé
  l'API publique ; un `pip install osmium` non contraint peut casser le job
  sans qu'aucun commit n'ait eu lieu.
- **Le cache disque n'a pas d'effet sur un runner GitHub** (disque jeté à
  chaque run). `PBF_CACHE_DIR` devient utile sur un runner persistant.

## Limites connues

- Un département est attribué à une cellule via le **centre** de la cellule,
  sans marge. Les cellules dont le centre tombe hors de toute bbox pending
  sont ignorées.
- Une cellule couverte par deux bbox pending est attribuée au premier
  département correspondant.
- `highway=service` (voies de desserte, allées de parking) est exclu
  volontairement : le volume est important pour un intérêt faible.
