export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1];
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    let json;
    if (typeof atob === 'function') {
      json = atob(padded);
    } else if (typeof Buffer !== 'undefined') {
      json = Buffer.from(padded, 'base64').toString('utf8');
    } else {
      return null;
    }
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getCurrentUser(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!storage) return null;
  const raw = storage.getItem('user');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  const token = storage.getItem('token');
  const payload = decodeJwt(token);
  if (!payload) return null;
  const { email = null, role = null, branch_id = null } = payload;
  return { email, role, branch_id };
}
