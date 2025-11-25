const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5174/api';

function normalizeBase() {
  return API_BASE.replace(/\/+$/, '');
}

function resolveUploadsBase() {
  const base = normalizeBase();
  try {
    const parsed = new URL(base);
    return parsed.origin;
  } catch {
    // Fallback: strip trailing /api or similar segment manually
    return base.replace(/\/api\b.*$/i, '');
  }
}

function resolveToAbsolute(pathOrUrl = '') {
  const raw = String(pathOrUrl || '');
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  const base = normalizeBase();
  const trimmed = raw.replace(/^\/+/, '');
  if (!trimmed) return base;
  if (/^uploads\//i.test(trimmed)) {
    const uploadsBase = resolveUploadsBase();
    return `${uploadsBase}/${trimmed}`;
  }
  if (/^api\//i.test(trimmed)) {
    const uploadsBase = resolveUploadsBase();
    const normalized = trimmed.replace(/^api\/+/i, '');
    return `${uploadsBase}/${normalized}`;
  }
  return trimmed ? `${base}/${trimmed}` : base;
}

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage?.getItem('token') || null;
  } catch {
    return null;
  }
}

export function withAuth(pathOrUrl, extraParams = {}) {
  const absolute = resolveToAbsolute(pathOrUrl);
  const token = getStoredToken();
  try {
    const url = new URL(absolute);
    Object.entries(extraParams || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, value);
    });
    if (token) {
      url.searchParams.set('token', token);
    }
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    Object.entries(extraParams || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.set(key, value);
    });
    if (token) {
      params.set('token', token);
    }
    const query = params.toString();
    if (!query) return absolute;
    const joiner = absolute.includes('?') ? '&' : '?';
    return `${absolute}${joiner}${query}`;
  }
}

export function apiBaseUrl() {
  return normalizeBase();
}

export function resolveAssetUrl(pathOrUrl) {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return null;
  if (/^data:/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) {
    try {
      const base = new URL(normalizeBase());
      return `${base.protocol}${raw}`;
    } catch {
      return `http:${raw}`;
    }
  }
  const uploadsBase = resolveUploadsBase();
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const sanitized = normalized.replace(/^\/api(\/|$)/i, '/');
  return `${uploadsBase}${sanitized}`;
}
