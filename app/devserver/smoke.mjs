// Verifie que TON API calcule les KPI : GPS in, scores out.
//
//   FEELGOOD_SEED=0 node --experimental-strip-types devserver/server.mjs
//   node --experimental-strip-types devserver/smoke.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env.API_URL || 'http://127.0.0.1:8787';
const APP = 'feelgood';
const FIXTURES = join(import.meta.dirname, 'fixtures');

function fail(msg) {
  console.error(`[smoke] ${msg}`);
  process.exit(1);
}

let token = '';

async function req(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function timestampTrack(track, startTime) {
  let t = new Date(startTime).getTime();
  return track.map((p) => {
    const point = { ...p, accuracy_m: p.accuracy ?? 5, timestamp: new Date(t).toISOString() };
    delete point.accuracy;
    t += 1000;
    return point;
  });
}

const health = await req('GET', '/health');
if (!health.ok || health.data?.ok !== true) fail(`/health -> ${health.status} ${JSON.stringify(health.data)}`);
console.log('[smoke] /health ok');

const unauth = await req('GET', `/api/apps/${APP}/entities/User/me`);
if (unauth.status !== 401) fail(`User/me sans jeton devrait etre 401, pas ${unauth.status}`);
console.log('[smoke] 401 sans compte');

const email = `smoke-${Date.now()}@feelgood.local`;
const registered = await req('POST', `/api/apps/${APP}/auth/register`, {
  email,
  password: 'smoke-pass-1',
  full_name: 'Smoke',
});
if (!registered.ok || !registered.data?.access_token) {
  fail(`register -> ${registered.status} ${JSON.stringify(registered.data)}`);
}
token = registered.data.access_token;
console.log(`[smoke] compte ${email}`);

const me = await req('GET', `/api/apps/${APP}/entities/User/me`);
if (!me.ok || me.data?.email !== email) fail(`User/me -> ${me.status} ${JSON.stringify(me.data)}`);
console.log(`[smoke] User/me ${me.data.email}`);

const tiles = JSON.parse(readFileSync(join(FIXTURES, 'osm_tiles_dossenheim.json'), 'utf8'));
const bulk = await req('POST', `/api/apps/${APP}/entities/OsmTileCache/bulk`, tiles.map((t) => ({
  ...t,
  cached_at: new Date().toISOString(),
})));
if (!bulk.ok) fail(`OsmTileCache/bulk -> ${bulk.status} ${JSON.stringify(bulk.data)}`);
console.log(`[smoke] ${tiles.length} tuiles OSM chargees`);

const rawTrack = JSON.parse(readFileSync(join(FIXTURES, 'dossenheim_track.json'), 'utf8'));
const gps_track = timestampTrack(rawTrack, new Date().toISOString());
const trip = await req('POST', `/api/apps/${APP}/entities/Trip`, {
  status: 'pending_analysis',
  gps_track,
  distraction_signals: [],
  distance_km: 0.8,
  start_address: 'Smoke Dossenheim',
});
if (!trip.ok || !trip.data?.id) fail(`Trip.create -> ${trip.status} ${JSON.stringify(trip.data)}`);
console.log(`[smoke] trajet ${trip.data.id} (${gps_track.length} pts)`);

const started = Date.now();
const analysis = await req('POST', `/api/apps/${APP}/functions/analyzeTrip`, { tripId: trip.data.id });
const ms = Date.now() - started;
if (!analysis.ok || analysis.data?.ok !== true) {
  fail(`analyzeTrip -> ${analysis.status} ${JSON.stringify(analysis.data)}`);
}
const kpis = analysis.data.kpis;
if (!kpis || typeof kpis.overall_score !== 'number') {
  fail(`KPI manquants dans la reponse: ${JSON.stringify(analysis.data)}`);
}
console.log(`[smoke] analyzeTrip ${ms} ms — score=${kpis.overall_score} serenite=${kpis.serenity_index} coverage=${kpis.osm_coverage}`);

const stored = await req('GET', `/api/apps/${APP}/entities/Trip/${trip.data.id}`);
if (stored.data?.status === 'pending_analysis') {
  fail(`le trajet est reste en pending_analysis: ${JSON.stringify(stored.data)}`);
}
console.log(`[smoke] trajet persiste statut=${stored.data.status} score=${stored.data.overall_score}`);

const other = await req('POST', `/api/apps/${APP}/auth/register`, {
  email: `other-${Date.now()}@feelgood.local`,
  password: 'smoke-pass-1',
  full_name: 'Autre',
});
const original = token;
token = other.data.access_token;
const peek = await req('GET', `/api/apps/${APP}/entities/Trip/${trip.data.id}`);
if (peek.status !== 404) fail(`l'autre compte voit le trajet (${peek.status})`);
token = original;
console.log('[smoke] isolation des trajets ok');
console.log('[smoke] OK — comptes + GPS sur le serveur, KPI renvoyes, pas Base44');
