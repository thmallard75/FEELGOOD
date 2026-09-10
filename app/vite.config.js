import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Demo = PWA GitHub Pages sans serveur. Sinon : app + API auto-hebergee.
const isDemo = process.env.VITE_DEMO_MODE === 'true';
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  logLevel: 'error',
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  build: { target: 'es2022' },
  server: isDemo ? undefined : {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  plugins: [
    ...(isDemo ? [{
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
    }] : []),
    react(),
  ],
});
