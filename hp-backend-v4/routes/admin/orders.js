/**
 * Admin Order Routes v2.0
 * Isolated test orders + multi-tenant support
 * 
 * TASK 5 & 6: Test Order Isolation
 * - No event/tier selection for test orders
 * - System test event/tier auto-created
 * - is_test = true for all test orders
 * - Test orders excluded from stats by default
 * 
 * BACKWARDS COMPATIBILITY:
 * - All existing endpoints preserved
 * - Default behavior excludes test orders
 */

import express from 'express';
import * as db from '../../db/pool.js';
import * as orderService from '../../services/order.js';
import * as emailService from '../../services/email.js';
import * as auditService from '../../services/audit.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ============================================
// LIST ORDERS
// ============================================

/**
 * GET /api/admin/orders
 * List orders (excludes test orders by default)
 */
router.get('/', async (req, res, next) => {
  try {
    const { eventId, status, clientId, includeTest, limit, offset } = req.query;
    
    // User's client scope (if not platform admin)
    const userClientId = req.user.client_id || clientId;
    
    const orders = await orderService.listOrders({
      eventId,
      status,
      clientId: userClientId,
      includeTest: includeTest === 'true', // Default: exclude test orders
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    
    // Get email status for each order
    const ordersWithEmail = await Promise.all(orders.map(async (order) => {
      const emailStatus = await emailService.getEmailStatus(db, order.id);
      return {
        id: order.id,
        orderNumber: order.order_number,
        eventName: order.event_name,
        eventDate: order.event_date,
        tierName: order.tier_name,
        buyerName: order.buyer_name,
        buyerEmail: order.buyer_email,
        buyerPhone: order.buyer_phone,
        quantity: order.quantity,
        totalPrice: parseFloat(order.total_price),
        platformFee: parseFloat(order.platform_fee_amount || 0),
        clientRevenue: parseFloat(order.client_revenue || order.total_price),
        status: order.status,
        paymentMethod: order.payment_method,
        emailStatus: emailStatus?.status || null,
        emailSentAt: emailStatus?.sent_at || null,
        isTest: order.is_test || false,
        createdAt: order.created_at
      };
    }));
    
    res.json({
      success: true,
      orders: ordersWithEmail,
      count: orders.length
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// CREATE TEST ORDER (TASK 5 & 6)
// ============================================

/**
 * POST /api/admin/orders/test
 * Create isolated test order
 * 
 * CRITICAL CHANGES FROM OLD VERSION:
 * - NO event_id or tier_id required
 * - Uses system test event/tier automatically
 * - Creates with is_test = true
 * - Amount = $0.00
 * - Does NOT affect real inventory or stats
 */
router.post('/test', async (req, res, next) => {
  try {
    const { 
      buyer_email, 
      buyer_name, 
      buyer_phone,
      quantity = 1,
      send_email = true 
    } = req.body;
    
    // Validate required field
    if (!buyer_email) {
      return res.status(400).json({
        success: false,
        error: 'buyer_email is required'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(buyer_email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
    // Create isolated test order
    const order = await orderService.createTestOrder({
      buyerEmail: buyer_email,
      buyerName: buyer_name || 'Test User',
      buyerPhone: buyer_phone,
      quantity: parseInt(quantity) || 1,
      createdBy: req.user.id
    });
    
    // Log audit
    await auditService.logTestOrderCreated(order.id, req.user.id, order);
    
    // Send test email if requested
    let emailSent = false;
    if (send_email) {
      emailSent = await emailService.sendTestTicketEmail(db, order);
      if (emailSent) {
        await auditService.logTestEmailSent(order.id, req.user.id, buyer_email);
      }
    }
    
    logger.info('Test order created', { 
      orderId: order.id, 
      orderNumber: order.order_number,
      userId: req.user.id,
      emailSent
    });
    
    res.json({
      success: true,
      message: 'Test order created',
      order: {
        id: order.id,
        orderNumber: order.order_number,
        eventName: order.event_name,
        tierName: order.tier_name,
        buyerName: order.buyer_name,
        buyerEmail: order.buyer_email,
        quantity: order.quantity,
        totalPrice: 0.00, // Always $0 for test orders
        status: 'paid',
        isTest: true,
        qrCode: order.qr_plaintext
      },
      emailSent
    });
  } catch (err) {
    if (err.message === 'BUYER_EMAIL_REQUIRED') {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }
    next(err);
  }
});

// ============================================
// UPDATE ORDER STATUS (EXISTING)
// ============================================

/**
 * PUT /api/admin/orders/:id/status
 * Update order status
 */
router.put('/:id/status', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { status, paymentReference, sendEmail } = req.body;
    
    const validStatuses = ['pending', 'paid', 'cancelled', 'refunded'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        validStatuses
      });
    }
    
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }
    
    const oldStatus = order.status;
    let result;
    let emailSent = false;
    
    switch (status) {
      case 'paid':
        result = await orderService.confirmPayment(orderId, {
          provider: 'admin',
          reference: paymentReference
        }, req.user);
        
        // Process email if requested (skip for test orders)
        if (sendEmail !== false && !result.alreadyPaid && !order.is_test) {
          const emailResult = await emailService.processPendingEmails(db, 1);
          emailSent = emailResult.sent > 0;
        }
        break;
        
      case 'cancelled':
        result = await orderService.cancelOrder(orderId, null, req.user);
        break;
        
      case 'refunded':
        result = await orderService.refundOrder(orderId, null, req.user);
        await auditService.logOrderRefund(orderId, req.user.id);
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid status transition'
        });
    }
    
    await auditService.logOrderStatusChange(orderId, req.user.id, oldStatus, status);
    
    logger.info('Order status updated', { 
      orderId, 
      orderNumber: order.order_number,
      oldStatus, 
      newStatus: status,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: 'Order status updated',
      emailSent
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// RESEND EMAIL
// ============================================

/**
 * POST /api/admin/orders/:id/resend-email
 * Resend ticket email
 */
router.post('/:id/resend-email', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }
    
    if (order.status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Can only resend email for paid orders'
      });
    }
    
    // forceResendTicket automatically handles test vs regular orders
    const result = await emailService.forceResendTicket(db, orderId);
    
    logger.info('Email resend triggered', { 
      orderId, 
      sent: result.sent,
      isTest: order.is_test,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      emailSent: result.sent > 0,
      message: result.sent > 0 ? 'Email sent' : 'Email queued'
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// LEGACY ENDPOINT (BACKWARDS COMPAT)
// ============================================

/**
 * POST /api/admin/mark-paid
 * Legacy endpoint for backward compatibility
 */
router.post('/mark-paid', async (req, res, next) => {
  try {
    const { order_id } = req.body;
    
    if (!order_id) {
      return res.status(400).json({
        success: false,
        error: 'order_id required'
      });
    }
    
    // Find by order number or ID
    let order = await orderService.getOrderByNumber(order_id);
    if (!order) {
      order = await orderService.getOrderById(order_id);
    }
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }
    
    const result = await orderService.confirmPayment(order.id, {
      provider: 'admin_legacy'
    }, req.user);
    
    let emailSent = false;
    if (!result.alreadyPaid && !order.is_test) {
      const emailResult = await emailService.processPendingEmails(db, 1);
      emailSent = emailResult.sent > 0;
    }
    
    res.json({
      success: true,
      message: result.alreadyPaid ? 'Already paid' : 'Payment confirmed',
      emailSent,
      order_id: order.order_number
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// CHECK-INS (Exclude test by default)
// ============================================

/**
 * GET /api/admin/orders/checkins
 * Get recent check-ins (excludes test by default)
 */
router.get('/checkins', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const includeTest = req.query.includeTest === 'true';
    
    let sql = `
      SELECT c.*, 
             o.order_number, o.buyer_name, o.buyer_email, o.quantity, o.is_test,
             e.name as event_name, t.name as tier_name
      FROM checkins c
      JOIN orders o ON o.id = c.order_id
      JOIN events e ON e.id = o.event_id
      JOIN ticket_tiers t ON t.id = o.tier_id
    `;
    
    if (!includeTest) {
      sql += ` WHERE o.is_test = false`;
    }
    
    sql += ` ORDER BY c.checked_in_at DESC LIMIT $1`;
    
    const checkins = await db.queryAll(sql, [limit]);
    
    res.json({
      success: true,
      checkins: checkins.map(c => ({
        id: c.id,
        orderNumber: c.order_number,
        buyerName: c.buyer_name,
        buyerEmail: c.buyer_email,
        quantity: c.quantity,
        eventName: c.event_name,
        tierName: c.tier_name,
        isTest: c.is_test || false,
        checkedInAt: c.checked_in_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// ORDER EXPORT (TASK 8)
// ============================================

/**
 * GET /api/admin/orders/export
 * Export orders as CSV
 */
router.get('/export', async (req, res, next) => {
  try {
    const { eventId, status, startDate, endDate, includeTest } = req.query;
    
    let sql = `
      SELECT 
        o.order_number,
        o.created_at,
        o.buyer_name,
        o.buyer_email,
        o.buyer_phone,
        e.name as event_name,
        e.event_date,
        t.name as tier_name,
        o.quantity,
        o.unit_price,
        o.total_price,
        o.platform_fee_amount,
        o.status,
        o.payment_method,
        o.payment_confirmed_at,
        o.is_test
      FROM orders o
      JOIN events e ON e.id = o.event_id
      JOIN ticket_tiers t ON t.id = o.tier_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (includeTest !== 'true') {
      sql += ` AND o.is_test = false`;
    }
    
    if (eventId) {
      params.push(eventId);
      sql += ` AND o.event_id = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      sql += ` AND o.status = $${params.length}`;
    }
    
    if (startDate) {
      params.push(startDate);
      sql += ` AND o.created_at >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      sql += ` AND o.created_at <= $${params.length}`;
    }
    
    sql += ` ORDER BY o.created_at DESC`;
    
    const orders = await db.queryAll(sql, params);
    
    // Generate CSV
    const headers = [
      'Order Number', 'Date', 'Buyer Name', 'Buyer Email', 'Buyer Phone',
      'Event', 'Event Date', 'Tier', 'Quantity', 'Unit Price', 'Total',
      'Platform Fee', 'Status', 'Payment Method', 'Payment Date', 'Test Order'
    ];
    
    const rows = orders.map(o => [
      o.order_number,
      new Date(o.created_at).toISOString(),
      o.buyer_name,
      o.buyer_email,
      o.buyer_phone || '',
      o.event_name,
      o.event_date,
      o.tier_name,
      o.quantity,
      o.unit_price,
      o.total_price,
      o.platform_fee_amount || 0,
      o.status,
      o.payment_method || '',
      o.payment_confirmed_at ? new Date(o.payment_confirmed_at).toISOString() : '',
      o.is_test ? 'Yes' : 'No'
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
