/**
 * Admin Order Routes
 */

const express = require('express');
const db = require('../../db/pool');
const orderService = require('../../services/order');
const emailService = require('../../services/email');
const auditService = require('../../services/audit');
const logger = require('../../utils/logger');

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
    if (err.message === 'EMAIL_NOT_QUEUED') {
      return res.status(400).json({
        success: false,
        error: 'No email was queued for this order',
        code: 'EMAIL_NOT_QUEUED'
      });
    }
    if (err.message === 'QR_PLAINTEXT_EXPIRED') {
      return res.status(400).json({
        success: false,
        error: 'Cannot resend - email was already sent and QR data expired',
        code: 'QR_PLAINTEXT_EXPIRED'
      });
    }
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

module.exports = router;
