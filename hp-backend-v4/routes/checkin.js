/**
 * Check-in Routes
 */

const express = require('express');
const db = require('../db/pool');
const qrService = require('../services/qr');
const auditService = require('../services/audit');
const { optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/checkin
 * Check in a ticket
 */
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { order_id, qr_code } = req.body;
    
    if (!order_id && !qr_code) {
      return res.status(400).json({
        success: false,
        error: 'Order ID or QR code required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    // Find order
    let order;
    
    if (qr_code) {
      order = await qrService.findOrderByQR(db, qr_code);
    } else {
      order = await db.queryOne(
        `SELECT o.*, e.name as event_name, t.name as tier_name
         FROM orders o
         JOIN events e ON e.id = o.event_id
         JOIN ticket_tiers t ON t.id = o.tier_id
         WHERE o.order_number = $1`,
        [order_id.toUpperCase()]
      );
    }
    
    if (!order) {
      logger.warn('Check-in failed: order not found', { order_id, qr_code: !!qr_code });
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
        code: 'ORDER_NOT_FOUND'
      });
    }
    
    // Check if paid
    if (order.status !== 'paid') {
      logger.warn('Check-in failed: not paid', { 
        orderId: order.id, 
        status: order.status 
      });
      return res.status(400).json({
        success: false,
        error: 'Payment not confirmed',
        code: 'NOT_PAID'
      });
    }
    
    // Check if already checked in
    const existingCheckin = await db.queryOne(
      `SELECT id, checked_in_at FROM checkins WHERE order_id = $1`,
      [order.id]
    );
    
    if (existingCheckin) {
      logger.warn('Check-in failed: already checked in', { 
        orderId: order.id,
        checkedInAt: existingCheckin.checked_in_at
      });
      return res.status(400).json({
        success: false,
        error: 'Already checked in',
        code: 'ALREADY_CHECKED_IN',
        checkedInAt: existingCheckin.checked_in_at
      });
    }
    
    // Perform check-in (atomic)
    await db.transaction(async (client) => {
      // Double-check no existing check-in (with lock)
      const lockCheck = await client.query(
        `SELECT id FROM checkins WHERE order_id = $1 FOR UPDATE`,
        [order.id]
      );
      
      if (lockCheck.rows.length > 0) {
        throw new Error('ALREADY_CHECKED_IN');
      }
      
      // Create check-in record
      await client.query(
        `INSERT INTO checkins (order_id, checked_in_by, device_info)
         VALUES ($1, $2, $3)`,
        [
          order.id,
          req.user?.id || null,
          req.get('user-agent')
        ]
      );
    });
    
    // Audit log
    await auditService.logCheckin(order.id, req.user?.id);
    
    logger.info('Check-in successful', { 
      orderId: order.id,
      orderNumber: order.order_number,
      buyerName: order.buyer_name
    });
    
    res.json({
      success: true,
      message: 'Check-in successful',
      ticket: {
        id: order.order_number,
        name: order.buyer_name,
        tier: order.tier_name,
        event: order.event_name,
        quantity: order.quantity
      }
    });
  } catch (err) {
    if (err.message === 'ALREADY_CHECKED_IN') {
      return res.status(400).json({
        success: false,
        error: 'Already checked in',
        code: 'ALREADY_CHECKED_IN'
      });
    }
    next(err);
  }
});

/**
 * GET /api/checkin/verify/:orderNumber
 * Verify ticket without checking in
 */
router.get('/verify/:orderNumber', async (req, res, next) => {
  try {
    const order = await db.queryOne(
      `SELECT o.*, e.name as event_name, e.event_date, t.name as tier_name,
              c.checked_in_at
       FROM orders o
       JOIN events e ON e.id = o.event_id
       JOIN ticket_tiers t ON t.id = o.tier_id
       LEFT JOIN checkins c ON c.order_id = o.id
       WHERE o.order_number = $1`,
      [req.params.orderNumber.toUpperCase()]
    );
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
        code: 'ORDER_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      ticket: {
        orderNumber: order.order_number,
        buyerName: order.buyer_name,
        event: order.event_name,
        eventDate: order.event_date,
        tier: order.tier_name,
        quantity: order.quantity,
        status: order.status,
        checkedIn: !!order.checked_in_at,
        checkedInAt: order.checked_in_at
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
