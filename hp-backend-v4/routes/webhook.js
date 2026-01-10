/**
 * Webhook Routes
 * Provider-agnostic payment webhook handling
 */

const express = require('express');
const orderService = require('../services/order');
const emailService = require('../services/email');
const db = require('../db/pool');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/webhook/payment
 * Generic payment webhook
 */
router.post('/payment', async (req, res, next) => {
  try {
    logger.info('Payment webhook received', { 
      body: JSON.stringify(req.body).substring(0, 500) 
    });
    
    const { event, data, order_id, status, payment_id, reference } = req.body;
    
    // Determine payment status from various webhook formats
    let paymentStatus = null;
    let orderId = order_id;
    let paymentRef = payment_id || reference;
    
    // Recurrente format
    if (event === 'checkout.completed' || event === 'payment.succeeded') {
      paymentStatus = 'paid';
      orderId = orderId || data?.metadata?.order_id || data?.order_id;
      paymentRef = paymentRef || data?.payment_id || data?.id;
    } else if (event === 'payment.failed') {
      paymentStatus = 'failed';
      orderId = orderId || data?.metadata?.order_id;
    }
    
    // Direct status format
    if (status === 'paid' || status === 'completed' || status === 'success') {
      paymentStatus = 'paid';
    } else if (status === 'failed' || status === 'error') {
      paymentStatus = 'failed';
    }
    
    if (!orderId) {
      logger.warn('Webhook missing order ID');
      return res.json({ received: true, processed: false, reason: 'no_order_id' });
    }
    
    // Find order
    let order = await orderService.getOrderByNumber(orderId);
    if (!order) {
      order = await orderService.getOrderById(orderId);
    }
    
    if (!order) {
      logger.warn('Webhook order not found', { orderId });
      return res.json({ received: true, processed: false, reason: 'order_not_found' });
    }
    
    // Process payment confirmation
    if (paymentStatus === 'paid') {
      const result = await orderService.confirmPayment(order.id, {
        provider: 'webhook',
        reference: paymentRef
      });
      
      // Process email queue
      if (!result.alreadyPaid) {
        await emailService.processPendingEmails(db, 1);
      }
      
      logger.info('Webhook payment confirmed', { 
        orderId: order.id, 
        orderNumber: order.order_number,
        alreadyPaid: result.alreadyPaid
      });
    }
    
    res.json({ received: true, processed: true });
  } catch (err) {
    logger.error('Webhook processing error', { error: err.message });
    // Always return 200 to prevent webhook retries
    res.json({ received: true, processed: false, error: err.message });
  }
});

/**
 * POST /api/webhook/recurrente
 * Recurrente-specific webhook
 */
router.post('/recurrente', async (req, res, next) => {
  try {
    logger.info('Recurrente webhook', { event: req.body.event });
    
    const { event, data } = req.body;
    
    if (event === 'checkout.completed' || event === 'payment.succeeded') {
      const orderId = data?.metadata?.order_id || data?.customer_email;
      
      if (orderId) {
        let order = await orderService.getOrderByNumber(orderId);
        
        // Try email match if order number not found
        if (!order && data?.customer_email) {
          const orders = await db.queryAll(
            `SELECT * FROM orders WHERE buyer_email = $1 AND status = 'pending'
             ORDER BY created_at DESC LIMIT 1`,
            [data.customer_email]
          );
          order = orders[0];
        }
        
        if (order) {
          await orderService.confirmPayment(order.id, {
            provider: 'recurrente',
            reference: data?.id || data?.payment_id
          });
          
          await emailService.processPendingEmails(db, 1);
          
          logger.info('Recurrente payment confirmed', { orderId: order.id });
        }
      }
    }
    
    res.json({ received: true });
  } catch (err) {
    logger.error('Recurrente webhook error', { error: err.message });
    res.json({ received: true, error: err.message });
  }
});

module.exports = router;
