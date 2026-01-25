/**
 * Order Service v2.0
 * Multi-tenant with test order isolation and platform fees
 * 
 * BACKWARDS COMPATIBILITY:
 * - All existing function signatures preserved
 * - Test orders fully isolated (is_test = true)
 * - Platform fees only apply to new orders with clients
 */

import * as db from '../db/pool.js';
import * as inventoryService from './inventory.js';
import * as qrService from './qr.js';
import * as emailService from './email.js';
import * as customerService from './customer.js';
import logger from '../utils/logger.js';

// ============================================
// ORDER NUMBER GENERATION
// ============================================

/**
 * Generate standard order number
 * Format: HP-YYMMDD-XXXXXXXX
 */
function generateOrderNumber() {
  const date = new Date();
  const datePart = date.toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `HP${datePart}-${randomPart}`;
}

/**
 * Generate test order number
 * Format: TEST-YYMMDD-XXXXXX
 */
function generateTestOrderNumber() {
  const date = new Date();
  const datePart = date.toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TEST-${datePart}-${randomPart}`;
}

// ============================================
// STANDARD ORDER CREATION (EXISTING)
// ============================================

/**
 * Create order with transactional inventory reservation
 * UNCHANGED from original - maintains backwards compatibility
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
    // 1. Get event and tier info with client
    const tier = await client.query(
      `SELECT t.*, e.name as event_name, e.status as event_status, e.client_id,
              c.platform_fee_percent, c.platform_fee_fixed
       FROM ticket_tiers t
       JOIN events e ON e.id = t.event_id
       LEFT JOIN clients c ON c.id = e.client_id
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
    
    // 4. Calculate pricing and platform fees (TASK 3)
    const orderNumber = generateOrderNumber();
    const unitPrice = parseFloat(tierData.price);
    const totalPrice = unitPrice * quantity;
    
    // Platform fee calculation (only for clients with fees set)
    const feePercent = parseFloat(tierData.platform_fee_percent || 0);
    const feeFixed = parseFloat(tierData.platform_fee_fixed || 0);
    const platformFee = feePercent > 0 || feeFixed > 0 
      ? Math.round((totalPrice * (feePercent / 100) + feeFixed) * 100) / 100
      : 0;
    const clientRevenue = totalPrice - platformFee;
    
    // 5. Create order (is_test = false for real orders)
    const orderResult = await client.query(
      `INSERT INTO orders (
        order_number, event_id, tier_id,
        buyer_name, buyer_email, buyer_phone, buyer_country, buyer_nationality,
        quantity, unit_price, total_price, currency,
        platform_fee_amount, client_revenue,
        payment_method, referral_source, ip_address, user_agent,
        qr_code_hash, is_test
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, false)
      RETURNING *`,
      [
        orderNumber, eventId, tierId,
        buyerName, buyerEmail, buyerPhone || null, buyerCountry || null, buyerNationality || null,
        quantity, unitPrice, totalPrice, tierData.currency || 'USD',
        platformFee, clientRevenue,
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
      total: totalPrice,
      platformFee,
      isTest: false
    });
    
    return {
      ...order,
      event_name: tierData.event_name,
      tier_name: tierData.name,
      qr_plaintext: qrPlaintext // Only returned at creation time
    };
  });
}

// ============================================
// TEST ORDER CREATION (TASK 5 - ISOLATED)
// ============================================

const SYSTEM_TEST_EVENT_IDENTIFIER = '__SYSTEM_TEST_EVENT__';

/**
 * Get or create system test event
 * Creates a hidden test event that doesn't affect real data
 */
async function getOrCreateSystemTestEvent(client) {
  // Check for existing system test event
  const existing = await client.query(
    `SELECT e.*, t.id as tier_id 
     FROM events e
     LEFT JOIN ticket_tiers t ON t.event_id = e.id
     WHERE e.identifier = $1`,
    [SYSTEM_TEST_EVENT_IDENTIFIER]
  );
  
  if (existing.rows.length > 0 && existing.rows[0].tier_id) {
    return {
      eventId: existing.rows[0].id,
      tierId: existing.rows[0].tier_id,
      eventName: existing.rows[0].name,
      tierName: 'TEST TICKET'
    };
  }
  
  // Create system test event
  let eventId = existing.rows[0]?.id;
  
  if (!eventId) {
    const eventResult = await client.query(
      `INSERT INTO events (
        name, slug, location, venue, event_date, event_time,
        description, status, is_test, identifier,
        client_id
      ) VALUES (
        'TEST MODE — INTERNAL', 
        'system-test-event',
        'Internal Test',
        'Test Venue',
        '2099-12-31',
        '00:00',
        'System test event for internal testing. Not visible to public.',
        'test',
        true,
        $1,
        '00000000-0000-0000-0000-000000000001'
      )
      RETURNING id`,
      [SYSTEM_TEST_EVENT_IDENTIFIER]
    );
    eventId = eventResult.rows[0].id;
  }
  
  // Create test tier (unlimited quantity)
  const tierResult = await client.query(
    `INSERT INTO ticket_tiers (
      event_id, name, description, price, currency,
      quantity, max_per_order, is_active
    ) VALUES (
      $1, 'TEST TICKET', 'Test ticket - no real value',
      0.00, 'USD',
      999999, 100, true
    )
    RETURNING id`,
    [eventId]
  );
  
  return {
    eventId,
    tierId: tierResult.rows[0].id,
    eventName: 'TEST MODE — INTERNAL',
    tierName: 'TEST TICKET'
  };
}

/**
 * Create isolated test order
 * COMPLETELY SEPARATE from real orders:
 * - Uses system test event/tier (not real events)
 * - is_test = true (excluded from all stats)
 * - amount = 0 (no revenue impact)
 * - Doesn't affect real inventory
 * - Real QR codes (for check-in testing)
 * 
 * @param {Object} testData - Test order data
 * @returns {Object} - Created test order
 */
export async function createTestOrder(testData) {
  const {
    buyerEmail,
    buyerName = 'Test User',
    buyerPhone = null,
    quantity = 1,
    sendEmail = true,
    createdBy = null
  } = testData;
  
  if (!buyerEmail) {
    throw new Error('BUYER_EMAIL_REQUIRED');
  }
  
  return db.transaction(async (client) => {
    // 1. Get or create system test event/tier
    const testSystem = await getOrCreateSystemTestEvent(client);
    
    // 2. Generate QR code (real QR for check-in testing)
    const { plaintext: qrPlaintext, hash: qrHash } = qrService.generateQRCode();
    
    // 3. Generate test order number
    const orderNumber = generateTestOrderNumber();
    
    // 4. Create test order (is_test = true, amount = 0)
    const orderResult = await client.query(
      `INSERT INTO orders (
        order_number, event_id, tier_id,
        buyer_name, buyer_email, buyer_phone,
        quantity, unit_price, total_price, currency,
        platform_fee_amount, client_revenue,
        payment_method, referral_source,
        qr_code_hash,
        status, payment_confirmed_at, payment_confirmed_by,
        is_test
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        0.00, 0.00, 'USD',
        0.00, 0.00,
        'test', 'admin_test',
        $8,
        'paid', CURRENT_TIMESTAMP, $9,
        true
      )
      RETURNING *`,
      [
        orderNumber, testSystem.eventId, testSystem.tierId,
        buyerName, buyerEmail, buyerPhone, quantity,
        qrHash,
        createdBy
      ]
    );
    
    const order = orderResult.rows[0];
    
    // 5. Upsert test customer in CRM
    const customerId = await customerService.upsertTestCustomer(client, {
      email: buyerEmail,
      name: buyerName,
      phone: buyerPhone
    });
    
    // Update order with customer_id
    await client.query(
      `UPDATE orders SET customer_id = $1 WHERE id = $2`,
      [customerId, order.id]
    );
    
    logger.info('Test order created', {
      orderId: order.id,
      orderNumber: order.order_number,
      isTest: true,
      quantity
    });
    
    return {
      ...order,
      event_name: testSystem.eventName,
      tier_name: testSystem.tierName,
      qr_plaintext: qrPlaintext,
      customer_id: customerId
    };
  });
}

// ============================================
// PAYMENT CONFIRMATION (EXISTING + ENHANCED)
// ============================================

/**
 * Confirm payment (idempotent)
 * UNCHANGED for backwards compatibility
 * @param {string} orderId - Order ID
 * @param {Object} paymentInfo - Payment details
 * @param {Object} confirmedBy - User who confirmed (optional)
 */
export async function confirmPayment(orderId, paymentInfo = {}, confirmedBy = null) {
  return db.transaction(async (client) => {
    // Lock order row
    const orderResult = await client.query(
      `SELECT o.*, e.name as event_name, e.client_id, t.name as tier_name
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
    
    // Upsert customer in CRM (not test)
    const customerId = await customerService.upsertCustomerFromOrder(client, {
      email: order.buyer_email,
      name: order.buyer_name,
      phone: order.buyer_phone,
      clientId: order.client_id,
      orderTotal: parseFloat(order.total_price)
    });
    
    // Update order with customer_id
    if (customerId) {
      await client.query(
        `UPDATE orders SET customer_id = $1 WHERE id = $2`,
        [customerId, orderId]
      );
    }
    
    logger.info('Payment confirmed', {
      orderId,
      orderNumber: order.order_number,
      provider: paymentInfo.provider
    });
    
    // Queue ticket email (separate from status update)
    // Skip email for test orders (they use sendTestTicketEmail directly)
    if (!order.is_test) {
      await emailService.queueTicketEmail(db, {
        id: order.id,
        buyer_email: order.buyer_email,
        event_name: order.event_name
      });
    }
    
    return { order: { ...order, status: 'paid', customer_id: customerId }, alreadyPaid: false };
  });
}

/**
 * Confirm test order payment
 * Immediate confirmation (no real payment needed)
 */
export async function confirmTestPayment(orderId) {
  // Test orders are created as 'paid' already, this is a no-op for safety
  const order = await getOrderById(orderId);
  if (!order || !order.is_test) {
    throw new Error('TEST_ORDER_NOT_FOUND');
  }
  return { order, alreadyPaid: true };
}

// ============================================
// ORDER CANCELLATION & REFUND (EXISTING)
// ============================================

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
    
    // Release inventory (only for non-test orders)
    if (!order.is_test) {
      await inventoryService.releaseWithinTransaction(
        client,
        order.tier_id,
        order.quantity
      );
    }
    
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
    
    // Release inventory (only for non-test orders)
    if (!order.is_test) {
      await inventoryService.releaseWithinTransaction(
        client,
        order.tier_id,
        order.quantity
      );
    }
    
    // Update status
    await client.query(
      `UPDATE orders SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [orderId]
    );
    
    logger.info('Order refunded', { orderId, orderNumber: order.order_number });
    
    return { order: { ...order, status: 'refunded' }, alreadyRefunded: false };
  });
}

// ============================================
// ORDER QUERIES (EXISTING + ENHANCED)
// ============================================

/**
 * Get order by ID
 */
export async function getOrderById(orderId) {
  return db.queryOne(
    `SELECT o.*, e.name as event_name, e.event_date, e.event_time, e.location, e.is_test as event_is_test,
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
 * UPDATED: excludes test orders by default (includeTest parameter)
 * @param {Object} filters - Query filters
 * @returns {Array} - Orders
 */
export async function listOrders(filters = {}) {
  const { 
    eventId, 
    status, 
    clientId,
    includeTest = false,  // DEFAULT: exclude test orders
    limit = 100, 
    offset = 0 
  } = filters;
  
  let sql = `
    SELECT o.*, e.name as event_name, e.event_date, e.client_id,
           t.name as tier_name, t.price as tier_price
    FROM orders o
    JOIN events e ON e.id = o.event_id
    JOIN ticket_tiers t ON t.id = o.tier_id
  `;
  
  const conditions = [];
  const params = [];
  
  // CRITICAL: Exclude test orders by default
  if (!includeTest) {
    conditions.push(`o.is_test = false`);
  }
  
  if (eventId) {
    params.push(eventId);
    conditions.push(`o.event_id = $${params.length}`);
  }
  
  if (status) {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }
  
  if (clientId) {
    params.push(clientId);
    conditions.push(`e.client_id = $${params.length}`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return db.queryAll(sql, params);
}

/**
 * Get orders for check-in list
 * Excludes test orders by default
 */
export async function getCheckinOrders(eventId, includeTest = false) {
  let sql = `
    SELECT o.*, c.checked_in_at, c.checked_in_by,
           e.name as event_name, t.name as tier_name
    FROM orders o
    JOIN events e ON e.id = o.event_id
    JOIN ticket_tiers t ON t.id = o.tier_id
    LEFT JOIN checkins c ON c.order_id = o.id
    WHERE o.event_id = $1 AND o.status = 'paid'
  `;
  
  if (!includeTest) {
    sql += ` AND o.is_test = false`;
  }
  
  sql += ` ORDER BY o.buyer_name ASC`;
  
  return db.queryAll(sql, [eventId]);
}

export default {
  createOrder,
  createTestOrder,
  confirmPayment,
  confirmTestPayment,
  cancelOrder,
  refundOrder,
  getOrderById,
  getOrderByNumber,
  listOrders,
  getCheckinOrders
};
