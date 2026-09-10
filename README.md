# FeelGood Conduite — application iOS

Le code UI est du React. [Capacitor](https://capacitorjs.com/) l'embarque dans
une app iPhone native. **Base44 n'est plus dans le chemin de test.**

## Tester sur un iPhone, maintenant

Sans Mac et sans compte Apple : la **PWA**.

1. Ouvre le site de demo dans **Safari** (pas Chrome).
2. Bouton Partager → **Sur l'écran d'accueil**.
3. L'icône FeelGood s'installe comme une app : plein écran, GPS, navigation.

Le site de demo est le build statique du dépôt (workflow GitHub Pages). URL
attendue après activation de Pages :

`https://thmallard75.github.io/FEELGOOD/`

Si Pages n'est pas encore activé : GitHub → Settings → Pages → Source =
**GitHub Actions**, puis relancer le workflow *Demo Pages*.

Tu navigues le tableau de bord, les trajets, le coaching. Page Conduire →
*Outils de test* → simulation GPS. Les données restent sur l'iPhone.

## App native (Xcode)

Ça, c'est la vraie app App Store / TestFlight. Il faut **un Mac avec Xcode**.

```bash
cd app
npm install
npm run ios          # build web + ouvre Xcode
```

Ou à la main :

```bash
cd app
npm run build:mobile
npx cap open ios     # ouvre ios/App/App.xcworkspace
```

Dans Xcode :

1. Sélectionne le target **App**, un simulateur iPhone (ou ton iPhone en
   développeur).
2. Signing : ton équipe Apple (compte gratuit = run sur *ton* iPhone 7 jours ;
   compte Developer 99 €/an = TestFlight pour tout le monde).
3. Run.

Identifiant : `fr.feelgood.conduite`.

Le projet iOS est dans `app/ios/` (Info.plist, permissions GPS, fond sombre).

## Ce que fait / ne fait pas le build de test

| | PWA / app de test | `npm run dev:local` |
| --- | --- | --- |
| Compte | aucun | aucun |
| Trajets déjà analysés | oui (instantané) | oui (moteur réel) |
| Simulation GPS | oui | oui |
| Nouveau trajet GPS + analyse OSM | oui (moteur réel, dans le navigateur) | oui (moteur réel) |

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev:local` | backend local + Safari/Chrome, analyse OSM |
| `npm run build:demo` | PWA statique (GitHub Pages) |
| `npm run build:mobile` | bundle + `cap sync` vers Xcode |
| `npm run ios` | build mobile et ouvre Xcode |
| `npm run preview` | sert `dist/` en local pour tester la PWA |

Détail du backend local : [app/devserver/README.md](app/devserver/README.md).
