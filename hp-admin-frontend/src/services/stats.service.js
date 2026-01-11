/**
 * Stats Service
 * API calls for analytics and statistics
 */

import { API_BASE_URL, ENDPOINTS } from '../config/api.js';

/**
 * Fetch overview statistics
 */
export async function fetchStats(accessToken) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.STATS.OVERVIEW}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch stats');
  }

  return data;
}
