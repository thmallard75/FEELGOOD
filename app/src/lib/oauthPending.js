/** Marque un aller-retour OAuth pour n'accepter le jeton que si on l'a demandé. */

export const OAUTH_PENDING_KEY = 'feelgood-oauth-pending';
const OAUTH_TTL_MS = 10 * 60 * 1000;

export function markOAuthPending() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OAUTH_PENDING_KEY, String(Date.now()));
}

export function consumeOAuthPending() {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(OAUTH_PENDING_KEY);
  window.localStorage.removeItem(OAUTH_PENDING_KEY);
  const started = Number(raw);
  return Number.isFinite(started) && Date.now() - started < OAUTH_TTL_MS;
}

export function isNativeAuthUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'feelgood:') return false;
    const host = url.hostname || url.host;
    const path = url.pathname.replace(/\/+$/, '');
    return (host === 'auth' && (path === '' || path === '/'))
      || ((host === '' || host === 'localhost') && path === '/auth');
  } catch {
    return false;
  }
}
