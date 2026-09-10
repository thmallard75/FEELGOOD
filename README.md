# FeelGood Conduite

Application iPhone (App Store) + **serveur que tu héberges toi-même**. Base44 n’est pas dans le chemin de production.

L’iPhone **enregistre le GPS**. Ton serveur **calcule les KPI** et **gère les comptes** (Google, Facebook, Apple, e-mail). Chaque utilisateur ne voit que ses trajets. Un parent invité voit les scores, pas le GPS.

```
iPhone  --GPS + compte-->  ton VPS  --KPI-->  iPhone
```

## Pour une appli de qualité, partageable

Ce n’est pas du code manquant : ce sont des **comptes développeur** chez toi.

| Besoin | Pourquoi | Où |
| --- | --- | --- |
| Un nom de domaine + **HTTPS** | L’App Store et Google/Facebook refusent le HTTP | VPS + Caddy (`deploy/Caddyfile`) |
| Compte **Google Cloud** (gratuit) | Bouton « Continuer avec Google » | console.cloud.google.com → OAuth |
| Compte **Facebook Developers** (gratuit) | Bouton Facebook | developers.facebook.com |
| Compte **Apple Developer** (99 €/an) | TestFlight / App Store **et** « Sign in with Apple » (obligatoire dès que Google ou Facebook est activé) | developer.apple.com |
| Un **Mac + Xcode** | Compiler l’ipa | — |
| (Optionnel) **Resend** | E-mails d’invitation parent | resend.com |
| Une **page confidentialité** en HTTPS | Exigence App Store si tu collectes l’e-mail | une URL publique |

Sans les identifiants OAuth, l’app marche déjà avec **e-mail + mot de passe** (inscription dans l’écran de connexion). Les boutons Google / Facebook / Apple apparaissent dès que les variables d’environnement sont renseignées.

URI de redirection à coller dans chaque console :

```
https://api.mondomaine.fr/api/apps/auth/callback/google
https://api.mondomaine.fr/api/apps/auth/callback/facebook
https://api.mondomaine.fr/api/apps/auth/callback/apple
```

Variables : voir `app/.env.example` (`GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID`, `APPLE_*`, `PUBLIC_URL`, `JWT_SECRET`).

## 1. Test en ligne gratuit (Render)

Le fichier `render.yaml` décrit le service. Dans [Render](https://dashboard.render.com) :

1. **New → Blueprint**
2. Connecte le dépôt GitHub `thmallard75/FEELGOOD`
3. Branche **`cursor/fix-trip-after-drive-592e`** (pas `main`)
4. Apply

Tu obtiens `https://feelgood-xxxx.onrender.com` : **écran de connexion réel** (e-mail + mot de passe). Les trajets sont sur ce serveur.

Limites du plan Free : le service s’endort après 15 min sans visite (~1 min au réveil) ; les données peuvent disparaître au redémarrage (pas de disque persistant).

## 1b. Héberger chez toi (VPS)

```bash
docker compose up -d --build
```

L’API écoute sur **8787**. Place-la derrière HTTPS. `GET /health` → `{ "ok": true }`.

## 2. Compiler l’app App Store

```bash
cd app
npm install
VITE_API_URL=https://api.mondomaine.fr npm run ios
```

Identifiant : `fr.feelgood.conduite`. `VITE_API_URL` est cuit dans le binaire.

## 3. Dev local

```bash
cd app
npm install
npm run dev:local    # API :8787 + Vite :5173 → écran de connexion
```

```bash
FEELGOOD_SEED=0 npm start   # terminal 1
npm run smoke               # terminal 2 : compte + GPS → KPI + isolation
```

## PWA de démo (sans serveur)

`https://thmallard75.github.io/FEELGOOD/` — pas le serveur Render, pas de vrais comptes : trajets uniquement dans le navigateur.
