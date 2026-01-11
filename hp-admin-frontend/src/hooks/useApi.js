/**
 * useApi Hook
 * Authenticated fetch wrapper with auto token refresh
 */

import { useCallback } from 'react';
import { useAuth } from './useAuth.js';
import { API_BASE_URL } from '../config/api.js';

export function useApi() {
  const { accessToken, refreshToken, logout } = useAuth();

  /**
   * Make authenticated API request
   * Automatically handles token refresh on 401
   */
  const fetchWithAuth = useCallback(async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const makeRequest = async (token) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
          'Authorization': `Bearer ${token}`,
        },
      });
      return response;
    };

    // First attempt with current token
    let response = await makeRequest(accessToken);

    // If 401, try refreshing token
    if (response.status === 401) {
      try {
        const newToken = await refreshToken();
        response = await makeRequest(newToken);
      } catch (error) {
        // Refresh failed - logout
        await logout();
        throw new Error('Session expired. Please login again.');
      }
    }

    // Parse response
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Request failed');
    }

    return data;
  }, [accessToken, refreshToken, logout]);

  // Convenience methods
  const get = useCallback((endpoint) => {
    return fetchWithAuth(endpoint, { method: 'GET' });
  }, [fetchWithAuth]);

  const post = useCallback((endpoint, body) => {
    return fetchWithAuth(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }, [fetchWithAuth]);

  const put = useCallback((endpoint, body) => {
    return fetchWithAuth(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }, [fetchWithAuth]);

  const del = useCallback((endpoint) => {
    return fetchWithAuth(endpoint, { method: 'DELETE' });
  }, [fetchWithAuth]);

  return { fetchWithAuth, get, post, put, del };
}
