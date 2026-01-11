/**
 * Auth Service
 * Handles authentication API calls
 */

import { API_BASE_URL, ENDPOINTS, STORAGE_KEYS } from '../config/api.js';

/**
 * Login with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<object>} User data and tokens
 */
export async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.LOGIN}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Login failed');
  }

  // Store refresh token in localStorage for persistence
  if (data.refreshToken) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
  }

  // Store user info for quick access
  if (data.user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
  }

  return data;
}

/**
 * Logout - clear tokens and call logout endpoint
 * @param {string} accessToken - Current access token
 */
export async function logout(accessToken) {
  try {
    // Call logout endpoint to invalidate refresh token on server
    if (accessToken) {
      await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.LOGOUT}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    }
  } catch (error) {
    // Ignore logout errors - we'll clear local state anyway
    console.warn('Logout API call failed:', error);
  } finally {
    // Always clear local storage
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }
}

/**
 * Refresh access token using refresh token
 * @returns {Promise<object>} New tokens
 */
export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.REFRESH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Clear invalid tokens
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    throw new Error(data.message || 'Token refresh failed');
  }

  // Update stored refresh token if a new one is provided
  if (data.refreshToken) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
  }

  return data;
}

/**
 * Get current user from token
 * @param {string} accessToken - Access token
 * @returns {Promise<object>} User data
 */
export async function getCurrentUser(accessToken) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.AUTH.ME}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to get user');
  }

  return data;
}

/**
 * Check if user has stored credentials (for auto-login attempt)
 * @returns {boolean}
 */
export function hasStoredCredentials() {
  return !!localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Get stored user info (for quick display before validation)
 * @returns {object|null}
 */
export function getStoredUser() {
  try {
    const userJson = localStorage.getItem(STORAGE_KEYS.USER);
    return userJson ? JSON.parse(userJson) : null;
  } catch {
    return null;
  }
}
