/**
 * Audit Service v2.0
 * Expanded audit logging for multi-tenant SaaS
 * 
 * TASK 10: Security & Audit Logs
 * - Fee changes
 * - Refunds
 * - Payouts
 * - Admin actions
 * - Test order creation
 */

import * as db from '../db/pool.js';
import logger from '../utils/logger.js';

// ============================================
// ACTION TYPES
// ============================================

export const ACTIONS = {
  // Authentication
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_REGISTER: 'AUTH_REGISTER',
  AUTH_PASSWORD_CHANGE: 'AUTH_PASSWORD_CHANGE',
  AUTH_TOKEN_REFRESH: 'AUTH_TOKEN_REFRESH',
  
  // Orders
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_STATUS_CHANGE: 'ORDER_STATUS_CHANGE',
  ORDER_PAYMENT_CONFIRMED: 'ORDER_PAYMENT_CONFIRMED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_REFUNDED: 'ORDER_REFUNDED',
  ORDER_EMAIL_SENT: 'ORDER_EMAIL_SENT',
  ORDER_EMAIL_RESENT: 'ORDER_EMAIL_RESENT',
  
  // Test Orders (TASK 5)
  TEST_ORDER_CREATED: 'TEST_ORDER_CREATED',
  TEST_EMAIL_SENT: 'TEST_EMAIL_SENT',
  
  // Events
  EVENT_CREATED: 'EVENT_CREATED',
  EVENT_UPDATED: 'EVENT_UPDATED',
  EVENT_DELETED: 'EVENT_DELETED',
  EVENT_STATUS_CHANGE: 'EVENT_STATUS_CHANGE',
  EVENT_DUPLICATED: 'EVENT_DUPLICATED',
  
  // Tiers
  TIER_CREATED: 'TIER_CREATED',
  TIER_UPDATED: 'TIER_UPDATED',
  TIER_DELETED: 'TIER_DELETED',
  
  // Check-ins
  CHECKIN_SUCCESS: 'CHECKIN_SUCCESS',
  CHECKIN_FAILED: 'CHECKIN_FAILED',
  CHECKIN_DUPLICATE: 'CHECKIN_DUPLICATE',
  
  // Clients (TASK 1)
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  CLIENT_STATUS_CHANGE: 'CLIENT_STATUS_CHANGE',
  
  // Platform Fees (TASK 3)
  FEE_UPDATED: 'FEE_UPDATED',
  
  // Payouts (TASK 4)
  PAYOUT_CREATED: 'PAYOUT_CREATED',
  PAYOUT_PROCESSING: 'PAYOUT_PROCESSING',
  PAYOUT_COMPLETED: 'PAYOUT_COMPLETED',
  PAYOUT_FAILED: 'PAYOUT_FAILED',
  
  // Customers (TASK 7)
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_TIER_CHANGE: 'CUSTOMER_TIER_CHANGE',
  
  // Admin Actions
  ADMIN_USER_CREATED: 'ADMIN_USER_CREATED',
  ADMIN_USER_UPDATED: 'ADMIN_USER_UPDATED',
  ADMIN_USER_DISABLED: 'ADMIN_USER_DISABLED',
  ADMIN_SETTINGS_CHANGE: 'ADMIN_SETTINGS_CHANGE'
};

// ============================================
// CORE LOGGING FUNCTION
// ============================================

/**
 * Log an audit event
 * @param {Object} params - Audit parameters
 */
export async function log(params) {
  const {
    userId = null,
    action,
    entityType,
    entityId = null,
    oldValue = null,
    newValue = null,
    ipAddress = null,
    userAgent = null,
    metadata = null
  } = params;
  
  try {
    await db.query(
      `INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id,
        old_value, new_value, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entityType,
        entityId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress,
        userAgent
      ]
    );
    
    logger.debug('Audit logged', { action, entityType, entityId });
  } catch (err) {
    // Don't throw - audit logging should not break main flow
    logger.error('Audit logging failed', {
      error: err.message,
      action,
      entityType
    });
  }
}

// ============================================
// CONVENIENCE METHODS - ORDERS
// ============================================

export async function logOrderCreated(orderId, userId, orderData) {
  await log({
    userId,
    action: ACTIONS.ORDER_CREATED,
    entityType: 'order',
    entityId: orderId,
    newValue: {
      orderNumber: orderData.order_number,
      total: orderData.total_price,
      buyer: orderData.buyer_email
    }
  });
}

export async function logOrderStatusChange(orderId, userId, oldStatus, newStatus) {
  await log({
    userId,
    action: ACTIONS.ORDER_STATUS_CHANGE,
    entityType: 'order',
    entityId: orderId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus }
  });
}

export async function logOrderRefund(orderId, userId, reason = null) {
  await log({
    userId,
    action: ACTIONS.ORDER_REFUNDED,
    entityType: 'order',
    entityId: orderId,
    newValue: { reason }
  });
}

// ============================================
// CONVENIENCE METHODS - TEST ORDERS (TASK 5)
// ============================================

export async function logTestOrderCreated(orderId, userId, orderData) {
  await log({
    userId,
    action: ACTIONS.TEST_ORDER_CREATED,
    entityType: 'order',
    entityId: orderId,
    newValue: {
      orderNumber: orderData.order_number,
      buyer: orderData.buyer_email,
      isTest: true
    }
  });
}

export async function logTestEmailSent(orderId, userId, recipient) {
  await log({
    userId,
    action: ACTIONS.TEST_EMAIL_SENT,
    entityType: 'order',
    entityId: orderId,
    newValue: { recipient, isTest: true }
  });
}

// ============================================
// CONVENIENCE METHODS - EVENTS
// ============================================

export async function logEventCreated(eventId, userId, eventData) {
  await log({
    userId,
    action: ACTIONS.EVENT_CREATED,
    entityType: 'event',
    entityId: eventId,
    newValue: { name: eventData.name, date: eventData.event_date }
  });
}

export async function logEventUpdated(eventId, userId, oldData, newData) {
  await log({
    userId,
    action: ACTIONS.EVENT_UPDATED,
    entityType: 'event',
    entityId: eventId,
    oldValue: oldData,
    newValue: newData
  });
}

export async function logEventStatusChange(eventId, userId, oldStatus, newStatus) {
  await log({
    userId,
    action: ACTIONS.EVENT_STATUS_CHANGE,
    entityType: 'event',
    entityId: eventId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus }
  });
}

// ============================================
// CONVENIENCE METHODS - CHECK-INS
// ============================================

export async function logCheckinSuccess(orderId, userId, orderNumber) {
  await log({
    userId,
    action: ACTIONS.CHECKIN_SUCCESS,
    entityType: 'checkin',
    entityId: orderId,
    newValue: { orderNumber }
  });
}

export async function logCheckinFailed(qrCodeOrNumber, userId, reason) {
  await log({
    userId,
    action: ACTIONS.CHECKIN_FAILED,
    entityType: 'checkin',
    entityId: null,
    newValue: { identifier: qrCodeOrNumber, reason }
  });
}

export async function logCheckinDuplicate(orderId, userId, orderNumber, previousTime) {
  await log({
    userId,
    action: ACTIONS.CHECKIN_DUPLICATE,
    entityType: 'checkin',
    entityId: orderId,
    newValue: { orderNumber, previousCheckinAt: previousTime }
  });
}

// ============================================
// CONVENIENCE METHODS - CLIENTS (TASK 1)
// ============================================

export async function logClientCreated(clientId, userId, clientData) {
  await log({
    userId,
    action: ACTIONS.CLIENT_CREATED,
    entityType: 'client',
    entityId: clientId,
    newValue: { name: clientData.name, email: clientData.email }
  });
}

export async function logClientUpdated(clientId, userId, oldData, newData) {
  await log({
    userId,
    action: ACTIONS.CLIENT_UPDATED,
    entityType: 'client',
    entityId: clientId,
    oldValue: oldData,
    newValue: newData
  });
}

// ============================================
// CONVENIENCE METHODS - FEES (TASK 3)
// ============================================

export async function logFeeChange(clientId, userId, oldFees, newFees) {
  await log({
    userId,
    action: ACTIONS.FEE_UPDATED,
    entityType: 'client',
    entityId: clientId,
    oldValue: oldFees,
    newValue: newFees
  });
}

// ============================================
// CONVENIENCE METHODS - PAYOUTS (TASK 4)
// ============================================

export async function logPayoutCreated(payoutId, userId, payoutData) {
  await log({
    userId,
    action: ACTIONS.PAYOUT_CREATED,
    entityType: 'payout',
    entityId: payoutId,
    newValue: {
      clientId: payoutData.client_id,
      amount: payoutData.amount,
      period: `${payoutData.period_start} to ${payoutData.period_end}`
    }
  });
}

export async function logPayoutCompleted(payoutId, userId, amount, paymentRef) {
  await log({
    userId,
    action: ACTIONS.PAYOUT_COMPLETED,
    entityType: 'payout',
    entityId: payoutId,
    newValue: { amount, paymentReference: paymentRef }
  });
}

export async function logPayoutFailed(payoutId, userId, reason) {
  await log({
    userId,
    action: ACTIONS.PAYOUT_FAILED,
    entityType: 'payout',
    entityId: payoutId,
    newValue: { reason }
  });
}

// ============================================
// CONVENIENCE METHODS - AUTH
// ============================================

export async function logLogin(userId, ipAddress, userAgent) {
  await log({
    userId,
    action: ACTIONS.AUTH_LOGIN,
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent
  });
}

export async function logLogout(userId) {
  await log({
    userId,
    action: ACTIONS.AUTH_LOGOUT,
    entityType: 'user',
    entityId: userId
  });
}

// ============================================
// AUDIT LOG QUERIES
// ============================================

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(filters = {}) {
  const {
    userId,
    action,
    entityType,
    entityId,
    startDate,
    endDate,
    limit = 100,
    offset = 0
  } = filters;
  
  let sql = `
    SELECT al.*, u.email as user_email, u.name as user_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
  `;
  
  const conditions = [];
  const params = [];
  
  if (userId) {
    params.push(userId);
    conditions.push(`al.user_id = $${params.length}`);
  }
  
  if (action) {
    params.push(action);
    conditions.push(`al.action = $${params.length}`);
  }
  
  if (entityType) {
    params.push(entityType);
    conditions.push(`al.entity_type = $${params.length}`);
  }
  
  if (entityId) {
    params.push(entityId);
    conditions.push(`al.entity_id = $${params.length}`);
  }
  
  if (startDate) {
    params.push(startDate);
    conditions.push(`al.created_at >= $${params.length}`);
  }
  
  if (endDate) {
    params.push(endDate);
    conditions.push(`al.created_at <= $${params.length}`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return db.queryAll(sql, params);
}

/**
 * Get audit logs for an entity
 */
export async function getEntityAuditLogs(entityType, entityId, limit = 50) {
  return db.queryAll(
    `SELECT al.*, u.email as user_email, u.name as user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.entity_type = $1 AND al.entity_id = $2
     ORDER BY al.created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );
}

export default {
  ACTIONS,
  log,
  logOrderCreated,
  logOrderStatusChange,
  logOrderRefund,
  logTestOrderCreated,
  logTestEmailSent,
  logEventCreated,
  logEventUpdated,
  logEventStatusChange,
  logCheckinSuccess,
  logCheckinFailed,
  logCheckinDuplicate,
  logClientCreated,
  logClientUpdated,
  logFeeChange,
  logPayoutCreated,
  logPayoutCompleted,
  logPayoutFailed,
  logLogin,
  logLogout,
  getAuditLogs,
  getEntityAuditLogs
};
