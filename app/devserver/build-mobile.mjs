// Construit le bundle web embarque dans l'APK / l'IPA.
//
// Meme instantane que la demonstration statique (pas de Base44), mais la
// base d'URL est '/' : Capacitor sert l'app depuis https://localhost/.
// `npx cap sync` copie ensuite dist/ dans les projets Android et iOS.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

process.env.DEMO_BASE = '/';
process.env.VITE_DEMO_MODE = 'true';

const build = spawnSync(process.execPath, [join(root, 'devserver', 'build-demo.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const capBin = join(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
if (!existsSync(capBin)) {
  console.log('\n[build-mobile] Capacitor n\'est pas installe — bundle web pret dans dist/');
  process.exit(0);
}

const sync = spawnSync(process.execPath, [capBin, 'sync'], {
  cwd: root,
  stdio: 'inherit',
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log('\n[build-mobile] projet iOS synchronise avec dist/');
