/**
 * Order Service
 * Transactional order creation with atomic inventory
 * Orders are IMMUTABLE except for status changes
 */

import * as db from '../db/pool.js';
import * as inventoryService from './inventory.js';
import * as qrService from './qr.js';
import * as emailService from './email.js';
import logger from '../utils/logger.js';

/**
 * Generate order number
 */
function generateOrderNumber() {
  const date = new Date();
  const datePart = date.toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `HP${datePart}-${randomPart}`;
}

/**
 * Create order with transactional inventory reservation
 * @param {Object} orderData - Order details
 * @returns {Object} - Created order
 */
export async function createOrder(orderData) {
  const {
    eventId,
    tierId,
    buyerName,
    buyerEmail,
    buyerPhone,
    buyerCountry,
    buyerNationality,
    quantity = 1,
    paymentMethod,
    referralSource,
    ipAddress,
    userAgent
  } = orderData;
  
  return db.transaction(async (client) => {
    // 1. Get event and tier info
    const tier = await client.query(
      `SELECT t.*, e.name as event_name, e.status as event_status
       FROM ticket_tiers t
       JOIN events e ON e.id = t.event_id
       WHERE t.id = $1 AND t.event_id = $2`,
      [tierId, eventId]
    );
    
    if (tier.rows.length === 0) {
      throw new Error('TIER_NOT_FOUND');
    }
    
    const tierData = tier.rows[0];
    
    if (tierData.event_status !== 'active') {
      throw new Error('EVENT_NOT_ACTIVE');
    }
    
    if (!tierData.is_active) {
      throw new Error('TIER_NOT_ACTIVE');
    }
    
    // 2. Reserve inventory (WITH FOR UPDATE LOCK)
    const reserved = await inventoryService.reserveWithinTransaction(
      client,
      tierId,
      quantity
    );
    
    if (!reserved) {
      throw new Error('INSUFFICIENT_INVENTORY');
    }
    
    // 3. Generate QR code
    const { plaintext: qrPlaintext, hash: qrHash } = qrService.generateQRCode();
    
    // 4. Create order
    const orderNumber = generateOrderNumber();
    const unitPrice = parseFloat(tierData.price);
    const totalPrice = unitPrice * quantity;
    
    const orderResult = await client.query(
      `INSERT INTO orders (
        order_number, event_id, tier_id,
        buyer_name, buyer_email, buyer_phone, buyer_country, buyer_nationality,
        quantity, unit_price, total_price, currency,
        payment_method, referral_source, ip_address, user_agent,
        qr_code_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        orderNumber, eventId, tierId,
        buyerName, buyerEmail, buyerPhone || null, buyerCountry || null, buyerNationality || null,
        quantity, unitPrice, totalPrice, tierData.currency || 'USD',
        paymentMethod || null, referralSource || 'direct', ipAddress || null, userAgent || null,
        qrHash
      ]
    );
    
    const order = orderResult.rows[0];
    
    logger.info('Order created', {
      orderId: order.id,
      orderNumber: order.order_number,
      tierId,
      quantity,
      total: totalPrice
    });
    
    return {
      ...order,
      event_name: tierData.event_name,
      tier_name: tierData.name,
      qr_plaintext: qrPlaintext // Only returned at creation time
    };
  });
}

/**
 * Confirm payment (idempotent)
 * @param {string} orderId - Order ID
 * @param {Object} paymentInfo - Payment details
 * @param {Object} confirmedBy - User who confirmed (optional)
 */
export async function confirmPayment(orderId, paymentInfo = {}, confirmedBy = null) {
  return db.transaction(async (client) => {
    // Lock order row
    const orderResult = await client.query(
      `SELECT o.*, e.name as event_name, t.name as tier_name
       FROM orders o
       JOIN events e ON e.id = o.event_id
       JOIN ticket_tiers t ON t.id = o.tier_id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      throw new Error('ORDER_NOT_FOUND');
    }
    
    const order = orderResult.rows[0];
    
    // Idempotency check - if already paid, return success without changes
    if (order.status === 'paid') {
      logger.info('Payment already confirmed (idempotent)', { 
        orderId, 
        orderNumber: order.order_number 
      });
      return { order, alreadyPaid: true };
    }
    
    if (order.status !== 'pending') {
      throw new Error('ORDER_NOT_PENDING');
    }
    
    // Update order status
    await client.query(
      `UPDATE orders SET
        status = 'paid',
        payment_provider = $2,
        payment_reference = $3,
        payment_confirmed_at = CURRENT_TIMESTAMP,
        payment_confirmed_by = $4
       WHERE id = $1`,
      [
        orderId,
        paymentInfo.provider || 'manual',
        paymentInfo.reference || null,
        confirmedBy?.id || null
      ]
    );
    
    logger.info('Payment confirmed', {
      orderId,
      orderNumber: order.order_number,
      provider: paymentInfo.provider
    });
    
    // Queue ticket email (separate from status update)
    await emailService.queueTicketEmail(db, {
      id: order.id,
      buyer_email: order.buyer_email,
      event_name: order.event_name
    });
    
    return { order: { ...order, status: 'paid' }, alreadyPaid: false };
  });
}

/**
 * Cancel order (release inventory if pending)
 */
export async function cancelOrder(orderId, reason = null, cancelledBy = null) {
  return db.transaction(async (client) => {
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      throw new Error('ORDER_NOT_FOUND');
    }
    
    const order = orderResult.rows[0];
    
    if (order.status === 'cancelled') {
      return { order, alreadyCancelled: true };
    }
    
    if (order.status !== 'pending') {
      throw new Error('CANNOT_CANCEL_NON_PENDING');
    }
    
    // Release inventory
    await inventoryService.releaseWithinTransaction(
      client,
      order.tier_id,
      order.quantity
    );
    
    // Update status
    await client.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [orderId]
    );
    
    logger.info('Order cancelled', { orderId, orderNumber: order.order_number });
    
    return { order: { ...order, status: 'cancelled' }, alreadyCancelled: false };
  });
}

/**
 * Refund order (release inventory)
 */
export async function refundOrder(orderId, reason = null, refundedBy = null) {
  return db.transaction(async (client) => {
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      throw new Error('ORDER_NOT_FOUND');
    }
    
    const order = orderResult.rows[0];
    
    if (order.status === 'refunded') {
      return { order, alreadyRefunded: true };
    }
    
    if (order.status !== 'paid') {
      throw new Error('CANNOT_REFUND_NON_PAID');
    }
    
    // Release inventory
    await inventoryService.releaseWithinTransaction(
      client,
      order.tier_id,
      order.quantity
    );
    
    // Update status
    await client.query(
      `UPDATE orders SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [orderId]
    );
    
    logger.info('Order refunded', { orderId, orderNumber: order.order_number });
    
    return { order: { ...order, status: 'refunded' }, alreadyRefunded: false };
  });
}

/**
 * Get order by ID
 */
export async function getOrderById(orderId) {
  return db.queryOne(
    `SELECT o.*, e.name as event_name, e.event_date, e.event_time, e.location,
            t.name as tier_name, t.price as tier_price
     FROM orders o
     JOIN events e ON e.id = o.event_id
     JOIN ticket_tiers t ON t.id = o.tier_id
     WHERE o.id = $1`,
    [orderId]
  );
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(orderNumber) {
  return db.queryOne(
    `SELECT o.*, e.name as event_name, e.event_date, e.event_time, e.location,
            t.name as tier_name, t.price as tier_price
     FROM orders o
     JOIN events e ON e.id = o.event_id
     JOIN ticket_tiers t ON t.id = o.tier_id
     WHERE o.order_number = $1`,
    [orderNumber]
  );
}

/**
 * List orders with filters
 */
export async function listOrders(filters = {}) {
  const { eventId, status, limit = 100, offset = 0 } = filters;
  
  let sql = `
    SELECT o.*, e.name as event_name, e.event_date,
           t.name as tier_name, t.price as tier_price
    FROM orders o
    JOIN events e ON e.id = o.event_id
    JOIN ticket_tiers t ON t.id = o.tier_id
  `;
  
  const conditions = [];
  const params = [];
  
  if (eventId) {
    params.push(eventId);
    conditions.push(`o.event_id = $${params.length}`);
  }
  
  if (status) {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return db.queryAll(sql, params);
}

export default {
  createOrder,
  confirmPayment,
  cancelOrder,
  refundOrder,
  getOrderById,
  getOrderByNumber,
  listOrders
};
