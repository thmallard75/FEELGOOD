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
| `ETL_BATCH_BYTES` | `1000000` | Taille max du corps JSON d'un batch |
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
  passés.** `importGeofabrikTiles` fait passer le département en `complete`
  dès qu'il reçoit `is_final`, donc l'envoyer après un batch en échec clôt un
  département amputé. Le job se termine en erreur pour que ce soit visible.
- **Un département interrompu doit être remis à `pending` à la main.**
  `getPendingDepartements` ne renvoie que les `status: 'pending'`, alors que
  `importGeofabrikTiles` passe le département en `downloading` dès le premier
  batch. Un run interrompu — batch en échec, timeout, éviction du runner —
  laisse donc le département en `downloading`, et rien ne le repropose :
  `detectDepartementsToPreload` ignore les codes déjà présents quel que soit
  leur statut, et `retryPendingDownloads` ne traite que `RegionDownload`.
  Voir « Correctif attendu côté application ».
- **Les batches sont plafonnés à la taille réelle du JSON**, pas au nombre de
  cellules. Mesuré sur la Corse, 200 cellules pesaient 4,4 Mo, au-delà de ce
  qu'une passerelle serverless accepte — l'origine probable des 500
  mentionnés dans le code d'origine.
- **La progression est journalisée toutes les 5 s** (octets lus, nœuds, ways,
  cellules), le parse pouvant durer des heures. La position de lecture est
  sondée via `/proc/self/fdinfo` : sous un OS sans `/proc`, seul l'affichage
  est dégradé.
- **`osmium` est épinglé** dans `etl/requirements.txt`. La 4.x a réorganisé
  l'API publique ; un `pip install osmium` non contraint peut casser le job
  sans qu'aucun commit n'ait eu lieu.
- **Le cache disque n'a pas d'effet sur un runner GitHub** (disque jeté à
  chaque run). `PBF_CACHE_DIR` devient utile sur un runner persistant.

## Contrat avec l'application

Le champ `road_data.speedLimits[].type` n'est pas descriptif : il sert de
bonus d'appariement dans `findSpeedLimit` (`highway` -18, `periurban` -4,
`urban` 0, le score le plus bas gagnant). C'est pourquoi les bretelles
(`motorway_link`, `primary_link`, …) sont classées `urban` et non d'après
leur voie parente : une bretelle `highway` serait à égalité avec l'autoroute
qu'elle longe, la distance suffirait à lui faire gagner l'appariement, et un
point GPS en entrée ou sortie se retrouverait limité à 90 au lieu de 130 —
donc un faux excès de vitesse. Un test verrouille ce comportement.

Chaque rond-point porte un `radius`. `analyzeTrip` ne valide la traversée
qu'à `radius + 20` m du centre et retombe sur 15 m quand le champ est absent,
soit une tolérance de 35 m. L'ETL ne l'émettait pas : mesuré sur la
Corse-du-Sud, 15 des 85 ronds-points avaient donc une tolérance
sous-estimée — un giratoire de 39 m de rayon était écarté comme « non
traversé » et disparaissait du scoring. Les mini ronds-points, à l'inverse,
étaient trop permissifs (35 m au lieu de 28).

**À vérifier côté application** : `OsmTileCache.jsonc` ne déclare pas
`radius` sous `road_data.roundabouts.items.properties`. Le chemin Overpass
écrit déjà ce champ dans la même entité, mais si Base44 élague les propriétés
imbriquées non déclarées, il faut l'ajouter au schéma pour que la correction
prenne effet.

La même logique de parsing existe en trois exemplaires : ici, dans
`shared/osmCore.ts` et dans `functions/osmProxy/entry.ts`. Toute évolution
des tables `MOTOR`, `DEFAULTS`, `HIGHWAY_KINDS` ou de `parse_maxspeed` doit
être répercutée dans les trois, sans quoi une même route sera notée
différemment selon qu'elle vient du cache Geofabrik ou d'Overpass.

Divergence connue et assumée : `parse_maxspeed` convertit les mph, alors que
le `parseInt` de l'application rend `50` pour `"50 mph"` et sort avant sa
propre branche mph, qui est donc morte. L'impact est négligeable en France.

## Correctif attendu côté application

Pour qu'un département interrompu reprenne tout seul,
`getPendingDepartements` doit aussi renvoyer les départements bloqués, comme
`retryPendingDownloads` le fait déjà pour `RegionDownload` :

```ts
// getPendingDepartements — au lieu du seul filter({ status: 'pending' })
const pending = await base44.asServiceRole.entities.DepartementPreload
  .filter({ status: 'pending' }, '-created_date', 200) || [];
const stale = (await base44.asServiceRole.entities.DepartementPreload
  .filter({ status: 'downloading' }, '-created_date', 200) || [])
  .filter((d) => !d.last_sync || Date.now() - new Date(d.last_sync) > 6 * 3600 * 1000);
const list = [...pending, ...stale, ...failed];
```

Le réimport est sans risque : `importGeofabrikTiles` ignore les cellules déjà
présentes, un département repris ne recrée donc que ce qui manque.

## Limites connues

- Un département est attribué à une cellule via le **centre** de la cellule,
  sans marge. Les cellules dont le centre tombe hors de toute bbox pending
  sont ignorées.
- Une cellule couverte par deux bbox pending est attribuée au premier
  département correspondant.
- `highway=service` (voies de desserte, allées de parking) est exclu
  volontairement : le volume est important pour un intérêt faible.
