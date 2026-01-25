/**
 * Admin Stats Routes
 * Dashboard statistics and analytics
 * 
 * BACKWARDS COMPATIBILITY:
 * - Existing stats endpoint behavior preserved
 * - Default excludes test data (is_test = false)
 * - Platform admins see all data
 * - Client users see only their client's data
 * 
 * NEW FEATURES:
 * - Multi-tenant scoping
 * - Platform-level analytics
 * - Client comparison (platform admin only)
 */

import express from 'express';
import pool from '../../db/pool.js';
import { requireAuth, requireAdmin, scopeToClient, requirePlatformAdmin } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// All routes require authentication and admin access
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/stats/dashboard
 * Main dashboard statistics
 * BACKWARDS COMPATIBLE: Same structure, adds multi-tenant scoping
 */
router.get('/dashboard', scopeToClient, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter
    let dateFilter = '';
    const params = [];
    let paramIndex = 1;
    
    if (startDate) {
      dateFilter += ` AND o.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateFilter += ` AND o.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    // Build client filter (multi-tenant)
    let clientFilter = '';
    if (req.scopedClientId) {
      clientFilter = ` AND e.client_id = $${paramIndex}`;
      params.push(req.scopedClientId);
      paramIndex++;
    }
    
    // Revenue stats (EXCLUDES test orders: is_test = false OR is_test IS NULL)
    const revenueQuery = `
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.quantity), 0) as total_tickets,
        COALESCE(SUM(o.total_price), 0) as gross_revenue,
        COALESCE(SUM(o.platform_fee_amount), 0) as platform_fees,
        COALESCE(SUM(o.client_revenue), 0) as client_revenue
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.payment_status = 'paid'
        AND (o.is_test = false OR o.is_test IS NULL)
        ${dateFilter}
        ${clientFilter}
    `;
    
    const revenueResult = await pool.query(revenueQuery, params);
    const revenue = revenueResult.rows[0];
    
    // Active events (EXCLUDES test events)
    const eventsParams = req.scopedClientId ? [req.scopedClientId] : [];
    const eventClientFilter = req.scopedClientId ? 'AND client_id = $1' : '';
    
    const eventsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active_events,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_events,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_events,
        COUNT(*) as total_events
      FROM events
      WHERE (is_test = false OR is_test IS NULL)
        AND (status != 'test')
        ${eventClientFilter}
    `;
    
    const eventsResult = await pool.query(eventsQuery, eventsParams);
    const events = eventsResult.rows[0];
    
    // Customer stats (EXCLUDES test customers)
    const customersParams = req.scopedClientId ? [req.scopedClientId] : [];
    const customerClientFilter = req.scopedClientId ? 'AND client_id = $1' : '';
    
    const customersQuery = `
      SELECT 
        COUNT(*) as total_customers,
        COUNT(*) FILTER (WHERE total_orders > 1) as repeat_customers,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_this_month
      FROM customers
      WHERE (is_test_customer = false OR is_test_customer IS NULL)
        ${customerClientFilter}
    `;
    
    const customersResult = await pool.query(customersQuery, customersParams);
    const customers = customersResult.rows[0];
    
    // Recent orders for activity feed (EXCLUDES test)
    const recentParams = req.scopedClientId ? [req.scopedClientId] : [];
    const recentClientFilter = req.scopedClientId ? 'AND e.client_id = $1' : '';
    
    const recentQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.buyer_email,
        o.buyer_name,
        o.quantity,
        o.total_price,
        o.payment_status,
        o.created_at,
        e.name as event_name,
        t.name as tier_name
      FROM orders o
      JOIN events e ON o.event_id = e.id
      LEFT JOIN tiers t ON o.tier_id = t.id
      WHERE (o.is_test = false OR o.is_test IS NULL)
        ${recentClientFilter}
      ORDER BY o.created_at DESC
      LIMIT 10
    `;
    
    const recentResult = await pool.query(recentQuery, recentParams);
    
    res.json({
      success: true,
      stats: {
        revenue: {
          totalOrders: parseInt(revenue.total_orders) || 0,
          totalTickets: parseInt(revenue.total_tickets) || 0,
          grossRevenue: parseFloat(revenue.gross_revenue) || 0,
          platformFees: parseFloat(revenue.platform_fees) || 0,
          clientRevenue: parseFloat(revenue.client_revenue) || 0
        },
        events: {
          active: parseInt(events.active_events) || 0,
          draft: parseInt(events.draft_events) || 0,
          completed: parseInt(events.completed_events) || 0,
          total: parseInt(events.total_events) || 0
        },
        customers: {
          total: parseInt(customers.total_customers) || 0,
          repeat: parseInt(customers.repeat_customers) || 0,
          newThisMonth: parseInt(customers.new_this_month) || 0
        },
        recentOrders: recentResult.rows.map(o => ({
          id: o.id,
          orderNumber: o.order_number,
          buyerEmail: o.buyer_email,
          buyerName: o.buyer_name,
          quantity: o.quantity,
          totalPrice: parseFloat(o.total_price) || 0,
          paymentStatus: o.payment_status,
          eventName: o.event_name,
          tierName: o.tier_name,
          createdAt: o.created_at
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/stats/revenue
 * Revenue breakdown over time
 */
router.get('/revenue', scopeToClient, async (req, res, next) => {
  try {
    const { period = 'day', startDate, endDate } = req.query;
    
    // Determine date trunc function
    const truncFn = period === 'month' ? 'month' : period === 'week' ? 'week' : 'day';
    
    const params = [];
    let paramIndex = 1;
    
    let dateFilter = '';
    if (startDate) {
      dateFilter += ` AND o.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateFilter += ` AND o.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    let clientFilter = '';
    if (req.scopedClientId) {
      clientFilter = ` AND e.client_id = $${paramIndex}`;
      params.push(req.scopedClientId);
      paramIndex++;
    }
    
    const query = `
      SELECT 
        DATE_TRUNC('${truncFn}', o.created_at) as period,
        COUNT(DISTINCT o.id) as orders,
        COALESCE(SUM(o.quantity), 0) as tickets,
        COALESCE(SUM(o.total_price), 0) as revenue,
        COALESCE(SUM(o.platform_fee_amount), 0) as platform_fees,
        COALESCE(SUM(o.client_revenue), 0) as client_revenue
      FROM orders o
      JOIN events e ON o.event_id = e.id
      WHERE o.payment_status = 'paid'
        AND (o.is_test = false OR o.is_test IS NULL)
        ${dateFilter}
        ${clientFilter}
      GROUP BY DATE_TRUNC('${truncFn}', o.created_at)
      ORDER BY period DESC
      LIMIT 90
    `;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      period,
      data: result.rows.map(r => ({
        period: r.period,
        orders: parseInt(r.orders) || 0,
        tickets: parseInt(r.tickets) || 0,
        revenue: parseFloat(r.revenue) || 0,
        platformFees: parseFloat(r.platform_fees) || 0,
        clientRevenue: parseFloat(r.client_revenue) || 0
      }))
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/stats/events
 * Event performance statistics
 */
router.get('/events', scopeToClient, async (req, res, next) => {
  try {
    const params = [];
    let paramIndex = 1;
    
    let clientFilter = '';
    if (req.scopedClientId) {
      clientFilter = ` AND e.client_id = $${paramIndex}`;
      params.push(req.scopedClientId);
      paramIndex++;
    }
    
    const query = `
      SELECT 
        e.id,
        e.name,
        e.event_date,
        e.status,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.id END) as paid_orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.quantity ELSE 0 END), 0) as tickets_sold,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.total_price ELSE 0 END), 0) as revenue,
        COALESCE(SUM(t.quantity), 0) as total_capacity
      FROM events e
      LEFT JOIN orders o ON e.id = o.event_id
      LEFT JOIN tiers t ON e.id = t.event_id
      WHERE (e.is_test = false OR e.is_test IS NULL)
        AND e.status != 'test'
        ${clientFilter}
      GROUP BY e.id, e.name, e.event_date, e.status
      ORDER BY e.event_date DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      events: result.rows.map(e => ({
        id: e.id,
        name: e.name,
        eventDate: e.event_date,
        status: e.status,
        paidOrders: parseInt(e.paid_orders) || 0,
        ticketsSold: parseInt(e.tickets_sold) || 0,
        revenue: parseFloat(e.revenue) || 0,
        totalCapacity: parseInt(e.total_capacity) || 0,
        soldPercentage: e.total_capacity > 0 
          ? Math.round((parseInt(e.tickets_sold) / parseInt(e.total_capacity)) * 100)
          : 0
      }))
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/stats/tiers/:eventId
 * Tier breakdown for a specific event
 */
router.get('/tiers/:eventId', scopeToClient, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    
    // Verify event access
    const eventCheck = await pool.query(`
      SELECT client_id FROM events WHERE id = $1
    `, [eventId]);
    
    if (eventCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    if (req.scopedClientId && eventCheck.rows[0].client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const query = `
      SELECT 
        t.id,
        t.name,
        t.price,
        t.quantity as capacity,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.id END) as orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.quantity ELSE 0 END), 0) as sold,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.total_price ELSE 0 END), 0) as revenue
      FROM tiers t
      LEFT JOIN orders o ON t.id = o.tier_id
      WHERE t.event_id = $1
      GROUP BY t.id, t.name, t.price, t.quantity
      ORDER BY t.price DESC
    `;
    
    const result = await pool.query(query, [eventId]);
    
    res.json({
      success: true,
      tiers: result.rows.map(t => ({
        id: t.id,
        name: t.name,
        price: parseFloat(t.price) || 0,
        capacity: parseInt(t.capacity) || 0,
        orders: parseInt(t.orders) || 0,
        sold: parseInt(t.sold) || 0,
        revenue: parseFloat(t.revenue) || 0,
        available: Math.max(0, (parseInt(t.capacity) || 0) - (parseInt(t.sold) || 0)),
        soldPercentage: t.capacity > 0 
          ? Math.round((parseInt(t.sold) / parseInt(t.capacity)) * 100)
          : 0
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// PLATFORM ADMIN ONLY ROUTES
// Platform-wide analytics
// ============================================

/**
 * GET /api/admin/stats/platform
 * Platform-wide statistics (platform admin only)
 */
router.get('/platform', requirePlatformAdmin, async (req, res, next) => {
  try {
    // Total platform stats
    const platformQuery = `
      SELECT 
        (SELECT COUNT(*) FROM clients WHERE status = 'active') as active_clients,
        (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
        (SELECT COUNT(*) FROM events WHERE (is_test = false OR is_test IS NULL) AND status != 'test') as total_events,
        (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid' AND (is_test = false OR is_test IS NULL)) as total_orders,
        (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE payment_status = 'paid' AND (is_test = false OR is_test IS NULL)) as total_gmv,
        (SELECT COALESCE(SUM(platform_fee_amount), 0) FROM orders WHERE payment_status = 'paid' AND (is_test = false OR is_test IS NULL)) as total_platform_revenue
    `;
    
    const platformResult = await pool.query(platformQuery);
    const platform = platformResult.rows[0];
    
    // Top clients by revenue
    const clientsQuery = `
      SELECT 
        c.id,
        c.name,
        COUNT(DISTINCT o.id) as orders,
        COALESCE(SUM(o.total_price), 0) as gmv,
        COALESCE(SUM(o.platform_fee_amount), 0) as platform_fees
      FROM clients c
      LEFT JOIN events e ON c.id = e.client_id
      LEFT JOIN orders o ON e.id = o.event_id 
        AND o.payment_status = 'paid' 
        AND (o.is_test = false OR o.is_test IS NULL)
      WHERE c.status = 'active'
      GROUP BY c.id, c.name
      ORDER BY gmv DESC
      LIMIT 10
    `;
    
    const clientsResult = await pool.query(clientsQuery);
    
    res.json({
      success: true,
      platform: {
        activeClients: parseInt(platform.active_clients) || 0,
        activeUsers: parseInt(platform.active_users) || 0,
        totalEvents: parseInt(platform.total_events) || 0,
        totalOrders: parseInt(platform.total_orders) || 0,
        totalGMV: parseFloat(platform.total_gmv) || 0,
        totalPlatformRevenue: parseFloat(platform.total_platform_revenue) || 0
      },
      topClients: clientsResult.rows.map(c => ({
        id: c.id,
        name: c.name,
        orders: parseInt(c.orders) || 0,
        gmv: parseFloat(c.gmv) || 0,
        platformFees: parseFloat(c.platform_fees) || 0
      }))
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/stats/clients/compare
 * Compare clients (platform admin only)
 */
router.get('/clients/compare', requirePlatformAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const params = [];
    let dateFilter = '';
    
    if (startDate) {
      dateFilter += ` AND o.created_at >= $1`;
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ` AND o.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }
    
    const query = `
      SELECT 
        c.id,
        c.name,
        c.platform_fee_percent,
        c.created_at,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'active') as active_events,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.quantity), 0) as tickets_sold,
        COALESCE(SUM(o.total_price), 0) as gross_revenue,
        COALESCE(SUM(o.platform_fee_amount), 0) as platform_fees,
        COALESCE(SUM(o.client_revenue), 0) as client_revenue
      FROM clients c
      LEFT JOIN events e ON c.id = e.client_id 
        AND (e.is_test = false OR e.is_test IS NULL)
        AND e.status != 'test'
      LEFT JOIN orders o ON e.id = o.event_id 
        AND o.payment_status = 'paid' 
        AND (o.is_test = false OR o.is_test IS NULL)
        ${dateFilter}
      WHERE c.status = 'active'
      GROUP BY c.id, c.name, c.platform_fee_percent, c.created_at
      ORDER BY gross_revenue DESC
    `;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      clients: result.rows.map(c => ({
        id: c.id,
        name: c.name,
        platformFeePercent: parseFloat(c.platform_fee_percent) || 0,
        createdAt: c.created_at,
        activeEvents: parseInt(c.active_events) || 0,
        totalOrders: parseInt(c.total_orders) || 0,
        ticketsSold: parseInt(c.tickets_sold) || 0,
        grossRevenue: parseFloat(c.gross_revenue) || 0,
        platformFees: parseFloat(c.platform_fees) || 0,
        clientRevenue: parseFloat(c.client_revenue) || 0
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
