import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Le build de demonstration (npm run build:demo) n'a pas de backend : le client
// est alors servi depuis un instantane statique. Voir src/api/demoClient.js.
const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';

export const base44 = isDemo
  ? await (await import('@/api/demoClient')).createDemoClient()
  //Create a client with authentication required
  : createClient({
    appId,
    token,
    functionsVersion,
    serverUrl: '',
    requiresAuth: false,
    appBaseUrl,
  });
