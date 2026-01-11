/**
 * Orders Service
 * API calls for order management
 */

import { API_BASE_URL, ENDPOINTS } from '../config/api.js';

/**
 * Fetch orders with optional filters
 */
export async function fetchOrders(accessToken, filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.status) params.append('status', filters.status);
  if (filters.eventId) params.append('event_id', filters.eventId);
  if (filters.search) params.append('search', filters.search);
  if (filters.page) params.append('page', filters.page);
  if (filters.limit) params.append('limit', filters.limit);

  const queryString = params.toString();
  const url = `${API_BASE_URL}${ENDPOINTS.ORDERS.LIST}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch orders');
  }

  return data;
}

/**
 * Get single order by ID
 */
export async function fetchOrder(accessToken, orderId) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.ORDERS.GET(orderId)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch order');
  }

  return data;
}

/**
 * Update order status
 */
export async function updateOrderStatus(accessToken, orderId, status) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.ORDERS.UPDATE_STATUS(orderId)}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to update order status');
  }

  return data;
}

/**
 * Resend ticket email
 */
export async function resendOrderEmail(accessToken, orderId) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.ORDERS.RESEND_EMAIL(orderId)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to resend email');
  }

  return data;
}
