/**
 * Order Routes
 */

const express = require('express');
const orderService = require('../services/order');

const router = express.Router();

/**
 * Format order for API response
 */
function formatOrder(order) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    eventId: order.event_id,
    eventName: order.event_name,
    eventDate: order.event_date,
    eventTime: order.event_time,
    eventLocation: order.location,
    tierId: order.tier_id,
    tierName: order.tier_name,
    buyerName: order.buyer_name,
    buyerEmail: order.buyer_email,
    buyerPhone: order.buyer_phone,
    buyerCountry: order.buyer_country,
    quantity: order.quantity,
    unitPrice: parseFloat(order.unit_price),
    totalPrice: parseFloat(order.total_price),
    currency: order.currency,
    status: order.status,
    paymentMethod: order.payment_method,
    createdAt: order.created_at
  };
}

/**
 * POST /api/orders
 * Create new order
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      eventId,
      tierId,
      buyerName,
      buyerEmail,
      buyerPhone,
      buyerCountry,
      buyerNationality,
      quantity,
      paymentMethod,
      referralSource
    } = req.body;
    
    // Validation
    if (!eventId || !tierId || !buyerName || !buyerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    // Email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const order = await orderService.createOrder({
      eventId,
      tierId,
      buyerName,
      buyerEmail,
      buyerPhone,
      buyerCountry,
      buyerNationality,
      quantity: quantity || 1,
      paymentMethod,
      referralSource,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.status(201).json({
      success: true,
      order: formatOrder(order),
      qrCode: order.qr_plaintext, // Only returned at creation
      message: 'Order created'
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_INVENTORY') {
      return res.status(400).json({
        success: false,
        error: 'Not enough tickets available',
        code: 'SOLD_OUT'
      });
    }
    next(err);
  }
});

/**
 * GET /api/orders/:orderNumber
 * Get order by order number
 */
router.get('/:orderNumber', async (req, res, next) => {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      order: formatOrder(order)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
