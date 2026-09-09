// Produit l'instantane du mode demonstration.
//
// Le mode demonstration est une version statique de l'application : pas de
// serveur, donc rien ne peut calculer a la volee. Ce script joue le seed
// (donc la vraie fonction analyzeTrip), appelle ensuite les fonctions dont
// l'interface a besoin, et fige entites et reponses dans un fichier JSON.
// Les chiffres publies sont donc ceux du moteur de production, pas des valeurs
// ecrites a la main.
//
//   node --experimental-strip-types devserver/export-demo.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

register(pathToFileURL(join(import.meta.dirname, 'loader.mjs')));

const { DEV_USER, store } = await import('./store.mjs');
const { invokeFunction } = await import('./functions.mjs');
const { seed } = await import('./seed.mjs');
const { functionKey, SNAPSHOT_FILE } = await import('../src/lib/demoSnapshot.js');

// Seules les entites que l'interface lit vraiment. OsmTileCache pese 164 Ko et
// n'est consultee que par les fonctions backend, qui ne tournent pas en demo.
const EXPORTED_ENTITIES = ['Trip', 'DrivingEvent', 'ParentLink', 'RegionDownload'];

await seed();

const trips = store.query('Trip', { sort: '-start_time' });

const calls = [
  ['computeCoaching', { period: 'week' }],
  ['computeCoaching', { period: 'month' }],
  ['computeCoaching', { days: 7 }],
  ['computeCoaching', { days: 30 }],
  ['computeCoaching', { days: 90 }],
  ['computeCoaching', { days: null }],
  ...trips.map((t) => ['computeCoaching', { tripId: t.id }]),
];

const functions = {};
for (const [name, args] of calls) {
  const { status, data } = await invokeFunction(name, args);
  if (status !== 200) {
    console.warn(`[export-demo] ${name} ${JSON.stringify(args)} -> ${status}, ignore`);
    continue;
  }
  functions[functionKey(name, args)] = data;
  console.log(`[export-demo] ${name} ${JSON.stringify(args)} -> ok`);
}

const entities = {};
for (const name of EXPORTED_ENTITIES) entities[name] = store.query(name, {});

const snapshot = {
  generated_at: new Date().toISOString(),
  user: DEV_USER,
  entities,
  functions,
};

const outDir = join(import.meta.dirname, '..', 'demo');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, SNAPSHOT_FILE);
writeFileSync(out, JSON.stringify(snapshot));

const sizeKo = Math.round(JSON.stringify(snapshot).length / 1024);
console.log(`[export-demo] ${out} ecrit (${sizeKo} Ko)`);
console.log(`[export-demo] entites: ${Object.entries(entities).map(([k, v]) => `${k}=${v.length}`).join(' ')}`);
console.log(`[export-demo] reponses de fonctions figees: ${Object.keys(functions).length}`);
