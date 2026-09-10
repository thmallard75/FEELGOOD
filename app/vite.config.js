import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// La demonstration statique n'a pas de backend : ni la cible de build par
// defaut (qui refuse l'await de haut niveau du client de demo) ni les
// traceurs du plugin (qui appellent /api) ne conviennent.
const isDemo = process.env.VITE_DEMO_MODE === 'true';
const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  // Cible relevee pour ce seul build, afin de ne pas restreindre les
  // navigateurs supportes par le build de production.
  ...(isDemo ? { build: { target: 'es2022' } } : {}),
  plugins: [
    // Les fonctions backend importent des specificateurs Deno. En mode
    // demonstration, on les execute dans le navigateur : ces aliases
    // redirigent le SDK et le runtime vers les substituts locaux.
    {
      name: 'feelgood-deno-shims',
      enforce: 'pre',
      resolveId(id) {
        if (/^npm:@base44\/sdk/.test(id)) {
          return path.resolve(rootDir, 'src/api/browserSdk.js');
        }
        if (id === 'base44:runtime') {
          return path.resolve(rootDir, 'src/api/browserRuntime.js');
        }
        return null;
      },
    },
    // Le plugin Base44 telemetrie vers /api : inutile (et cassant) pour le
    // build de test autonome, PWA et app iOS.
    ...(!isDemo ? [base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    })] : []),
    react(),
  ]
});
