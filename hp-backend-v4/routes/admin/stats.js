/**
 * Admin Stats Routes
 */

const express = require('express');
const db = require('../../db/pool');

const router = express.Router();

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/', async (req, res, next) => {
  try {
    const { eventId } = req.query;
    
    // Order stats
    let orderStatsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'refunded') as refunded_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        COALESCE(SUM(total_price) FILTER (WHERE status = 'paid'), 0) as total_revenue
      FROM orders
    `;
    
    const params = [];
    if (eventId) {
      orderStatsQuery += ' WHERE event_id = $1';
      params.push(eventId);
    }
    
    const orderStats = await db.queryOne(orderStatsQuery, params);
    
    // Check-in stats
    let checkinStatsQuery = `
      SELECT COUNT(*) as checked_in_count
      FROM checkins c
      JOIN orders o ON o.id = c.order_id
    `;
    
    if (eventId) {
      checkinStatsQuery += ' WHERE o.event_id = $1';
    }
    
    const checkinStats = await db.queryOne(checkinStatsQuery, params);
    
    // Active events
    const eventCount = await db.queryOne(
      `SELECT COUNT(*) as count FROM events WHERE status = 'active'`
    );
    
    // Referral breakdown
    const referrals = await db.queryAll(`
      SELECT referral_source, COUNT(*) as count
      FROM orders
      WHERE status = 'paid'
      GROUP BY referral_source
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Per-event stats
    const eventStats = await db.queryAll(`
      SELECT 
        e.id, e.name, e.event_date,
        COALESCE(SUM(t.sold), 0) as total_sold,
        COALESCE(SUM(t.quantity), 0) as total_capacity,
        COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'paid'), 0) as revenue
      FROM events e
      LEFT JOIN ticket_tiers t ON t.event_id = e.id
      LEFT JOIN orders o ON o.event_id = e.id
      WHERE e.status = 'active'
      GROUP BY e.id, e.name, e.event_date
      ORDER BY e.event_date ASC
    `);
    
    // Email stats
    const emailStats = await db.queryOne(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count
      FROM email_outbox
    `);
    
    res.json({
      success: true,
      stats: {
        orders: {
          paid: parseInt(orderStats.paid_count),
          pending: parseInt(orderStats.pending_count),
          refunded: parseInt(orderStats.refunded_count),
          cancelled: parseInt(orderStats.cancelled_count),
          checkedIn: parseInt(checkinStats.checked_in_count)
        },
        revenue: parseFloat(orderStats.total_revenue) || 0,
        activeEvents: parseInt(eventCount.count),
        referrals: referrals.reduce((acc, r) => {
          acc[r.referral_source || 'direct'] = parseInt(r.count);
          return acc;
        }, {}),
        eventStats: eventStats.map(e => ({
          id: e.id,
          name: e.name,
          date: e.event_date,
          sold: parseInt(e.total_sold),
          capacity: parseInt(e.total_capacity),
          revenue: parseFloat(e.revenue) || 0
        })),
        emails: {
          sent: parseInt(emailStats.sent_count),
          pending: parseInt(emailStats.pending_count),
          failed: parseInt(emailStats.failed_count)
        }
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
    const { limit, offset, entityType, action } = req.query;
    
    let sql = `
      SELECT al.*, u.email as user_email, u.name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (entityType) {
      params.push(entityType);
      conditions.push(`al.entity_type = $${params.length}`);
    }
    
    if (action) {
      params.push(action);
      conditions.push(`al.action = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit) || 50, parseInt(offset) || 0);
    
    const logs = await db.queryAll(sql, params);
    
    res.json({
      success: true,
      logs: logs.map(l => ({
        id: l.id,
        userId: l.user_id,
        userEmail: l.user_email,
        userName: l.user_name,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        oldValue: l.old_value,
        newValue: l.new_value,
        ipAddress: l.ip_address,
        createdAt: l.created_at
      })),
      count: logs.length
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
