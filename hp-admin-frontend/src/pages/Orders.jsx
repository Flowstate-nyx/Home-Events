/**
 * Orders Page
 * Full order management with table, filters, and actions
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { fetchOrders, updateOrderStatus, resendOrderEmail, createTestOrder } from '../services/orders.service.js';
import { fetchEvents, fetchEvent } from '../services/events.service.js';
import StatusBadge from '../components/common/StatusBadge.jsx';
import Modal from '../components/common/Modal.jsx';
import { formatDateTime, formatCurrency, truncate } from '../utils/formatters.js';

// Status options for filter and actions
const STATUS_OPTIONS = ['pending', 'paid', 'cancelled', 'refunded'];

function Orders() {
  const { accessToken } = useAuth();

  // Data state
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const limit = 20;

  // Modal state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  // Test order modal state
  const [showTestOrderModal, setShowTestOrderModal] = useState(false);
  const [events, setEvents] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [testOrderLoading, setTestOrderLoading] = useState(false);
  const [testOrderForm, setTestOrderForm] = useState({
    event_id: '',
    tier_id: '',
    buyer_name: '',
    buyer_email: '',
    buyer_phone: '',
    quantity: 1,
    send_email: false,
  });

  // Fetch orders
  const loadOrders = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchOrders(accessToken, {
        status: statusFilter,
        search: searchQuery,
        page,
        limit,
      });

      // Handle different response formats
      const ordersList = data.orders || data.data || data || [];
      setOrders(Array.isArray(ordersList) ? ordersList : []);
      setTotalPages(data.totalPages || data.pages || Math.ceil((data.total || ordersList.length) / limit));
      setTotalOrders(data.total || data.totalOrders || ordersList.length);
    } catch (err) {
      setError(err.message);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, statusFilter, searchQuery, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Handle search submit
  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };

  // Clear filters
  const clearFilters = () => {
    setStatusFilter('');
    setSearchQuery('');
    setSearchInput('');
    setPage(1);
  };

  // Handle status change
  const handleStatusChange = async (orderId, newStatus) => {
    setActionLoading(orderId);
    setActionMessage(null);

    try {
      await updateOrderStatus(accessToken, orderId, newStatus);
      setActionMessage({ type: 'success', text: `Order marked as ${newStatus}` });
      loadOrders();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle resend email
  const handleResendEmail = async (orderId) => {
    setActionLoading(orderId);
    setActionMessage(null);

    try {
      await resendOrderEmail(accessToken, orderId);
      setActionMessage({ type: 'success', text: 'Email sent successfully' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  // View order details
  const viewOrderDetails = (order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
  };

  // Open test order modal and load events
  const openTestOrderModal = async () => {
    setShowTestOrderModal(true);
    setEventsLoading(true);
    try {
      const data = await fetchEvents(accessToken);
      const eventsList = data.events || data.data || data || [];
      setEvents(Array.isArray(eventsList) ? eventsList : []);
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to load events: ' + err.message });
    } finally {
      setEventsLoading(false);
    }
  };

  // Close test order modal and reset form
  const closeTestOrderModal = () => {
    setShowTestOrderModal(false);
    setTestOrderForm({
      event_id: '',
      tier_id: '',
      buyer_name: '',
      buyer_email: '',
      buyer_phone: '',
      quantity: 1,
      send_email: false,
    });
    setTiers([]);
  };

  // Handle event selection - load tiers
  const handleEventChange = async (eventId) => {
    setTestOrderForm(prev => ({ ...prev, event_id: eventId, tier_id: '' }));
    setTiers([]);

    if (!eventId) return;

    setTiersLoading(true);
    try {
      const eventData = await fetchEvent(accessToken, eventId);
      const event = eventData.event || eventData;
      const tiersList = event.tiers || [];
      setTiers(tiersList);
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to load tiers: ' + err.message });
    } finally {
      setTiersLoading(false);
    }
  };

  // Handle test order form field change
  const handleTestOrderFieldChange = (field, value) => {
    setTestOrderForm(prev => ({ ...prev, [field]: value }));
  };

  // Submit test order
  const handleTestOrderSubmit = async (e) => {
    e.preventDefault();
    setTestOrderLoading(true);

    try {
      await createTestOrder(accessToken, {
        event_id: testOrderForm.event_id,
        tier_id: testOrderForm.tier_id,
        buyer_name: testOrderForm.buyer_name,
        buyer_email: testOrderForm.buyer_email,
        buyer_phone: testOrderForm.buyer_phone,
        quantity: parseInt(testOrderForm.quantity, 10),
        send_email: testOrderForm.send_email,
      });
      setActionMessage({ type: 'success', text: 'Test order created successfully' });
      closeTestOrderModal();
      loadOrders();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setTestOrderLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Orders</h2>
          <p className="text-sm text-brand-cream/60">
            {totalOrders} total orders
          </p>
        </div>
        <button onClick={openTestOrderModal} className="btn-gold">
          <svg className="w-5 h-5 mr-2 -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Test Order
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
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, email, or order number..."
                className="input-field pl-10 pr-20"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 btn-gold py-1.5 px-3 text-sm">
                Search
              </button>
            </div>
          </form>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="input-field w-40"
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>

            {(statusFilter || searchQuery) && (
              <button onClick={clearFilters} className="btn-secondary py-2.5">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-brand-gold/60">
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Loading orders...</span>
            </div>
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <div className="text-red-400 mb-2">{error}</div>
            <button onClick={loadOrders} className="btn-secondary">Retry</button>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-400">No orders found</p>
            {(statusFilter || searchQuery) && (
              <button onClick={clearFilters} className="mt-4 btn-secondary">
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Event</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <button
                          onClick={() => viewOrderDetails(order)}
                          className="font-mono text-brand-gold hover:underline"
                        >
                          {order.order_number || order.orderNumber || `#${order.id?.slice(0, 8)}`}
                        </button>
                      </td>
                      <td>
                        <div>
                          <p className="text-white">{truncate(order.buyer_name || order.buyerName, 20)}</p>
                          <p className="text-xs text-gray-500">{truncate(order.buyer_email || order.buyerEmail, 25)}</p>
                        </div>
                      </td>
                      <td>
                        <span className="text-brand-cream/80">
                          {truncate(order.event_name || order.eventName || order.event?.name || '—', 20)}
                        </span>
                      </td>
                      <td>{order.quantity}</td>
                      <td className="font-medium text-white">
                        {formatCurrency(order.total_price || order.totalPrice, order.currency)}
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="text-sm text-gray-400">
                        {formatDateTime(order.created_at || order.createdAt)}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {/* Actions dropdown */}
                          <div className="relative group">
                            <button
                              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-brand-gold/10 disabled:opacity-50"
                              disabled={actionLoading === order.id}
                            >
                              {actionLoading === order.id ? (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                              )}
                            </button>

                            {/* Dropdown */}
                            <div className="absolute right-0 mt-1 w-48 bg-brand-green-dark border border-brand-gold/20 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                              <div className="py-1">
                                {order.status === 'pending' && (
                                  <button
                                    onClick={() => handleStatusChange(order.id, 'paid')}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-400 hover:bg-brand-gold/10"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Mark as Paid
                                  </button>
                                )}
                                {order.status === 'paid' && (
                                  <button
                                    onClick={() => handleStatusChange(order.id, 'refunded')}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-400 hover:bg-brand-gold/10"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                    </svg>
                                    Refund
                                  </button>
                                )}
                                {order.status !== 'cancelled' && order.status !== 'refunded' && (
                                  <button
                                    onClick={() => handleStatusChange(order.id, 'cancelled')}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-brand-gold/10"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Cancel
                                  </button>
                                )}
                                {order.status === 'paid' && (
                                  <button
                                    onClick={() => handleResendEmail(order.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-blue-400 hover:bg-brand-gold/10"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    Resend Ticket
                                  </button>
                                )}
                                <button
                                  onClick={() => viewOrderDetails(order)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-brand-gold/10"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  View Details
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-brand-gold/10">
                <p className="text-sm text-gray-400">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Order Details"
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Order header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-mono text-brand-gold">
                  {selectedOrder.order_number || selectedOrder.orderNumber}
                </p>
                <p className="text-sm text-gray-400">
                  {formatDateTime(selectedOrder.created_at || selectedOrder.createdAt)}
                </p>
              </div>
              <StatusBadge status={selectedOrder.status} className="text-sm" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer info */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-brand-gold uppercase tracking-wider">Customer</h4>
                <div className="space-y-2 text-sm">
                  <p><span className="text-gray-500">Name:</span> <span className="text-white">{selectedOrder.buyer_name || selectedOrder.buyerName}</span></p>
                  <p><span className="text-gray-500">Email:</span> <span className="text-white">{selectedOrder.buyer_email || selectedOrder.buyerEmail}</span></p>
                  <p><span className="text-gray-500">Phone:</span> <span className="text-white">{selectedOrder.buyer_phone || selectedOrder.buyerPhone || '—'}</span></p>
                  <p><span className="text-gray-500">Country:</span> <span className="text-white">{selectedOrder.buyer_country || selectedOrder.buyerCountry || '—'}</span></p>
                </div>
              </div>

              {/* Order info */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-brand-gold uppercase tracking-wider">Order</h4>
                <div className="space-y-2 text-sm">
                  <p><span className="text-gray-500">Event:</span> <span className="text-white">{selectedOrder.event_name || selectedOrder.eventName || selectedOrder.event?.name || '—'}</span></p>
                  <p><span className="text-gray-500">Tier:</span> <span className="text-white">{selectedOrder.tier_name || selectedOrder.tierName || selectedOrder.tier?.name || '—'}</span></p>
                  <p><span className="text-gray-500">Quantity:</span> <span className="text-white">{selectedOrder.quantity}</span></p>
                  <p><span className="text-gray-500">Unit Price:</span> <span className="text-white">{formatCurrency(selectedOrder.unit_price || selectedOrder.unitPrice, selectedOrder.currency)}</span></p>
                  <p><span className="text-gray-500">Total:</span> <span className="text-white font-semibold">{formatCurrency(selectedOrder.total_price || selectedOrder.totalPrice, selectedOrder.currency)}</span></p>
                </div>
              </div>
            </div>

            {/* Payment info */}
            {selectedOrder.payment_method && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-brand-gold uppercase tracking-wider">Payment</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p><span className="text-gray-500">Method:</span> <span className="text-white">{selectedOrder.payment_method || selectedOrder.paymentMethod || '—'}</span></p>
                  <p><span className="text-gray-500">Reference:</span> <span className="text-white font-mono">{selectedOrder.payment_reference || selectedOrder.paymentReference || '—'}</span></p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-brand-gold/10">
              {selectedOrder.status === 'pending' && (
                <button
                  onClick={() => { handleStatusChange(selectedOrder.id, 'paid'); setShowDetailsModal(false); }}
                  className="btn-gold"
                >
                  Mark as Paid
                </button>
              )}
              {selectedOrder.status === 'paid' && (
                <>
                  <button
                    onClick={() => { handleResendEmail(selectedOrder.id); }}
                    className="btn-secondary"
                  >
                    Resend Ticket Email
                  </button>
                  <button
                    onClick={() => { handleStatusChange(selectedOrder.id, 'refunded'); setShowDetailsModal(false); }}
                    className="btn-danger"
                  >
                    Refund
                  </button>
                </>
              )}
              <button onClick={() => setShowDetailsModal(false)} className="btn-secondary ml-auto">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Test Order Modal */}
      <Modal
        isOpen={showTestOrderModal}
        onClose={closeTestOrderModal}
        title="Create Test Order"
        size="md"
      >
        <form onSubmit={handleTestOrderSubmit} className="space-y-4">
          {/* Event dropdown */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">Event *</label>
            <select
              value={testOrderForm.event_id}
              onChange={(e) => handleEventChange(e.target.value)}
              className="input-field"
              required
              disabled={eventsLoading}
            >
              <option value="">
                {eventsLoading ? 'Loading events...' : 'Select an event'}
              </option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tier dropdown */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">Tier *</label>
            <select
              value={testOrderForm.tier_id}
              onChange={(e) => handleTestOrderFieldChange('tier_id', e.target.value)}
              className="input-field"
              required
              disabled={!testOrderForm.event_id || tiersLoading}
            >
              <option value="">
                {tiersLoading ? 'Loading tiers...' : !testOrderForm.event_id ? 'Select an event first' : 'Select a tier'}
              </option>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} - {formatCurrency(tier.price, tier.currency)}
                </option>
              ))}
            </select>
          </div>

          {/* Buyer name */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">Buyer Name *</label>
            <input
              type="text"
              value={testOrderForm.buyer_name}
              onChange={(e) => handleTestOrderFieldChange('buyer_name', e.target.value)}
              className="input-field"
              placeholder="John Doe"
              required
            />
          </div>

          {/* Buyer email */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">Buyer Email *</label>
            <input
              type="email"
              value={testOrderForm.buyer_email}
              onChange={(e) => handleTestOrderFieldChange('buyer_email', e.target.value)}
              className="input-field"
              placeholder="john@example.com"
              required
            />
          </div>

          {/* Buyer phone */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">Buyer Phone</label>
            <input
              type="tel"
              value={testOrderForm.buyer_phone}
              onChange={(e) => handleTestOrderFieldChange('buyer_phone', e.target.value)}
              className="input-field"
              placeholder="+1 234 567 8900"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-brand-cream/80 mb-1">Quantity *</label>
            <input
              type="number"
              value={testOrderForm.quantity}
              onChange={(e) => handleTestOrderFieldChange('quantity', e.target.value)}
              className="input-field"
              min="1"
              max="10"
              required
            />
          </div>

          {/* Send email checkbox */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="send_email"
              checked={testOrderForm.send_email}
              onChange={(e) => handleTestOrderFieldChange('send_email', e.target.checked)}
              className="w-4 h-4 rounded border-brand-gold/30 bg-brand-green-light text-brand-gold focus:ring-brand-gold/50"
            />
            <label htmlFor="send_email" className="text-sm text-brand-cream/80">
              Send confirmation email to buyer
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-brand-gold/10">
            <button
              type="submit"
              className="btn-gold flex-1"
              disabled={testOrderLoading}
            >
              {testOrderLoading ? 'Creating...' : 'Create Test Order'}
            </button>
            <button
              type="button"
              onClick={closeTestOrderModal}
              className="btn-secondary"
              disabled={testOrderLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Orders;
