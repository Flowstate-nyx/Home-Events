/**
 * Check-In Service
 * API calls for check-in operations
 */

import { API_BASE_URL, ENDPOINTS } from '../config/api.js';

/**
 * Verify order by order number (without checking in)
 */
export async function verifyOrder(accessToken, orderNumber) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CHECKIN.VERIFY(orderNumber)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Order not found');
  }

  return data;
}

/**
 * Process check-in for an order
 */
export async function processCheckIn(accessToken, orderNumber) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CHECKIN.PROCESS}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order_number: orderNumber }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Check-in failed');
  }

  return data;
}

/**
 * Get recent check-ins
 */
export async function getRecentCheckIns(accessToken, limit = 10) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CHECKIN.RECENT}?limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch recent check-ins');
  }

  return data;
}
