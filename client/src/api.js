import axios from 'axios';
import { getCurrentUser } from './utils/auth';

// API URL'ini dinamik olarak ayarla - telefon erişimi için
function getApiBaseURL() {
  // Environment variable varsa onu kullan
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Production'da aynı origin kullan
  if (import.meta.env.PROD) {
    return '/api';
  }
  
  // Development'ta mevcut hostname'i kullan (telefon erişimi için)
  const hostname = window.location.hostname;
  const port = '5174'; // Backend portu
  return `http://${hostname}:${port}/api`;
}

const baseURL = getApiBaseURL();

const api = axios.create({ baseURL });
const raw = axios.create({ baseURL });

function getAccessToken() {
  return localStorage.getItem('token');
}

function getRefreshToken() {
  return localStorage.getItem('refresh_token');
}

function storeSession(payload = {}) {
  if (payload.access_token) localStorage.setItem('token', payload.access_token);
  if (payload.refresh_token) localStorage.setItem('refresh_token', payload.refresh_token);
  if (payload.user) localStorage.setItem('user', JSON.stringify(payload.user));
  if (payload.branchPreference) localStorage.setItem('branchPreference', payload.branchPreference);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('user-change', { detail: payload.user || getCurrentUser() }));
  }
}

function clearSession(redirect = true) {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  localStorage.removeItem('branchPreference');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('user-change', { detail: null }));
    window.dispatchEvent(new CustomEvent('branch-change', { detail: null }));
    if (redirect) {
      window.location.href = '/';
    }
  }
}

api.interceptors.request.use(config => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise = null;

async function refreshTokens() {
  if (refreshPromise) return refreshPromise;
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('missing refresh token');
  }
  refreshPromise = raw
    .post('/auth/refresh', { refresh_token: refreshToken })
    .then(res => {
      storeSession(res.data);
      return res.data.access_token;
    })
    .catch(err => {
      clearSession();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

const AUTH_ENDPOINTS = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);

api.interceptors.response.use(
  response => response,
  async error => {
    const status = error.response?.status;
    const original = error.config || {};
    const path = original.url || '';
    if (
      status === 401 &&
      !original.__isRetry &&
      !AUTH_ENDPOINTS.has(path) &&
      getRefreshToken()
    ) {
      try {
        const newAccess = await refreshTokens();
        original.__isRetry = true;
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api.request(original);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
    if (status === 401 || status === 403) {
      clearSession();
    }
    return Promise.reject(error);
  }
);

export function saveAuthSession(data) {
  storeSession(data);
}

export function clearAuthSession(redirect = true) {
  clearSession(redirect);
}

export default api;
