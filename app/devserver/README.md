# Backend de developpement

L'application est concue pour tourner sur la plateforme Base44 : le SDK parle a
un backend heberge, et sans session valide l'API repond `403 auth_required`.
Le code de ce dossier fournit ce backend en local, pour pouvoir developper,
lire et modifier l'application dans ce depot sans compte ni acces reseau.

```bash
npm install
npm run dev:local     # backend de dev + Vite
```

L'application est alors servie sur <http://127.0.0.1:5173>, et le proxy `/api`
de `@base44/vite-plugin` pointe sur le backend local (port 8787).

## Ce qui est reel, ce qui ne l'est pas

Le point important : **les fonctions backend ne sont pas simulees**. Les treize
fonctions de `base44/functions/` s'executent telles quelles, y compris
`analyzeTrip` et ses 750 lignes de scoring. Le seed cree des trajets bruts
(trace GPS, horodatage, distance) puis appelle `analyzeTrip` ; scores,
evenements de conduite et indice de serenite sont donc calcules par le moteur
de production, jamais ecrits en dur.

| Element | Origine |
| --- | --- |
| Fonctions backend | code reel de `base44/functions/` |
| Donnees routieres | OpenStreetMap, secteur de Dossenheim-sur-Zinsel, extraites par l'ETL Geofabrik |
| Scores et evenements | calcules par `analyzeTrip` au moment du seed |
| Traces GPS | synthetiques, interpolees a 1 Hz sur la geometrie reelle des routes |
| Utilisateur | compte fictif unique (`dev@feelgood.local`) |

La trace du trajet « Boucle de simulation » n'est pas inventee ici : c'est
celle qu'embarque deja `src/lib/tripRecorder.js` pour son mode simulation.

## Fonctionnement

Les fonctions backend sont ecrites pour Deno : elles importent
`npm:@base44/sdk` et `base44:runtime`, et exposent leur handler tantot par
`export default`, tantot par `Deno.serve`. Trois pieces suffisent a les faire
tourner sous Node :

- `loader.mjs` — hooks de resolution ESM qui redirigent les specificateurs Deno
  vers `shims/`. Le typage TypeScript est retire par Node lui-meme
  (`--experimental-strip-types`).
- `shims/base44-sdk.mjs` — un client dont les entites tapent dans le magasin
  local au lieu de partir en HTTP.
- `functions.mjs` — fournit la globale `Deno` pour capturer le handler, puis
  l'appelle avec une vraie `Request`.

`server.mjs` expose par-dessus les routes HTTP que le SDK appelle cote
navigateur (entites, `User/me`, `public-settings`, `functions/<nom>`), et
`store.mjs` persiste l'etat dans `devserver/.data/store.json`.

## Limites connues

- **Pas de RLS.** Base44 restreint les lectures non service-role au createur de
  l'enregistrement ; ici tout le monde voit tout. Emuler le RLS a moitie
  donnerait des comportements plus trompeurs qu'utiles — le tableau de bord
  parent lit par exemple des liens crees par le jeune conducteur.
- **Pas de LLM.** `InvokeLLM` leve une erreur explicite. Les appelants ont tous
  un repli documente (`coachFallback`), c'est donc ce chemin qui s'execute :
  les commentaires du coach sont generes par la logique de secours, pas par un
  modele.
- **Couverture OSM limitee au secteur de Dossenheim** (8 cellules,
  48.79–48.82 N, 7.38–7.41 E). Hors de cette zone, `analyzeTrip` retombe sur
  Overpass, ce qui demande un acces reseau ; sans reseau le trajet reste en
  `pending_osm`, exactement comme en production.
- **Un seul utilisateur.** Il n'y a ni inscription ni changement de compte.

## Mise en ligne : la demonstration statique

Un hebergement de pages statiques n'execute rien : impossible d'y faire tourner
ce backend. Le build de demonstration contourne le probleme en figeant les
resultats plutot qu'en les recalculant.

```bash
npm run demo:snapshot   # rejoue le seed et fige entites + reponses de fonctions
npm run build:demo      # build Vite + instantane + repli 404.html
```

`demo:snapshot` appelle les vraies fonctions backend puis ecrit
`demo/demo-snapshot.json` (100 Ko), versionne. Le build charge alors
`src/api/demoClient.js` au lieu du SDK : meme surface, servie depuis
l'instantane. Les chiffres publies sont donc ceux du moteur, pas des valeurs
ecrites a la main.

Ce que la demonstration ne peut pas faire, et signale explicitement : analyser
un nouveau trajet, envoyer un e-mail, appeler un modele. Les ecritures
(activer un lien parent, par exemple) fonctionnent en memoire et disparaissent
au rechargement.

Le workflow `.github/workflows/pages.yml` publie ce build sur GitHub Pages a
chaque poussee sur `main`. `DEMO_BASE` fixe le sous-chemin de service
(`/FEELGOOD/` pour un site de projet).

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev:local` | backend de dev + Vite |
| `npm run dev:api` | backend seul, sur le port 8787 |
| `npm run dev:reset` | efface l'etat local ; le seed est rejoue au demarrage suivant |
| `npm run demo:snapshot` | regenere l'instantane de demonstration |
| `npm run build:demo` | construit la version statique publiable |

Deux routes d'inspection : `GET /__dev/state` (utilisateur, volumetrie,
fonctions disponibles) et `POST /__dev/reseed`.

Le premier demarrage prend une a deux minutes : il analyse les trajets du seed.
Les suivants sont immediats, l'etat etant relu depuis `devserver/.data/`.

## Regenerer la fixture OSM

`fixtures/osm_tiles_dossenheim.json` a ete produit par l'ETL Geofabrik du depot
(`etl/parse_geofabrik.py`) applique a l'extrait Alsace, sur la boite
48.79–48.82 N / 7.38–7.41 E. Le format de cle de cellule est celui qu'attend
`base44/shared/osmCache.ts` (`Math.floor(lat / 0.01)_Math.floor(lng / 0.01)`).
Pour couvrir un autre secteur, relancer l'ETL sur l'extrait correspondant et
remplacer la fixture.
