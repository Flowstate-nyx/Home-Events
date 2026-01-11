/**
 * Gallery Service
 * API calls for gallery management
 */

import { API_BASE_URL, ENDPOINTS } from '../config/api.js';

/**
 * Fetch all gallery items
 */
export async function fetchGalleryItems(accessToken, filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.eventId) params.append('event_id', filters.eventId);
  if (filters.search) params.append('search', filters.search);

  const queryString = params.toString();
  const url = `${API_BASE_URL}${ENDPOINTS.GALLERY.LIST}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch gallery');
  }

  return data;
}

/**
 * Create new gallery item
 */
export async function createGalleryItem(accessToken, itemData) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.GALLERY.CREATE}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(itemData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to create gallery item');
  }

  return data;
}

/**
 * Update gallery item
 */
export async function updateGalleryItem(accessToken, itemId, itemData) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.GALLERY.UPDATE(itemId)}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(itemData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to update gallery item');
  }

  return data;
}

/**
 * Delete gallery item
 */
export async function deleteGalleryItem(accessToken, itemId) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.GALLERY.DELETE(itemId)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to delete gallery item');
  }

  return data;
}
