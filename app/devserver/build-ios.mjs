// Bundle App Store : l'app parle a TON serveur (VITE_API_URL).
// Aucun instantane, aucun moteur OSM dans le WebView — analyzeTrip tourne
// sur le serveur auto-heberge.
//
//   VITE_API_URL=https://api.mondomaine.fr npm run build:ios

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const apiUrl = process.env.VITE_API_URL;

if (!apiUrl) {
  console.error(
    'VITE_API_URL manquant.\n'
    + 'Exemple : VITE_API_URL=https://api.mondomaine.fr npm run build:ios\n'
    + 'Le serveur se lance avec : docker compose up -d  (voir README)',
  );
  process.exit(1);
}

const build = spawnSync(
  process.execPath,
  [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--base', '/'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SELF_HOSTED: 'true',
      VITE_API_URL: apiUrl,
      VITE_DEMO_MODE: '',
    },
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const capBin = join(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
if (existsSync(capBin)) {
  const sync = spawnSync(process.execPath, [capBin, 'sync'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (sync.status !== 0) process.exit(sync.status ?? 1);
  console.log('\n[build-ios] projet Xcode synchronise. Ouvre ios/App/App.xcworkspace');
} else {
  console.log('\n[build-ios] bundle web pret dans dist/ (Capacitor non installe)');
}
