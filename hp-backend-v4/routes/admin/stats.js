/**
 * Admin Statistics Routes
 */

import express from 'express';
import * as db from '../../db/pool.js';
import * as auditService from '../../services/audit.js';

const router = express.Router();

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/', async (req, res, next) => {
  try {
    const { eventId } = req.query;
    
    // Build base conditions
    const eventCondition = eventId ? 'AND o.event_id = $1' : '';
    const params = eventId ? [eventId] : [];
    
    // Get order stats
    const orderStats = await db.queryOne(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
        COUNT(*) FILTER (WHERE status = 'refunded') as refunded_orders,
        COALESCE(SUM(total_price) FILTER (WHERE status = 'paid'), 0) as total_revenue,
        COALESCE(SUM(quantity) FILTER (WHERE status = 'paid'), 0) as tickets_sold
      FROM orders o
      WHERE 1=1 ${eventCondition}
    `, params);
    
    // Get check-in stats
    const checkinStats = await db.queryOne(`
      SELECT COUNT(*) as checked_in
      FROM checkins c
      JOIN orders o ON o.id = c.order_id
      WHERE o.status = 'paid' ${eventCondition}
    `, params);
    
    // Get active events count
    const eventStats = await db.queryOne(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active_events,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_events
      FROM events
    `);
    
    // Recent orders
    const recentOrders = await db.queryAll(`
      SELECT o.order_number, o.buyer_name, o.total_price, o.status, o.created_at,
             e.name as event_name
      FROM orders o
      JOIN events e ON e.id = o.event_id
      WHERE 1=1 ${eventCondition}
      ORDER BY o.created_at DESC
      LIMIT 10
    `, params);
    
    res.json({
      success: true,
      stats: {
        orders: {
          pending: parseInt(orderStats.pending_orders) || 0,
          paid: parseInt(orderStats.paid_orders) || 0,
          cancelled: parseInt(orderStats.cancelled_orders) || 0,
          refunded: parseInt(orderStats.refunded_orders) || 0
        },
        revenue: parseFloat(orderStats.total_revenue) || 0,
        ticketsSold: parseInt(orderStats.tickets_sold) || 0,
        checkedIn: parseInt(checkinStats.checked_in) || 0,
        events: {
          active: parseInt(eventStats.active_events) || 0,
          draft: parseInt(eventStats.draft_events) || 0
        },
        recentOrders: recentOrders.map(o => ({
          orderNumber: o.order_number,
          buyerName: o.buyer_name,
          total: parseFloat(o.total_price),
          status: o.status,
          event: o.event_name,
          createdAt: o.created_at
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/stats/audit
 * Audit log
 */
router.get('/audit', async (req, res, next) => {
  try {
    const { limit, offset, action, entityType } = req.query;
    
    const logs = await auditService.getLogs({
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      action,
      entityType
    });
    
    res.json({
      success: true,
      logs: logs.map(l => ({
        id: l.id,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        userName: l.user_name,
        userEmail: l.user_email,
        oldValue: l.old_value,
        newValue: l.new_value,
        createdAt: l.created_at
      })),
      count: logs.length
    });
  } catch (err) {
    next(err);
  }
});

export default router;
