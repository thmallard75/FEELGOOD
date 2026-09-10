// Auth auto-hebergee : e-mail, Google, Facebook, Apple.
// Pas de Base44 — les jetons JWT sont signes par TON serveur.

import { createHmac, createPrivateKey, randomBytes, scryptSync, sign as cryptoSign, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { store, DEV_USER } from './store.mjs';
import { collectAllowedOrigins, sanitizeFromUrl } from './safeUrl.mjs';

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dirname, '.data');
const TOKEN_TTL = 60 * 60 * 24 * 30;

function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const path = join(DATA_DIR, 'jwt.secret');
  if (existsSync(path)) return readFileSync(path, 'utf8').trim();
  mkdirSync(DATA_DIR, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  writeFileSync(path, secret);
  return secret;
}

const JWT_SECRET = loadJwtSecret();

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function signJwt(payload, ttlSec = TOKEN_TTL) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function publicUser(user) {
  if (!user) return null;
  const { password_hash: _ph, oauth: _oauth, ...rest } = user;
  return rest;
}

export function findUserByEmail(email) {
  if (!email) return null;
  const needle = String(email).trim().toLowerCase();
  return store.query('User', { q: { email: needle } })[0] || null;
}

export function findUserById(id) {
  return id ? store.get('User', id) : null;
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const pwd = String(password);
  if (pwd.length > 128) {
    const err = new Error('Mot de passe trop long');
    err.status = 400;
    throw err;
  }
  const hash = scryptSync(pwd, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  if (!stored || !password) return false;
  if (String(password).length > 128) return false;
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, 'hex');
  return prev.length === next.length && timingSafeEqual(prev, next);
}

export function upsertOAuthUser({ email, full_name, provider, providerId }) {
  const normalized = String(email).trim().toLowerCase();
  let user = findUserByEmail(normalized);
  if (user) {
    const linked = user.oauth?.[provider];
    if (linked && String(linked) !== String(providerId)) {
      const err = new Error('Ce compte est déjà lié à un autre identifiant.');
      err.status = 409;
      throw err;
    }
    if (user.password_hash && !linked) {
      const err = new Error('Un compte existe déjà avec cet e-mail. Connecte-toi d’abord avec ton mot de passe.');
      err.status = 409;
      throw err;
    }
    const oauth = { ...(user.oauth || {}), [provider]: providerId };
    store.update('User', user.id, {
      oauth,
      full_name: user.full_name || full_name,
      last_login: new Date().toISOString(),
    });
    return store.get('User', user.id);
  }
  return store.create('User', {
    email: normalized,
    full_name: full_name || normalized.split('@')[0],
    role: 'user',
    profile_type: 'driver',
    oauth: { [provider]: providerId },
    last_login: new Date().toISOString(),
  }, { id: 'auth', email: normalized });
}

export function registerEmailUser({ email, password, full_name }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized.includes('@')) {
    const err = new Error('Adresse e-mail invalide');
    err.status = 400;
    throw err;
  }
  if (!password || String(password).length < 8) {
    const err = new Error('Mot de passe : 8 caractères minimum');
    err.status = 400;
    throw err;
  }
  if (String(password).length > 128) {
    const err = new Error('Mot de passe trop long');
    err.status = 400;
    throw err;
  }
  if (findUserByEmail(normalized)) {
    const err = new Error('Un compte existe déjà avec cet e-mail');
    err.status = 409;
    throw err;
  }
  return store.create('User', {
    email: normalized,
    full_name: full_name?.trim() || normalized.split('@')[0],
    role: 'user',
    profile_type: 'driver',
    password_hash: hashPassword(password),
    last_login: new Date().toISOString(),
  }, { id: 'auth', email: normalized });
}

export function loginEmailUser({ email, password }) {
  const user = findUserByEmail(email);
  if (!user || !checkPassword(password, user.password_hash)) {
    const err = new Error('E-mail ou mot de passe incorrect');
    err.status = 401;
    throw err;
  }
  store.update('User', user.id, { last_login: new Date().toISOString() });
  return store.get('User', user.id);
}

export function ensureSeedUser() {
  const existing = store.get('User', DEV_USER.id) || findUserByEmail(DEV_USER.email);
  if (existing) return existing;
  const password = process.env.FEELGOOD_USER_PASSWORD || 'feelgood-dev';
  return store.create('User', {
    id: DEV_USER.id,
    email: String(DEV_USER.email).toLowerCase(),
    full_name: DEV_USER.full_name,
    role: 'admin',
    profile_type: 'driver',
    password_hash: hashPassword(password),
  }, DEV_USER);
}

export function configuredProviders() {
  return {
    email: true,
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    facebook: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
  };
}

export function publicApiUrl(req) {
  const explicit = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    || (req.headers.host?.includes('localhost') ? 'http' : 'https');
  return `${proto}://${req.headers.host}`;
}

export function safeFromUrl(raw, fallback, req) {
  return sanitizeFromUrl(raw, fallback || '/', {
    allowedOrigins: collectAllowedOrigins(req),
    requestHost: req?.headers?.host || '',
  });
}

function callbackUri(req, provider) {
  return `${publicApiUrl(req)}/api/apps/auth/callback/${provider}`;
}

export function oauthStartUrl(req, provider, fromUrl) {
  const state = signJwt({ from_url: fromUrl, provider }, 600);
  const redirectUri = callbackUri(req, provider);
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  if (provider === 'facebook') {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  }
  if (provider === 'apple') {
    const params = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state,
    });
    return `https://appleid.apple.com/auth/authorize?${params}`;
  }
  const err = new Error(`Fournisseur inconnu: ${provider}`);
  err.status = 404;
  throw err;
}

function appleClientSecret() {
  const pem = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const key = createPrivateKey(pem);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 86400 * 150,
    aud: 'https://appleid.apple.com',
    sub: process.env.APPLE_CLIENT_ID,
  }));
  const sig = cryptoSign('SHA256', Buffer.from(`${header}.${payload}`), key).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function googleProfile(req, code) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUri(req, 'google'),
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenRes.json();
  if (!token.access_token) throw new Error(token.error_description || 'Echange Google refuse');
  const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).then((r) => r.json());
  if (!me.email) throw new Error('Google n’a pas renvoyé d’e-mail');
  return { email: me.email, full_name: me.name, providerId: me.id };
}

async function facebookProfile(req, code) {
  const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID,
    client_secret: process.env.FACEBOOK_APP_SECRET,
    redirect_uri: callbackUri(req, 'facebook'),
    code,
  })}`);
  const token = await tokenRes.json();
  if (!token.access_token) throw new Error(token.error?.message || 'Echange Facebook refuse');
  const me = await fetch(`https://graph.facebook.com/me?${new URLSearchParams({
    fields: 'id,name,email',
    access_token: token.access_token,
  })}`).then((r) => r.json());
  if (!me.email) throw new Error('Facebook n’a pas renvoyé d’e-mail — autorise l’e-mail dans l’app Facebook');
  return { email: me.email, full_name: me.name, providerId: me.id };
}

async function appleProfile(req, code) {
  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_CLIENT_ID,
      client_secret: appleClientSecret(),
      redirect_uri: callbackUri(req, 'apple'),
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenRes.json();
  if (!token.id_token) throw new Error(token.error_description || 'Echange Apple refuse');
  const payload = JSON.parse(Buffer.from(token.id_token.split('.')[1], 'base64url').toString('utf8'));
  if (!payload.email) throw new Error('Apple n’a pas renvoyé d’e-mail');
  return { email: payload.email, full_name: payload.email.split('@')[0], providerId: payload.sub };
}

export async function finishOAuth(req, provider, { code, state }) {
  const st = verifyJwt(state);
  if (!st || st.provider !== provider) {
    const err = new Error('Session OAuth invalide ou expirée');
    err.status = 400;
    throw err;
  }
  if (!configuredProviders()[provider]) {
    const err = new Error(`Le fournisseur ${provider} n’est pas configuré`);
    err.status = 400;
    throw err;
  }
  let profile;
  if (provider === 'google') profile = await googleProfile(req, code);
  else if (provider === 'facebook') profile = await facebookProfile(req, code);
  else if (provider === 'apple') profile = await appleProfile(req, code);
  else {
    const err = new Error(`Fournisseur inconnu: ${provider}`);
    err.status = 404;
    throw err;
  }
  const user = upsertOAuthUser({ ...profile, provider });
  const access_token = signJwt({ sub: user.id, email: user.email });
  const from = safeFromUrl(st.from_url, process.env.APP_PUBLIC_URL, req);
  const dest = new URL(from, publicApiUrl(req));
  dest.searchParams.set('access_token', access_token);
  return { user, access_token, redirect: dest.toString() };
}

export function tokenFor(user) {
  return signJwt({ sub: user.id, email: user.email });
}

export function userFromRequest(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const queryToken = (() => {
    try {
      return new URL(req.url, 'http://local').searchParams.get('access_token');
    } catch {
      return '';
    }
  })();
  const payload = verifyJwt(bearer || queryToken);
  if (!payload?.sub) return null;
  return findUserById(payload.sub);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function ownsYoungDriverLink(user, link) {
  if (!user || !link) return false;
  if (link.created_by_id === user.id) return true;
  return normalizeEmail(link.young_driver_email) === normalizeEmail(user.email);
}

function parentInviteCopy(user, link) {
  const name = user.full_name || String(user.email || '').split('@')[0] || 'Un jeune conducteur';
  const code = link?.invite_code ? String(link.invite_code) : '';
  const codeBlock = code
    ? `Code d'invitation (à saisir dans l'Espace Parent) : ${code}

`
    : '';
  return {
    subject: `${name} vous invite sur FeelGood Conduite`,
    body: `Bonjour,

${name} vous invite à suivre sa progression sur FeelGood Conduite.

${codeBlock}Connectez-vous (ou créez un compte) avec cette adresse email, puis ouvrez l'Espace Parent et saisissez le code. Sans ce code, l'invitation reste en attente.

Vous pourrez suivre :
• Le score global de conduite (semaine et mois)
• La progression au fil des semaines
• Les statistiques par catégorie
• Les alertes importantes (fatigue, téléphone)
• Le kilométrage total

Aucune donnée de localisation ni détail de trajet ne sera partagé — uniquement les statistiques globales.

L'accès peut être révoqué à tout moment par le conducteur.

Bonne route !
L'équipe FeelGood Conduite`,
  };
}

function findOwnedParentInvite(user, dest, parentLinkId) {
  if (parentLinkId) {
    const link = store.get('ParentLink', parentLinkId);
    if (
      ownsYoungDriverLink(user, link)
      && link.status !== 'revoked'
      && (!dest || normalizeEmail(link.parent_email) === dest)
    ) {
      return link;
    }
    return null;
  }
  return store.query('ParentLink').find((row) => (
    ownsYoungDriverLink(user, row)
    && row.status !== 'revoked'
    && normalizeEmail(row.parent_email) === dest
  )) || null;
}

// Interne : résumé hebdo, etc. Ne pas relayer tel quel depuis HTTP.
export async function sendAppEmail({ to, subject, body }) {
  if (typeof to !== 'string' || !isEmail(normalizeEmail(to))) {
    throw httpError(400, 'Adresse e-mail invalide');
  }
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'FeelGood <noreply@localhost>',
        to: normalizeEmail(to),
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw httpError(502, `Envoi e-mail refuse: ${text}`);
    }
    return { ok: true, provider: 'resend' };
  }
  console.log(`[api] e-mail (non envoye, pas de RESEND_API_KEY) -> ${normalizeEmail(to)}: ${subject}\n${body}`);
  return { ok: true, simulated: true };
}

export async function sendParentInviteEmail(user, payload = {}) {
  const dest = typeof payload.to === 'string' ? normalizeEmail(payload.to) : '';
  const parentLinkId = typeof payload.parentLinkId === 'string' ? payload.parentLinkId : '';
  if (!dest && !parentLinkId) throw httpError(400, 'Adresse e-mail invalide');
  if (dest && !isEmail(dest)) throw httpError(400, 'Adresse e-mail invalide');

  const link = findOwnedParentInvite(user, dest, parentLinkId);
  if (!link) throw httpError(403, 'Invitation parent introuvable');

  const to = normalizeEmail(link.parent_email);
  const { subject, body } = parentInviteCopy(user, link);
  return sendAppEmail({ to, subject, body });
}
