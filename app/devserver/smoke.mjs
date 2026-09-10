// Verifie que TON API calcule les KPI : GPS in, scores out.
//
//   FEELGOOD_SEED=0 node --experimental-strip-types devserver/server.mjs
//   node --experimental-strip-types devserver/smoke.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeFromUrl } from './safeUrl.mjs';
import { MemoryStore } from '../src/lib/memoryStore.js';

const API = process.env.API_URL || 'http://127.0.0.1:8787';
const APP = 'feelgood';
const SERVICE_KEY = process.env.FEELGOOD_SERVICE_KEY || process.env.GEOFABRIK_SERVICE_KEY || 'dev-geofabrik-key';
const FIXTURES = join(import.meta.dirname, 'fixtures');

function fail(msg) {
  console.error(`[smoke] ${msg}`);
  process.exit(1);
}

let token = '';

async function req(method, path, body, extraHeaders = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders };
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

async function svc(method, path, body) {
  const headers = { Accept: 'application/json', 'x-service-key': SERVICE_KEY };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
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

const wipe = await req('GET', '/__dev/reseed');
if (wipe.status !== 404) fail(`/__dev/reseed devrait etre 404 hors FEELGOOD_DEV_ROUTES, pas ${wipe.status}`);
console.log('[smoke] /__dev/reseed bloque');

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
if (bulk.status !== 403) fail(`OsmTileCache/bulk devrait etre 403, pas ${bulk.status}`);
const wipeTiles = await req('DELETE', `/api/apps/${APP}/entities/OsmTileCache`);
if (wipeTiles.status !== 403) fail(`OsmTileCache DELETE devrait etre 403, pas ${wipeTiles.status}`);
console.log('[smoke] cache OSM en lecture seule via HTTP');

const noKey = await fetch(`${API}/functions/getPendingDepartements`, { headers: { Accept: 'application/json' } });
if (noKey.status !== 403) fail(`getPending sans cle devrait etre 403, pas ${noKey.status}`);
const pending = await svc('GET', '/functions/getPendingDepartements');
if (!pending.ok || !Array.isArray(pending.data?.pending)) {
  fail(`getPendingDepartements -> ${pending.status} ${JSON.stringify(pending.data)}`);
}
const imported = await svc('POST', `/api/apps/${APP}/functions/importGeofabrikTiles`, {
  departement_code: '67',
  batch: tiles,
  is_final: true,
  cells_total: tiles.length,
});
if (!imported.ok || !(imported.data?.created >= 1)) {
  fail(`importGeofabrikTiles -> ${imported.status} ${JSON.stringify(imported.data)}`);
}
const again = await svc('POST', `/functions/importGeofabrikTiles`, {
  departement_code: '67',
  batch: tiles,
  is_final: true,
  cells_total: tiles.length,
});
if (!again.ok || again.data?.created !== 0) {
  fail(`doublon Geofabrik devrait etre skipped: ${again.status} ${JSON.stringify(again.data)}`);
}
console.log(`[smoke] Geofabrik ${imported.data.created} tuiles, skip=${again.data.skipped}`);

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

const relay = await req('POST', `/api/apps/${APP}/integrations/send-email`, {
  to: 'relay@example.com',
  subject: 'spam',
  body: 'open relay',
});
if (relay.status !== 403) fail(`send-email hors ParentLink devrait etre 403, pas ${relay.status}`);
console.log('[smoke] send-email refuse hors invitation');

const parentEmail = `parent-${Date.now()}@feelgood.local`;
const invite = await req('POST', `/api/apps/${APP}/entities/ParentLink`, {
  young_driver_email: email,
  young_driver_name: 'Smoke',
  parent_email: parentEmail,
  status: 'pending',
});
if (!invite.ok || !invite.data?.id) fail(`ParentLink.create -> ${invite.status} ${JSON.stringify(invite.data)}`);
if (!invite.data.invite_code || invite.data.status !== 'pending') {
  fail(`invitation sans code: ${JSON.stringify(invite.data)}`);
}
const inviteCode = invite.data.invite_code;

const sent = await req('POST', `/api/apps/${APP}/integrations/send-email`, {
  parentLinkId: invite.data.id,
  to: parentEmail,
  subject: 'ceci ne doit pas partir',
  body: 'contenu client ignore',
});
if (!sent.ok || sent.data?.ok !== true) {
  fail(`send-email invitation -> ${sent.status} ${JSON.stringify(sent.data)}`);
}
console.log('[smoke] send-email invitation parent ok');

token = other.data.access_token;
const stolen = await req('POST', `/api/apps/${APP}/integrations/send-email`, {
  parentLinkId: invite.data.id,
  to: parentEmail,
});
if (stolen.status !== 403) fail(`send-email d'un autre compte devrait etre 403, pas ${stolen.status}`);
token = original;
console.log('[smoke] send-email isole par compte');

const spoof = await req('POST', `/api/apps/${APP}/entities/Trip`, {
  status: 'pending_analysis',
  created_by_id: other.data.user.id,
  gps_track: [],
});
if (!spoof.ok) fail(`Trip.create spoof -> ${spoof.status} ${JSON.stringify(spoof.data)}`);
if (spoof.data.created_by_id !== me.data.id) {
  fail(`created_by_id client a ete honore: ${spoof.data.created_by_id}`);
}
token = other.data.access_token;
const stolenTrip = await req('GET', `/api/apps/${APP}/entities/Trip/${spoof.data.id}`);
if (stolenTrip.status !== 404) fail(`spoof Trip visible par l'autre compte (${stolenTrip.status})`);
const stolenFn = await req('POST', `/api/apps/${APP}/functions/analyzeTrip`, { tripId: trip.data.id });
if (stolenFn.status !== 404) fail(`analyzeTrip d'un autre trajet devrait etre 404, pas ${stolenFn.status}`);
const blast = await req('POST', `/api/apps/${APP}/functions/sendWeeklySummary`, { all: true, email: email });
if (blast.data?.scope === 'all') fail('sendWeeklySummary all encore possible');
const cron = await req('POST', `/api/apps/${APP}/functions/retryPendingOsm`, {});
if (cron.status !== 403) fail(`retryPendingOsm sans cle devrait etre 403, pas ${cron.status}`);
token = original;
console.log('[smoke] isolation fonctions + created_by_id ok');

const seedStore = new MemoryStore({ actor: { id: 'user-local-1', email: 'moi@localhost' } });
const seedUser = seedStore.create('User', {
  id: 'user-local-1',
  email: 'moi@localhost',
}, { id: 'user-local-1', email: 'moi@localhost' });
if (seedUser.id !== 'user-local-1') fail(`id seed perdu: ${seedUser.id}`);
const seedTrip = seedStore.create('Trip', { created_by_id: 'hacker' }, { id: 'user-local-1', email: 'moi@localhost' });
if (seedTrip.created_by_id !== 'user-local-1') fail(`actor ecrase par le client: ${seedTrip.created_by_id}`);
console.log('[smoke] id seed conserve, owner force par l\'acteur');

const parentAcc = await req('POST', `/api/apps/${APP}/auth/register`, {
  email: parentEmail,
  password: 'smoke-pass-1',
  full_name: 'Parent',
});
if (!parentAcc.ok) fail(`register parent -> ${parentAcc.status} ${JSON.stringify(parentAcc.data)}`);
token = parentAcc.data.access_token;
const rewrite = await req('PUT', `/api/apps/${APP}/entities/ParentLink/${invite.data.id}`, {
  parent_email: 'stolen@evil.example',
  weekly_score: 99,
});
if (rewrite.status !== 403) fail(`parent rewrite devrait etre 403, pas ${rewrite.status}`);
const parentView = await req('GET', `/api/apps/${APP}/entities/ParentLink/${invite.data.id}`);
if (!parentView.ok) fail(`parent GET invitation -> ${parentView.status}`);
if (parentView.data.invite_code) fail('le parent ne doit pas lire invite_code');
if (parentView.data.young_driver_email) fail('le parent pending ne doit pas lire young_driver_email');
const parentDel = await req('DELETE', `/api/apps/${APP}/entities/ParentLink/${invite.data.id}`);
if (parentDel.ok) fail(`parent a pu supprimer l'invitation (${parentDel.status})`);
const oauthMe = await req('PUT', `/api/apps/${APP}/entities/User/me`, {
  oauth: { google: 'stolen-sub' },
  role: 'admin',
  email: 'hijack@evil.example',
});
if (!oauthMe.ok) fail(`User/me -> ${oauthMe.status}`);
if (oauthMe.data.oauth || oauthMe.data.role === 'admin' || oauthMe.data.email !== parentEmail) {
  fail(`User/me a honore des champs interdits: ${JSON.stringify(oauthMe.data)}`);
}
const huge = await req('POST', `/api/apps/${APP}/auth/register`, {
  email: `huge-${Date.now()}@feelgood.local`,
  password: 'x'.repeat(129),
  full_name: 'Huge',
});
if (huge.status !== 400) fail(`mot de passe trop long devrait etre 400, pas ${huge.status}`);
const fat = await req('POST', `/api/apps/${APP}/auth/register`, {
  email: `fat-${Date.now()}@feelgood.local`,
  password: 'p'.repeat(70_000),
  full_name: 'Fat',
});
if (fat.status !== 413) fail(`corps auth trop gros devrait etre 413, pas ${fat.status}`);
const noCode = await req('PUT', `/api/apps/${APP}/entities/ParentLink/bulk`, [
  { id: invite.data.id, status: 'active' },
]);
if (noCode.ok && noCode.data?.[0]?.status === 'active') {
  fail('activation parent sans code devrait echouer');
}
const accept = await req('PUT', `/api/apps/${APP}/entities/ParentLink/bulk`, [
  { id: invite.data.id, status: 'active', invite_code: inviteCode },
]);
if (!accept.ok || accept.data?.[0]?.status !== 'active') {
  fail(`parent bulk activate -> ${accept.status} ${JSON.stringify(accept.data)}`);
}
if (accept.data?.[0]?.invite_code) fail('la reponse parent expose encore invite_code');
token = original;
const revoke = await req('PUT', `/api/apps/${APP}/entities/ParentLink/${invite.data.id}`, {
  status: 'revoked',
});
if (!revoke.ok || revoke.data?.status !== 'revoked') {
  fail(`revoke -> ${revoke.status} ${JSON.stringify(revoke.data)}`);
}
token = parentAcc.data.access_token;
const afterRevoke = await req('GET', `/api/apps/${APP}/entities/ParentLink/${invite.data.id}`);
if (afterRevoke.status !== 404) fail(`parent voit encore le lien revoque (${afterRevoke.status})`);
token = original;
console.log('[smoke] parent code + revoke ok');

const evil = sanitizeFromUrl('https://evil.example/steal', '/', {
  allowedOrigins: new Set(['https://feelgood.example']),
  requestHost: 'feelgood.example',
});
if (evil !== '/') fail(`OAuth from_url ouvert: ${evil}`);
const native = sanitizeFromUrl('feelgood://auth', '/', {
  allowedOrigins: new Set(),
  requestHost: 'feelgood.example',
});
if (!native.startsWith('feelgood:')) fail(`deep link refuse: ${native}`);
const okApp = sanitizeFromUrl('https://feelgood.example/app', '/', {
  allowedOrigins: new Set(['https://feelgood.example']),
  requestHost: 'feelgood.example',
});
if (!okApp.startsWith('https://feelgood.example/')) fail(`origine app refusee: ${okApp}`);
console.log('[smoke] redirection OAuth bornee');

console.log('[smoke] OK — comptes + GPS sur le serveur, KPI via Geofabrik, pas Base44');
