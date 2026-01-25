/**
 * Admin Order Routes
 */

import express from 'express';
import * as db from '../../db/pool.js';
import * as orderService from '../../services/order.js';
import * as emailService from '../../services/email.js';
import * as auditService from '../../services/audit.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/admin/orders
 * List orders
 */
router.get('/', async (req, res, next) => {
  try {
    const { eventId, status, limit, offset } = req.query;
    
    const orders = await orderService.listOrders({
      eventId,
      status,
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
        status: order.status,
        paymentMethod: order.payment_method,
        emailStatus: emailStatus?.status || null,
        emailSentAt: emailStatus?.sent_at || null,
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

/**
 * POST /api/admin/orders/test
 * Create test order (paid immediately)
 */
router.post('/test', async (req, res, next) => {
  try {
    const { 
      event_id, 
      tier_id, 
      buyer_name, 
      buyer_email, 
      buyer_phone,
      quantity = 1,
      send_email = true 
    } = req.body;
    
    // Validate required fields
    if (!event_id || !tier_id || !buyer_name || !buyer_email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: event_id, tier_id, buyer_name, buyer_email'
      });
    }
    
    // Create order
    const order = await orderService.createOrder({
      eventId: event_id,
      tierId: tier_id,
      buyerName: buyer_name,
      buyerEmail: buyer_email,
      buyerPhone: buyer_phone,
      quantity: parseInt(quantity) || 1,
      paymentMethod: 'test',
      referralSource: 'admin_test'
    });
    
    // Immediately confirm payment
    const paymentResult = await orderService.confirmPayment(order.id, {
      provider: 'test',
      reference: `TEST-${Date.now()}`
    }, req.user);
    
    // Send email if requested
    let emailSent = false;
    if (send_email && !paymentResult.alreadyPaid) {
      const emailResult = await emailService.processPendingEmails(db, 1);
      emailSent = emailResult.sent > 0;
    }
    
    await auditService.logOrderStatusChange(order.id, req.user.id, 'pending', 'paid');
    
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
        totalPrice: parseFloat(order.total_price),
        status: 'paid',
        qrCode: order.qr_plaintext
      },
      emailSent
    });
  } catch (err) {
    if (err.message === 'TIER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'Event or tier not found'
      });
    }
    if (err.message === 'INSUFFICIENT_INVENTORY') {
      return res.status(400).json({
        success: false,
        error: 'Not enough tickets available'
      });
    }
    if (err.message === 'EVENT_NOT_ACTIVE') {
      return res.status(400).json({
        success: false,
        error: 'Event is not active'
      });
    }
    next(err);
  }
});

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
        
        // Process email if requested
        if (sendEmail !== false && !result.alreadyPaid) {
          const emailResult = await emailService.processPendingEmails(db, 1);
          emailSent = emailResult.sent > 0;
        }
        break;
        
      case 'cancelled':
        result = await orderService.cancelOrder(orderId, null, req.user);
        break;
        
      case 'refunded':
        result = await orderService.refundOrder(orderId, null, req.user);
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
    
    const result = await emailService.forceResendTicket(db, orderId);
    
    logger.info('Email resend triggered', { 
      orderId, 
      sent: result.sent,
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
    if (!result.alreadyPaid) {
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

/**
 * GET /api/admin/checkins
 * Get recent check-ins
 */
router.get('/checkins', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const checkins = await db.queryAll(
      `SELECT c.*, 
              o.order_number, o.buyer_name, o.buyer_email, o.quantity,
              e.name as event_name, t.name as tier_name
       FROM checkins c
       JOIN orders o ON o.id = c.order_id
       JOIN events e ON e.id = o.event_id
       JOIN ticket_tiers t ON t.id = o.tier_id
       ORDER BY c.checked_in_at DESC
       LIMIT $1`,
      [limit]
    );
    
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
        checkedInAt: c.checked_in_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
