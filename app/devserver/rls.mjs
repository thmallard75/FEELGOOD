// Isolation des enregistrements (RLS) : HTTP et fonctions backend partagent
// les memes regles. Les collections OSM sont partagées ; le reste appartient
// au createur, sauf ParentLink (jeune + parent invite).

export const SHARED_ENTITIES = new Set([
  'OsmTileCache',
  'DepartementPreload',
  'RegionDownload',
  'OsmFeatureCache',
]);

export function scopedQuery(entity, user, extra) {
  if (!user) return { id: { $in: [] } };
  if (SHARED_ENTITIES.has(entity)) return extra;
  if (entity === 'ParentLink') {
    const owner = {
      $or: [
        { created_by_id: user.id },
        { parent_email: user.email },
        { young_driver_email: user.email },
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
    return rec.created_by_id === user.id
      || rec.parent_email === user.email
      || rec.young_driver_email === user.email;
  }
  return rec.created_by_id === user.id;
}

export function canWrite(entity, rec, user) {
  if (!rec || !user) return false;
  if (SHARED_ENTITIES.has(entity)) return true;
  if (entity === 'ParentLink') {
    return rec.created_by_id === user.id
      || rec.young_driver_email === user.email
      || rec.parent_email === user.email;
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
  if (keys.some((key) => key !== 'status')) return false;
  if (patch.status && patch.status !== 'active') return false;
  if (patch.status === 'active' && rec.status !== 'pending') return false;
  return true;
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
