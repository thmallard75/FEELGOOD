# FeelGood Conduite

Application iPhone (App Store) + **serveur en Europe**. Base44 n’est pas dans le chemin de production.

L’iPhone **enregistre le GPS**. Ton serveur **calcule les KPI** et **gère les comptes**. Chaque utilisateur ne voit que ses trajets. Un parent invité voit les scores, pas le GPS.

**Serveur choisi : Render payant, région Francfort.** Même tableau de bord que le test gratuit, mais le site ne s’endort plus et les trajets sont dans Postgres (sauvegardes). Environ **13 € / mois** (7 $ web Starter + 6 $ base). Pas un VPS : pas de SSH, pas de Linux à maintenir.

## 1. Passer le test Render en production (tes clics)

Carte bancaire une fois, puis le fichier `render.yaml` fait le reste.

1. Ouvre [Render](https://dashboard.render.com) et ajoute un moyen de paiement (Account Settings → Payment).
2. Ouvre le Blueprint du dépôt `thmallard75/FEELGOOD` (celui qui a créé `feelgood`).
3. **Manual Sync** / Apply — branche **`cursor/fix-trip-after-drive-592e`**.
4. Attends que le web `feelgood` passe en **Starter** et que la base **`feelgood-db`** soit créée (Francfort).
5. Même lien : **https://feelgood-mytf.onrender.com/**

Le site ne s’endort plus. Les comptes et trajets survivent aux redémarrages.

Page confidentialité (à coller dans App Store Connect) :

**https://feelgood-mytf.onrender.com/confidentialite**

La démo sans compte reste `https://thmallard75.github.io/FEELGOOD/`. Ce n’est pas ce serveur.

Sans les identifiants OAuth collés dans Render, l’écran montre déjà **Google / Facebook / Apple**, plus e-mail + mot de passe. Un clic sans clés affiche comment les brancher — ce n’est pas une fausse connexion.

## 5. Brancher Gmail et Facebook (comme sur Base44)

Base44 gérait les clés pour toi. Sur ton serveur, tu les colles une fois. **Instagram n’ouvre pas de session** (ce n’est pas Gmail) : le bouton Facebook couvre le compte Meta.

URI à coller telles quelles dans les consoles :

```
https://feelgood-mytf.onrender.com/api/apps/auth/callback/google
https://feelgood-mytf.onrender.com/api/apps/auth/callback/facebook
https://feelgood-mytf.onrender.com/api/apps/auth/callback/apple
```

### Gmail (Google)

1. Ouvre [Google Cloud → Identifiants](https://console.cloud.google.com/apis/credentials).
2. Crée un projet **FeelGood** si besoin.
3. **Écran de consentement OAuth** → External → nom **FeelGood Conduite** → ton e-mail.
4. **Créer des identifiants** → ID client OAuth → **Application Web**.
5. Origines JavaScript : `https://feelgood-mytf.onrender.com`
6. URI de redirection : celle **google** ci-dessus.
7. Copie **ID client** et **Code secret**.
8. Render → service **feelgood** → **Environment** → ajoute `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` → **Save**.

### Facebook

1. Ouvre [Facebook for Developers](https://developers.facebook.com/apps).
2. Crée une app (type Consumer / Authentification).
3. Ajoute **Facebook Login** → URI de redirection : celle **facebook** ci-dessus.
4. Paramètres → Général : copie **Identifiant de l’app** et **Clé secrète**.
5. Render → `FACEBOOK_APP_ID` et `FACEBOOK_APP_SECRET` → **Save**.

### Apple (plus tard, obligatoire sur l’App Store si Gmail ou Facebook sont actifs)

Render : `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (retours à la ligne en `\n`). URI **apple** ci-dessus.

Après le redémarrage Render, **Continuer avec Google** ouvre vraiment Gmail.

## Pour une appli de qualité, ensuite

| Besoin | Pourquoi | Où |
| --- | --- | --- |
| Compte **Apple Developer** (tu l’as) | TestFlight / App Store | developer.apple.com |
| Un **Mac + Xcode** | Compiler l’ipa | — |
| (Plus tard) nom de domaine | Plus joli que `onrender.com` | registrar + Render → Custom Domain |
| (Optionnel) **Resend** | E-mails d’invitation parent | resend.com |

## 2. Compiler l’app App Store

```bash
cd app
npm install
VITE_API_URL=https://feelgood-mytf.onrender.com npm run ios
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

## 4. Cartes Geofabrik (qualité des KPI)

Le bouton Profil → Télécharger Grand Est **n’est pas** Geofabrik (c’est Overpass, lent et incomplet).

Pour des KPI au plus juste (limites de vitesse, stops, giratoires), le serveur doit recevoir l’extrait **Geofabrik Grand Est**. Ça se fait une fois, puis chaque nuit.

**Ne touche pas à Blueprint Sync** (ça pourrait recréer une seconde base). Ajoute les variables à la main :

1. [Render](https://dashboard.render.com) → service **feelgood** → **Environment**.
2. Ajoute `FEELGOOD_SERVICE_KEY` → **Generate**.
3. Ajoute `GEOFABRIK_SEED_GRAND_EST` = `1`.
4. **Save** (le site redémarre).
5. Copie la valeur de `FEELGOOD_SERVICE_KEY`.
6. GitHub → dépôt **FEELGOOD** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Nom : `GEOSERVICE_KEY`
   - Valeur : la clé copiée à l’étape 5.
7. GitHub → **Actions** → **Geofabrik Preload** → **Run workflow**.

Quand c’est fini, Profil sur https://feelgood-mytf.onrender.com/ affiche **Carte serveur Geofabrik — Grand Est**. Les trajets suivants (et « réanalyser ») utilisent ces cartes.

L’iPhone n’analyse plus rien : il envoie le GPS, le serveur croise Geofabrik, et renvoie les scores.
