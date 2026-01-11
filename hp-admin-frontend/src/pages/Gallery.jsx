/**
 * Gallery Page
 * Photo gallery management with URL-based images
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { fetchGalleryItems, createGalleryItem, updateGalleryItem, deleteGalleryItem } from '../services/gallery.service.js';
import { fetchEvents } from '../services/events.service.js';
import Modal from '../components/common/Modal.jsx';
import { formatDate } from '../utils/formatters.js';

// Empty item template
const emptyItem = {
  image_url: '',
  caption: '',
  event_id: '',
  is_featured: false,
  sort_order: 0,
};

function Gallery() {
  const { accessToken } = useAuth();

  // Data state
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [eventFilter, setEventFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [showItemModal, setShowItemModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [formData, setFormData] = useState({ ...emptyItem });
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Fetch gallery items
  const loadItems = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchGalleryItems(accessToken, {
        eventId: eventFilter,
        search: searchQuery,
      });

      const itemsList = data.items || data.gallery || data.data || data || [];
      setItems(Array.isArray(itemsList) ? itemsList : []);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, eventFilter, searchQuery]);

  // Fetch events for filter dropdown
  const loadEvents = useCallback(async () => {
    if (!accessToken) return;

    try {
      const data = await fetchEvents(accessToken);
      const eventsList = data.events || data.data || data || [];
      setEvents(Array.isArray(eventsList) ? eventsList : []);
    } catch (err) {
      console.log('Failed to load events:', err.message);
    }
  }, [accessToken]);

  useEffect(() => {
    loadItems();
    loadEvents();
  }, [loadItems, loadEvents]);

  // Open create modal
  const handleCreate = () => {
    setEditingItem(null);
    setFormData({ ...emptyItem });
    setFormErrors({});
    setShowItemModal(true);
  };

  // Open edit modal
  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      image_url: item.image_url || item.imageUrl || '',
      caption: item.caption || '',
      event_id: item.event_id || item.eventId || '',
      is_featured: item.is_featured || item.isFeatured || false,
      sort_order: item.sort_order || item.sortOrder || 0,
    });
    setFormErrors({});
    setShowItemModal(true);
  };

  // Open preview modal
  const handlePreview = (item) => {
    setPreviewItem(item);
    setShowPreviewModal(true);
  };

  // Open delete confirmation
  const handleDeleteClick = (item) => {
    setEditingItem(item);
    setShowDeleteModal(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!editingItem) return;

    setIsSaving(true);
    try {
      await deleteGalleryItem(accessToken, editingItem.id);
      setActionMessage({ type: 'success', text: 'Image deleted successfully' });
      setShowDeleteModal(false);
      setEditingItem(null);
      loadItems();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Form field change
  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};

    if (!formData.image_url.trim()) {
      errors.image_url = 'Image URL is required';
    } else if (!isValidUrl(formData.image_url)) {
      errors.image_url = 'Please enter a valid URL';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Check if URL is valid
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);
    setActionMessage(null);

    try {
      const payload = {
        image_url: formData.image_url.trim(),
        caption: formData.caption.trim(),
        event_id: formData.event_id || null,
        is_featured: formData.is_featured,
        sort_order: parseInt(formData.sort_order) || 0,
      };

      if (editingItem) {
        await updateGalleryItem(accessToken, editingItem.id, payload);
        setActionMessage({ type: 'success', text: 'Image updated successfully' });
      } else {
        await createGalleryItem(accessToken, payload);
        setActionMessage({ type: 'success', text: 'Image added successfully' });
      }

      setShowItemModal(false);
      loadItems();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Get event name by ID
  const getEventName = (eventId) => {
    const event = events.find(e => e.id === eventId);
    return event?.name || 'Unknown Event';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Gallery</h2>
          <p className="text-sm text-brand-cream/60">{items.length} images</p>
        </div>
        <button onClick={handleCreate} className="btn-gold">
          <svg className="w-5 h-5 mr-2 -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Image
        </button>
      </div>

      {/* Action message */}
      {actionMessage && (
        <div className={`p-4 rounded-lg animate-fade-in ${
          actionMessage.type === 'success' 
            ? 'bg-green-500/10 border border-green-500/30 text-green-400' 
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center justify-between">
            <span>{actionMessage.text}</span>
            <button onClick={() => setActionMessage(null)} className="text-current opacity-60 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by caption..."
              className="input-field"
            />
          </div>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="input-field w-full sm:w-48"
          >
            <option value="">All Events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Gallery Grid */}
      {isLoading ? (
        <div className="card p-12 text-center">
          <div className="flex items-center justify-center gap-3 text-brand-gold/60">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading gallery...</span>
          </div>
        </div>
      ) : error ? (
        <div className="card p-6 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={loadItems} className="btn-secondary">Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 mb-4">No images in gallery</p>
          <button onClick={handleCreate} className="btn-gold">Add Your First Image</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="card overflow-hidden group hover:border-brand-gold/30 transition-colors"
            >
              {/* Image */}
              <div
                className="aspect-square bg-brand-green-dark relative cursor-pointer overflow-hidden"
                onClick={() => handlePreview(item)}
              >
                <img
                  src={item.image_url || item.imageUrl}
                  alt={item.caption || 'Gallery image'}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23333"><rect width="24" height="24"/><text x="12" y="14" text-anchor="middle" fill="%23666" font-size="4">No Image</text></svg>';
                  }}
                />
                
                {/* Featured badge */}
                {(item.is_featured || item.isFeatured) && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-brand-gold text-brand-green text-xs font-semibold rounded">
                    Featured
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
                    className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                    title="Preview"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                    className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                    title="Edit"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}
                    className="p-2 bg-red-500/50 rounded-full hover:bg-red-500/70 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                {item.caption && (
                  <p className="text-sm text-white truncate mb-1">{item.caption}</p>
                )}
                {(item.event_id || item.eventId) && (
                  <p className="text-xs text-gray-500 truncate">
                    {getEventName(item.event_id || item.eventId)}
                  </p>
                )}
                {!item.caption && !(item.event_id || item.eventId) && (
                  <p className="text-xs text-gray-600 italic">No caption</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tips */}
      <div className="card p-4 bg-brand-gold/5 border-brand-gold/20">
        <h4 className="text-sm font-semibold text-brand-gold mb-2">Tips for Adding Images</h4>
        <ul className="text-sm text-brand-cream/60 space-y-1">
          <li>• Upload images to Google Photos, Imgur, or any image hosting service</li>
          <li>• Copy the direct image URL (should end in .jpg, .png, .webp, etc.)</li>
          <li>• Paste the URL when adding a new image</li>
          <li>• For Google Photos, use the "Get link" option and modify URL to get direct image</li>
        </ul>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={editingItem ? 'Edit Image' : 'Add Image'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image URL */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">
              Image URL *
            </label>
            <input
              type="url"
              value={formData.image_url}
              onChange={(e) => handleFieldChange('image_url', e.target.value)}
              className={`input-field ${formErrors.image_url ? 'border-red-500' : ''}`}
              placeholder="https://example.com/image.jpg"
            />
            {formErrors.image_url && (
              <p className="text-red-400 text-xs mt-1">{formErrors.image_url}</p>
            )}
          </div>

          {/* Preview */}
          {formData.image_url && isValidUrl(formData.image_url) && (
            <div className="aspect-video bg-brand-green-dark rounded-lg overflow-hidden">
              <img
                src={formData.image_url}
                alt="Preview"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">
              Caption
            </label>
            <input
              type="text"
              value={formData.caption}
              onChange={(e) => handleFieldChange('caption', e.target.value)}
              className="input-field"
              placeholder="Describe this image..."
            />
          </div>

          {/* Event */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">
              Associated Event
            </label>
            <select
              value={formData.event_id}
              onChange={(e) => handleFieldChange('event_id', e.target.value)}
              className="input-field"
            >
              <option value="">No specific event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          {/* Options */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_featured}
                onChange={(e) => handleFieldChange('is_featured', e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-brand-green-dark text-brand-gold focus:ring-brand-gold/50"
              />
              <span className="text-sm text-brand-cream/80">Featured image</span>
            </label>

            <div className="flex items-center gap-2">
              <label className="text-sm text-brand-cream/80">Sort order:</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => handleFieldChange('sort_order', e.target.value)}
                className="input-field w-20 py-1.5 text-center"
                min="0"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-brand-gold/10">
            <button
              type="button"
              onClick={() => setShowItemModal(false)}
              className="btn-secondary"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-gold" disabled={isSaving}>
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                editingItem ? 'Update Image' : 'Add Image'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Image"
        size="sm"
      >
        <div className="text-center">
          {editingItem && (
            <div className="w-32 h-32 mx-auto mb-4 rounded-lg overflow-hidden bg-brand-green-dark">
              <img
                src={editingItem.image_url || editingItem.imageUrl}
                alt="To delete"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <h4 className="text-lg font-semibold text-white mb-2">Delete this image?</h4>
          <p className="text-gray-400 text-sm mb-6">
            This action cannot be undone.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="btn-secondary"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="btn-danger"
              disabled={isSaving}
            >
              {isSaving ? 'Deleting...' : 'Delete Image'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        size="xl"
      >
        {previewItem && (
          <div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
              <img
                src={previewItem.image_url || previewItem.imageUrl}
                alt={previewItem.caption || 'Gallery image'}
                className="w-full h-full object-contain"
              />
            </div>
            {previewItem.caption && (
              <p className="text-white text-center mb-2">{previewItem.caption}</p>
            )}
            {(previewItem.event_id || previewItem.eventId) && (
              <p className="text-gray-500 text-sm text-center">
                {getEventName(previewItem.event_id || previewItem.eventId)}
              </p>
            )}
            <div className="flex justify-center gap-3 mt-4">
              <button
                onClick={() => { setShowPreviewModal(false); handleEdit(previewItem); }}
                className="btn-secondary"
              >
                Edit
              </button>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="btn-gold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Gallery;
