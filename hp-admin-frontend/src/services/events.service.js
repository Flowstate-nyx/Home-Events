/**
 * Events Service
 * API calls for event management
 */

import { API_BASE_URL, ENDPOINTS } from '../config/api.js';

/**
 * Fetch all events
 */
export async function fetchEvents(accessToken, filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.status) params.append('status', filters.status);
  if (filters.search) params.append('search', filters.search);

  const queryString = params.toString();
  const url = `${API_BASE_URL}${ENDPOINTS.EVENTS.LIST}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch events');
  }

  return data;
}

/**
 * Get single event by ID
 */
export async function fetchEvent(accessToken, eventId) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.EVENTS.GET(eventId)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch event');
  }

  return data;
}

/**
 * Create new event (with tiers in payload)
 */
export async function createEvent(accessToken, eventData) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.EVENTS.CREATE}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to create event');
  }

  return data;
}

/**
 * Update event (with tiers in payload)
 */
export async function updateEvent(accessToken, eventId, eventData) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.EVENTS.UPDATE(eventId)}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to update event');
  }

  return data;
}

/**
 * Delete event
 */
export async function deleteEvent(accessToken, eventId) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.EVENTS.DELETE(eventId)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to delete event');
  }

  return data;
}
