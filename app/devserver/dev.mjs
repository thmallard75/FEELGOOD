// Lance ensemble l'API auto-hebergee et Vite. Le proxy /api de Vite
// pointe sur le serveur local (port 8787) — pas Base44.

import { spawn } from 'node:child_process';
import { join } from 'node:path';

const API_PORT = process.env.DEV_API_PORT || '8787';
const API_HOST = process.env.DEV_API_HOST || '127.0.0.1';
const API_URL = `http://${API_HOST}:${API_PORT}`;

const children = [];

function run(name, command, args, env) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...env },
    cwd: join(import.meta.dirname, '..'),
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] ${name} s'est arrete (${signal || code}) — arret de l'ensemble`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('api', process.execPath, ['--experimental-strip-types', 'devserver/server.mjs'], {
  DEV_API_PORT: API_PORT,
  DEV_API_HOST: API_HOST,
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || 'http://127.0.0.1:5173',
});

run('vite', process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], {
  VITE_BASE44_APP_BASE_URL: API_URL,
  VITE_SELF_HOSTED: 'true',
  VITE_API_URL: '',
});
