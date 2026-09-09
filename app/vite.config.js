import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// La demonstration statique n'a pas de backend : ni la cible de build par
// defaut (qui refuse l'await de haut niveau du client de demo) ni les
// traceurs du plugin (qui appellent /api) ne conviennent.
const isDemo = process.env.VITE_DEMO_MODE === 'true';

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  // Cible relevee pour ce seul build, afin de ne pas restreindre les
  // navigateurs supportes par le build de production.
  ...(isDemo ? { build: { target: 'es2022' } } : {}),
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: !isDemo,
      analyticsTracker: !isDemo,
      visualEditAgent: true
    }),
    react(),
  ]
});
