# FeelGood Conduite

Application iPhone (App Store) + **serveur que tu héberges toi-même**. Base44 n’est pas dans le chemin de production : ni compte, ni cloud Base44, ni SDK côté iPhone.

L’iPhone **enregistre le GPS**. Ton serveur **calcule les KPI** (`analyzeTrip` : OSM, ronds-points, vitesses, sérénité) et **renvoie uniquement les scores**. Rien de tout ça ne tourne dans l’app.

```
iPhone (Capacitor)  --trace GPS-->  ton VPS / NAS  --KPI-->  iPhone
```

## 1. Héberger le serveur

Sur une machine avec Docker (VPS, Synology, Raspberry, etc.) :

```bash
docker compose up -d --build
```

L’API écoute sur le port **8787**. Place-la derrière **HTTPS** (Caddy, nginx, Cloudflare Tunnel) — l’App Store refuse une API en HTTP public. Exemple : copie `deploy/Caddyfile` et remplace le nom de domaine.

```bash
# GET /health  →  { "ok": true, "service": "feelgood-api" }
```

Sans Docker :

```bash
cd app
FEELGOOD_SEED=0 HOST=0.0.0.0 PORT=8787 DATA_DIR=./data \
  node --experimental-strip-types devserver/server.mjs
```

Les trajets sont persistés dans le volume `feelgood-data` (ou `DATA_DIR`). Overpass (OpenStreetMap) est appelé **depuis le serveur**, pas depuis l’iPhone.

## 2. Compiler l’app App Store

Il te faut un Mac avec Xcode et un compte Apple Developer (99 €/an) pour TestFlight / App Store.

```bash
cd app
npm install
VITE_API_URL=https://api.mondomaine.fr npm run ios
```

Dans Xcode : signing avec ton équipe, iPhone ou simulateur, Run. Identifiant : `fr.feelgood.conduite`.

`VITE_API_URL` est **cuit dans le binaire** : c’est l’adresse HTTPS de **ton** serveur. Change-la, recompile.

## 3. Ce que fait chaque couche

| | iPhone | Ton serveur |
| --- | --- | --- |
| Capture GPS, HUD, écran | oui | non |
| Overpass / tuiles OSM | non | oui |
| Scores, événements, sérénité | affichage | calcul |
| Stockage des trajets | cache UI | disque (`DATA_DIR`) |

## Dev sur un ordi (sans Xcode)

```bash
cd app
npm install
npm run dev:local    # API :8787 + Vite :5173
```

Les KPI sont déjà calculés par le serveur local, pas par le navigateur.

Vérifier le contrat GPS → KPI :

```bash
# terminal 1
FEELGOOD_SEED=0 npm start
# terminal 2
npm run smoke
```

## PWA de démo (sans serveur)

Toujours là pour un essai rapide : `https://thmallard75.github.io/FEELGOOD/` — ce n’est **pas** le build App Store.

## Commandes

| Commande | Effet |
| --- | --- |
| `docker compose up -d` | lance **ton** API |
| `npm run dev:local` | API + UI en local |
| `npm run smoke` | GPS in, KPI out |
| `VITE_API_URL=https://… npm run build:ios` | bundle App Store |
| `npm run ios` | idem + ouvre Xcode (exige `VITE_API_URL`) |
| `npm run ios:demo` | PWA embarquée, sans serveur (test) |
| `npm run build:demo` | GitHub Pages |
