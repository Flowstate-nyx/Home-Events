/**
 * API Configuration
 * Central place for all API endpoints and configuration
 */

// Base URL - uses Vite proxy in development, direct URL in production
export const API_BASE_URL = import.meta.env.PROD 
  ? 'https://home-events-production.up.railway.app'
  : '';

// API Endpoints - ONLY endpoints that actually exist in the backend
export const ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    ME: '/api/auth/me',
  },

  // Events (tiers are managed inside event payload)
  EVENTS: {
    LIST: '/api/admin/events',
    CREATE: '/api/admin/events',
    GET: (id) => `/api/admin/events/${id}`,
    UPDATE: (id) => `/api/admin/events/${id}`,
    DELETE: (id) => `/api/admin/events/${id}`,
  },

  // Orders
  ORDERS: {
    LIST: '/api/admin/orders',
    GET: (id) => `/api/admin/orders/${id}`,
    UPDATE_STATUS: (id) => `/api/admin/orders/${id}/status`,
    RESEND_EMAIL: (id) => `/api/admin/orders/${id}/resend-email`,
  },

  // Check-in
  CHECKIN: {
    PROCESS: '/api/checkin',
    VERIFY: (orderNumber) => `/api/checkin/verify/${orderNumber}`,
    RECENT: '/api/admin/checkins',
  },

  // Stats
  STATS: {
    OVERVIEW: '/api/admin/stats',
  },

  // Gallery
  GALLERY: {
    LIST: '/api/admin/gallery',
    CREATE: '/api/admin/gallery',
    UPDATE: (id) => `/api/admin/gallery/${id}`,
    DELETE: (id) => `/api/admin/gallery/${id}`,
  },
};

// Request timeout in milliseconds
export const REQUEST_TIMEOUT = 30000;

// Token storage keys
export const STORAGE_KEYS = {
  REFRESH_TOKEN: 'hp_refresh_token',
  USER: 'hp_user',
};
