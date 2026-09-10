// Isolation des enregistrements (RLS) : HTTP et fonctions backend partagent
// les memes regles. Les caches OSM sont partages en lecture ; les ecritures
// passent uniquement par asServiceRole. Le reste appartient au createur,
// sauf ParentLink (jeune + parent invite, pas revoque).

import { randomInt, timingSafeEqual } from 'node:crypto';

export const SHARED_ENTITIES = new Set([
  'OsmTileCache',
  'DepartementPreload',
  'OsmFeatureCache',
]);

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return out;
}

export function normalizeInviteCode(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function inviteCodesMatch(provided, expected) {
  const a = Buffer.from(normalizeInviteCode(provided), 'utf8');
  const b = Buffer.from(normalizeInviteCode(expected), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function scopedQuery(entity, user, extra) {
  if (!user) return { id: { $in: [] } };
  if (SHARED_ENTITIES.has(entity)) return extra;
  if (entity === 'ParentLink') {
    const owner = {
      $or: [
        { created_by_id: user.id },
        { young_driver_email: user.email },
        { $and: [{ parent_email: user.email }, { status: { $ne: 'revoked' } }] },
      ],
    };
    return extra ? { $and: [extra, owner] } : owner;
  }
  return extra ? { $and: [extra, { created_by_id: user.id }] } : { created_by_id: user.id };
}

export function canRead(entity, rec, user) {
  if (!rec || !user) return false;
  if (SHARED_ENTITIES.has(entity)) return true;
  if (entity === 'ParentLink') {
    if (rec.created_by_id === user.id || rec.young_driver_email === user.email) return true;
    return rec.parent_email === user.email && rec.status !== 'revoked';
  }
  return rec.created_by_id === user.id;
}

export function canWrite(entity, rec, user) {
  if (!rec || !user) return false;
  if (SHARED_ENTITIES.has(entity)) return false;
  if (entity === 'ParentLink') {
    if (rec.created_by_id === user.id || rec.young_driver_email === user.email) return true;
    return rec.parent_email === user.email && rec.status !== 'revoked';
  }
  return rec.created_by_id === user.id;
}

export function isParentOnly(rec, user) {
  return rec?.parent_email === user.email
    && rec.created_by_id !== user.id
    && rec.young_driver_email !== user.email;
}

export function parentLinkPatchAllowed(rec, user, patch = {}) {
  if (!canWrite('ParentLink', rec, user)) return false;
  if (!isParentOnly(rec, user)) return true;
  if (rec.status === 'revoked') return false;
  const keys = Object.keys(patch).filter((key) => (
    patch[key] !== undefined
    && !['id', 'updated_date', 'created_date', 'created_by', 'created_by_id'].includes(key)
  ));
  if (keys.some((key) => key !== 'status' && key !== 'invite_code')) return false;
  if (patch.status && patch.status !== 'active') return false;
  if (patch.status === 'active') {
    if (rec.status !== 'pending') return false;
    if (!inviteCodesMatch(patch.invite_code, rec.invite_code)) return false;
  }
  return true;
}

export function parentOwnedPatch(rec, user, patch = {}) {
  if (!isParentOnly(rec, user) || !patch || typeof patch !== 'object') return patch;
  const { invite_code: _code, ...rest } = patch;
  return rest;
}

export function presentRecord(entity, rec, user) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec;
  if (entity !== 'ParentLink') return rec;
  if (!isParentOnly(rec, user)) return rec;
  const { invite_code: _code, ...rest } = rec;
  return rest;
}

export function stripOwnership(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const {
    id: _id,
    created_by: _cb,
    created_by_id: _cbi,
    created_date: _cd,
    ...rest
  } = data;
  return rest;
}
