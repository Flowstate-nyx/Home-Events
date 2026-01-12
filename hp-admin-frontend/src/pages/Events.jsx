/**
 * Events Page
 * Full event management with tier editing
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { fetchEvents, createEvent, updateEvent, deleteEvent } from '../services/events.service.js';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Modal from '../components/common/Modal.jsx';
import { formatDate, formatTime, formatCurrency } from '../utils/formatters.js';

// Status options
const EVENT_STATUS = ['draft', 'active', 'cancelled', 'completed'];
const EVENT_TYPES = ['party', 'festival', 'gathering', 'concert', 'workshop'];

// Empty tier template
const emptyTier = {
  name: '',
  description: '',
  price: '',
  currency: 'USD',
  quantity: '',
  max_per_order: 10,
  is_active: true,
};

// Empty event template
const emptyEvent = {
  name: '',
  location: '',
  venue: '',
  event_date: '',
  event_time: '21:00',
  description: '',
  event_type: 'party',
  main_artist: '',
  image_url: '',
  min_age: 18,
  status: 'draft',
  tiers: [{ ...emptyTier }],
};

function Events() {
  const { accessToken } = useAuth();

  // Data state
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formData, setFormData] = useState({ ...emptyEvent });
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Fetch events
  const loadEvents = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchEvents(accessToken, {
        status: statusFilter,
        search: searchQuery,
      });

      const eventsList = data.events || data.data || data || [];
      setEvents(Array.isArray(eventsList) ? eventsList : []);
    } catch (err) {
      setError(err.message);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, statusFilter, searchQuery]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Open create modal
  const handleCreate = () => {
    setEditingEvent(null);
    setFormData({ ...emptyEvent, tiers: [{ ...emptyTier }] });
    setFormErrors({});
    setShowEventModal(true);
  };

  // Open edit modal
  const handleEdit = (event) => {
    setEditingEvent(event);
    setFormData({
      name: event.name || '',
      location: event.location || '',
      venue: event.venue || '',
      event_date: event.event_date?.split('T')[0] || '',
      event_time: event.event_time || '21:00',
      description: event.description || '',
      event_type: event.event_type || 'party',
      main_artist: event.main_artist || '',
      image_url: event.image_url || '',
      min_age: event.min_age || 18,
      status: event.status || 'draft',
      tiers: event.tiers?.length ? event.tiers.map(t => ({
        id: t.id,
        name: t.name || '',
        description: t.description || '',
        price: t.price || '',
        currency: t.currency || 'USD',
        quantity: t.quantity || '',
        sold: t.sold || 0,
        max_per_order: t.max_per_order || 10,
        is_active: t.is_active !== false,
      })) : [{ ...emptyTier }],
    });
    setFormErrors({});
    setShowEventModal(true);
  };

  // Open delete confirmation
  const handleDeleteClick = (event) => {
    setEditingEvent(event);
    setShowDeleteModal(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!editingEvent) return;

    setIsSaving(true);
    try {
      await deleteEvent(accessToken, editingEvent.id);
      setActionMessage({ type: 'success', text: 'Event deleted successfully' });
      setShowDeleteModal(false);
      setEditingEvent(null);
      loadEvents();
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

  // Tier field change
  const handleTierChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => 
        i === index ? { ...tier, [field]: value } : tier
      ),
    }));
  };

  // Add tier
  const addTier = () => {
    setFormData(prev => ({
      ...prev,
      tiers: [...prev.tiers, { ...emptyTier }],
    }));
  };

  // Remove tier
  const removeTier = (index) => {
    if (formData.tiers.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index),
    }));
  };

  // Validate form
  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) errors.name = 'Event name is required';
    if (!formData.location.trim()) errors.location = 'Location is required';
    if (!formData.event_date) errors.event_date = 'Event date is required';

    // Validate tiers
    formData.tiers.forEach((tier, index) => {
      if (!tier.name.trim()) errors[`tier_${index}_name`] = 'Tier name required';
      if (!tier.price && tier.price !== 0) errors[`tier_${index}_price`] = 'Price required';
      if (!tier.quantity) errors[`tier_${index}_quantity`] = 'Quantity required';
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);
    setActionMessage(null);

    try {
      const payload = {
        ...formData,
        date: formData.event_date,
        min_age: parseInt(formData.min_age) || 18,
        tiers: formData.tiers.map(t => ({
          ...t,
          price: parseFloat(t.price) || 0,
          quantity: parseInt(t.quantity) || 0,
          max_per_order: parseInt(t.max_per_order) || 10,
        })),
      };

      if (editingEvent) {
        await updateEvent(accessToken, editingEvent.id, payload);
        setActionMessage({ type: 'success', text: 'Event updated successfully' });
      } else {
        await createEvent(accessToken, payload);
        setActionMessage({ type: 'success', text: 'Event created successfully' });
      }

      setShowEventModal(false);
      loadEvents();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate inventory for an event
  const getInventory = (event) => {
    const tiers = event.tiers || event.ticket_tiers || [];
    const total = tiers.reduce((sum, t) => sum + (t.quantity || 0), 0);
    const sold = tiers.reduce((sum, t) => sum + (t.sold || 0), 0);
    return { total, sold, available: total - sold };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Events</h2>
          <p className="text-sm text-brand-cream/60">{events.length} events</p>
        </div>
        <button onClick={handleCreate} className="btn-gold">
          <svg className="w-5 h-5 mr-2 -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Event
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
              placeholder="Search events..."
              className="input-field"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field w-full sm:w-40"
          >
            <option value="">All Status</option>
            {EVENT_STATUS.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="card p-12 text-center">
            <div className="flex items-center justify-center gap-3 text-brand-gold/60">
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading events...</span>
            </div>
          </div>
        ) : error ? (
          <div className="card p-6 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={loadEvents} className="btn-secondary">Retry</button>
          </div>
        ) : events.length === 0 ? (
          <div className="card p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400 mb-4">No events found</p>
            <button onClick={handleCreate} className="btn-gold">Create Your First Event</button>
          </div>
        ) : (
          events.map((event) => {
            const inventory = getInventory(event);
            return (
              <div key={event.id} className="card p-6 hover:border-brand-gold/30 transition-colors">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Event image */}
                  <div className="lg:w-48 h-32 lg:h-auto rounded-lg bg-brand-green-dark overflow-hidden flex-shrink-0">
                    {event.image_url ? (
                      <img src={event.image_url} alt={event.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Event info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">{event.name}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {formatDate(event.event_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatTime(event.event_time)}
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={event.status} />
                    </div>

                    <p className="text-sm text-gray-400 mb-3 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {event.venue ? `${event.venue}, ${event.location}` : event.location}
                    </p>

                    {/* Inventory & Tiers */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Tickets:</span>
                        <span className="text-white font-medium">{inventory.sold} / {inventory.total}</span>
                        <div className="w-20 h-2 bg-brand-green-dark rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-brand-gold rounded-full transition-all"
                            style={{ width: `${inventory.total ? (inventory.sold / inventory.total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-gray-600">|</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Tiers:</span>
                        <span className="text-white">{(event.tiers || event.ticket_tiers || []).length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex lg:flex-col gap-2 lg:w-auto">
                    <button
                      onClick={() => handleEdit(event)}
                      className="btn-secondary flex-1 lg:flex-none py-2"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteClick(event)}
                      className="btn-danger flex-1 lg:flex-none py-2"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Event Form Modal */}
      <Modal
        isOpen={showEventModal}
        onClose={() => setShowEventModal(false)}
        title={editingEvent ? 'Edit Event' : 'Create Event'}
        size="xl"
      >
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Event Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  className={`input-field ${formErrors.name ? 'border-red-500' : ''}`}
                  placeholder="NYE 2026 Party"
                />
                {formErrors.name && <p className="text-red-400 text-xs mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Location *</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => handleFieldChange('location', e.target.value)}
                  className={`input-field ${formErrors.location ? 'border-red-500' : ''}`}
                  placeholder="Guatemala City, Guatemala"
                />
                {formErrors.location && <p className="text-red-400 text-xs mt-1">{formErrors.location}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Venue</label>
                <input
                  type="text"
                  value={formData.venue}
                  onChange={(e) => handleFieldChange('venue', e.target.value)}
                  className="input-field"
                  placeholder="Club XYZ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Date *</label>
                <input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => handleFieldChange('event_date', e.target.value)}
                  className={`input-field ${formErrors.event_date ? 'border-red-500' : ''}`}
                />
                {formErrors.event_date && <p className="text-red-400 text-xs mt-1">{formErrors.event_date}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Time</label>
                <input
                  type="time"
                  value={formData.event_time}
                  onChange={(e) => handleFieldChange('event_time', e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Event Type</label>
                <select
                  value={formData.event_type}
                  onChange={(e) => handleFieldChange('event_type', e.target.value)}
                  className="input-field"
                >
                  {EVENT_TYPES.map(type => (
                    <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                  className="input-field"
                >
                  {EVENT_STATUS.map(status => (
                    <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Main Artist</label>
                <input
                  type="text"
                  value={formData.main_artist}
                  onChange={(e) => handleFieldChange('main_artist', e.target.value)}
                  className="input-field"
                  placeholder="DJ Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Minimum Age</label>
                <input
                  type="number"
                  value={formData.min_age}
                  onChange={(e) => handleFieldChange('min_age', e.target.value)}
                  className="input-field"
                  min="0"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Image URL</label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => handleFieldChange('image_url', e.target.value)}
                  className="input-field"
                  placeholder="https://..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brand-cream/80 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  className="input-field h-24 resize-none"
                  placeholder="Event description..."
                />
              </div>
            </div>

            {/* Ticket Tiers */}
            <div className="border-t border-brand-gold/10 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-white">Ticket Tiers</h4>
                <button type="button" onClick={addTier} className="btn-secondary py-1.5 px-3 text-sm">
                  + Add Tier
                </button>
              </div>

              <div className="space-y-4">
                {formData.tiers.map((tier, index) => (
                  <div key={index} className="p-4 bg-brand-green-dark/50 rounded-lg border border-brand-gold/10">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-brand-gold">Tier {index + 1}</span>
                      {formData.tiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTier(index)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <input
                          type="text"
                          value={tier.name}
                          onChange={(e) => handleTierChange(index, 'name', e.target.value)}
                          className={`input-field py-2 text-sm ${formErrors[`tier_${index}_name`] ? 'border-red-500' : ''}`}
                          placeholder="Tier name (e.g., General)"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={tier.price}
                          onChange={(e) => handleTierChange(index, 'price', e.target.value)}
                          className={`input-field py-2 text-sm ${formErrors[`tier_${index}_price`] ? 'border-red-500' : ''}`}
                          placeholder="Price"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={tier.quantity}
                          onChange={(e) => handleTierChange(index, 'quantity', e.target.value)}
                          className={`input-field py-2 text-sm ${formErrors[`tier_${index}_quantity`] ? 'border-red-500' : ''}`}
                          placeholder="Quantity"
                          min="0"
                        />
                      </div>
                    </div>
                    
                    {tier.sold > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        {tier.sold} sold of {tier.quantity}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-brand-gold/10">
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
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
                  editingEvent ? 'Update Event' : 'Create Event'
                )}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Event"
        size="sm"
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-white mb-2">Delete "{editingEvent?.name}"?</h4>
          <p className="text-gray-400 text-sm mb-6">
            This action cannot be undone. All tickets and orders associated with this event will be affected.
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
              {isSaving ? 'Deleting...' : 'Delete Event'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default Events;