// Construit la version statique de demonstration.
//
// Trois choses en plus d'un `vite build` : le drapeau VITE_DEMO_MODE (qui
// bascule le client sur l'instantane), la copie de cet instantane dans la
// sortie, et le repli 404.html qu'exigent les pages statiques pour une
// application a routage cote client.
//
//   npm run build:demo            # base = /
//   DEMO_BASE=/FEELGOOD/ npm run build:demo

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const base = process.env.DEMO_BASE || '/';

const { SNAPSHOT_FILE } = await import('../src/lib/demoSnapshot.js');
const snapshot = join(root, 'demo', SNAPSHOT_FILE);

if (!existsSync(snapshot)) {
  console.error(
    `Instantane manquant : ${snapshot}\n`
    + 'Le produire avec : npm run demo:snapshot',
  );
  process.exit(1);
}

const build = spawnSync(
  process.execPath,
  [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--base', base],
  { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_DEMO_MODE: 'true' } },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const dist = join(root, 'dist');
copyFileSync(snapshot, join(dist, SNAPSHOT_FILE));
// Le routage est cote client : une URL profonde doit rendre l'application.
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
// Sans ce fichier, GitHub Pages passe la sortie dans Jekyll et ignore _*.
writeFileSync(join(dist, '.nojekyll'), '');

console.log(`\n[build-demo] sortie prete dans dist/ (base ${base})`);
