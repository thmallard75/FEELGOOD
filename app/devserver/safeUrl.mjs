// Destinations OAuth autorisees : origine de l'app / de l'API, chemins relatifs,
// et schemes natifs. Toute autre URL http(s) est refusee (pas de fuite de JWT).

const NATIVE_AUTH = 'feelgood://auth';

function isNativeAuthRedirect(url) {
  if (url.protocol !== 'feelgood:') return false;
  const host = url.hostname || url.host;
  const path = url.pathname.replace(/\/+$/, '');
  return (host === 'auth' && (path === '' || path === '/'))
    || ((host === '' || host === 'localhost') && path === '/auth');
}

function originOf(raw) {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isLoopbackHost(host) {
  const name = String(host || '').split(':')[0].toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}

export function collectAllowedOrigins(req) {
  const origins = new Set();
  for (const raw of [
    process.env.APP_PUBLIC_URL,
    process.env.PUBLIC_URL,
    process.env.RENDER_EXTERNAL_URL,
  ]) {
    const origin = originOf(raw);
    if (origin) origins.add(origin);
  }
  if (req?.headers?.host) {
    const proto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0].trim()
      || (isLoopbackHost(req.headers.host) ? 'http' : 'https');
    origins.add(`${proto}://${req.headers.host.split(',')[0].trim()}`);
  }
  return origins;
}

export function sanitizeFromUrl(raw, fallback = '/', { allowedOrigins = new Set(), requestHost = '' } = {}) {
  const candidate = raw || fallback || '/';
  try {
    const url = new URL(candidate);
    if (isNativeAuthRedirect(url)) return NATIVE_AUTH;
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (allowedOrigins.has(url.origin)) return url.toString();
      if (isLoopbackHost(url.hostname) && isLoopbackHost(requestHost)) return url.toString();
    }
  } catch {
    if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  }
  if (fallback && fallback !== raw) {
    return sanitizeFromUrl(fallback, '/', { allowedOrigins, requestHost });
  }
  return '/';
}
