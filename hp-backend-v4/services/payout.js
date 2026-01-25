/**
 * Payout Service
 * Manual payout tracking for client revenue splits
 * 
 * TASK 4: Payout Tracking (Manual)
 * - No automatic money movement
 * - Admin records payouts manually
 * - Full audit trail
 */

import * as db from '../db/pool.js';
import * as clientService from './client.js';
import logger from '../utils/logger.js';

// ============================================
// PAYOUT CALCULATIONS
// ============================================

/**
 * Calculate payout summary for a client and period
 * @param {UUID} clientId - Client ID
 * @param {Date} periodStart - Start of period
 * @param {Date} periodEnd - End of period
 */
export async function calculatePayoutSummary(clientId, periodStart, periodEnd) {
  const result = await db.queryOne(
    `SELECT 
      COUNT(o.id) as order_count,
      COALESCE(SUM(o.total_price), 0) as gross_revenue,
      COALESCE(SUM(o.platform_fee_amount), 0) as platform_fees,
      COALESCE(SUM(o.client_revenue), 0) as net_payout
    FROM orders o
    JOIN events e ON e.id = o.event_id
    WHERE e.client_id = $1 
      AND o.status = 'paid'
      AND o.is_test = false
      AND o.payment_confirmed_at >= $2
      AND o.payment_confirmed_at <= $3`,
    [clientId, periodStart, periodEnd]
  );
  
  return {
    clientId,
    periodStart,
    periodEnd,
    orderCount: parseInt(result.order_count) || 0,
    grossRevenue: parseFloat(result.gross_revenue) || 0,
    platformFees: parseFloat(result.platform_fees) || 0,
    netPayout: parseFloat(result.net_payout) || 0
  };
}

// ============================================
// PAYOUT CRUD
// ============================================

/**
 * Create payout record
 * @param {Object} payoutData - Payout details
 * @param {UUID} createdBy - User creating the record
 */
export async function createPayout(payoutData, createdBy = null) {
  const {
    clientId,
    periodStart,
    periodEnd,
    paymentMethod,
    paymentReference,
    paymentNotes
  } = payoutData;
  
  // Validate client exists
  const client = await clientService.getClientById(clientId);
  if (!client) {
    throw new Error('CLIENT_NOT_FOUND');
  }
  
  // Calculate amounts from orders
  const summary = await calculatePayoutSummary(clientId, periodStart, periodEnd);
  
  if (summary.orderCount === 0) {
    throw new Error('NO_ORDERS_IN_PERIOD');
  }
  
  // Check for overlapping payouts
  const existing = await db.queryOne(
    `SELECT id FROM payouts 
     WHERE client_id = $1 
     AND status != 'failed'
     AND (
       (period_start <= $2 AND period_end >= $2)
       OR (period_start <= $3 AND period_end >= $3)
       OR (period_start >= $2 AND period_end <= $3)
     )`,
    [clientId, periodStart, periodEnd]
  );
  
  if (existing) {
    throw new Error('OVERLAPPING_PAYOUT_EXISTS');
  }
  
  const result = await db.queryOne(
    `INSERT INTO payouts (
      client_id,
      amount, currency,
      period_start, period_end,
      gross_revenue, platform_fees, net_payout, order_count,
      payment_method, payment_reference, payment_notes,
      status, created_by
    ) VALUES ($1, $2, 'USD', $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12)
    RETURNING *`,
    [
      clientId,
      summary.netPayout,
      periodStart, periodEnd,
      summary.grossRevenue, summary.platformFees, summary.netPayout, summary.orderCount,
      paymentMethod || null, paymentReference || null, paymentNotes || null,
      createdBy
    ]
  );
  
  logger.info('Payout created', {
    payoutId: result.id,
    clientId,
    amount: summary.netPayout,
    orderCount: summary.orderCount
  });
  
  return result;
}

/**
 * Get payout by ID
 */
export async function getPayoutById(payoutId) {
  return db.queryOne(
    `SELECT p.*, c.name as client_name, c.email as client_email
     FROM payouts p
     JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1`,
    [payoutId]
  );
}

/**
 * List payouts with filters
 */
export async function listPayouts(filters = {}) {
  const { clientId, status, limit = 100, offset = 0 } = filters;
  
  let sql = `
    SELECT p.*, c.name as client_name, c.email as client_email
    FROM payouts p
    JOIN clients c ON c.id = p.client_id
  `;
  
  const conditions = [];
  const params = [];
  
  if (clientId) {
    params.push(clientId);
    conditions.push(`p.client_id = $${params.length}`);
  }
  
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return db.queryAll(sql, params);
}

// ============================================
// PAYOUT PROCESSING
// ============================================

/**
 * Mark payout as processing
 */
export async function markPayoutProcessing(payoutId, processedBy = null) {
  const payout = await getPayoutById(payoutId);
  
  if (!payout) {
    throw new Error('PAYOUT_NOT_FOUND');
  }
  
  if (payout.status !== 'pending') {
    throw new Error('PAYOUT_NOT_PENDING');
  }
  
  await db.query(
    `UPDATE payouts SET
      status = 'processing',
      processed_by = $2,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [payoutId, processedBy]
  );
  
  logger.info('Payout processing', { payoutId, processedBy });
  
  return getPayoutById(payoutId);
}

/**
 * Mark payout as completed
 */
export async function completePayment(payoutId, paymentInfo, processedBy = null) {
  const { paymentMethod, paymentReference, paymentNotes } = paymentInfo;
  
  const payout = await getPayoutById(payoutId);
  
  if (!payout) {
    throw new Error('PAYOUT_NOT_FOUND');
  }
  
  if (payout.status === 'completed') {
    throw new Error('PAYOUT_ALREADY_COMPLETED');
  }
  
  if (payout.status !== 'pending' && payout.status !== 'processing') {
    throw new Error('PAYOUT_CANNOT_COMPLETE');
  }
  
  await db.query(
    `UPDATE payouts SET
      status = 'completed',
      payment_method = COALESCE($2, payment_method),
      payment_reference = COALESCE($3, payment_reference),
      payment_notes = COALESCE($4, payment_notes),
      processed_by = $5,
      processed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [payoutId, paymentMethod, paymentReference, paymentNotes, processedBy]
  );
  
  logger.info('Payout completed', {
    payoutId,
    amount: payout.amount,
    processedBy
  });
  
  return getPayoutById(payoutId);
}

/**
 * Mark payout as failed
 */
export async function failPayout(payoutId, reason, processedBy = null) {
  const payout = await getPayoutById(payoutId);
  
  if (!payout) {
    throw new Error('PAYOUT_NOT_FOUND');
  }
  
  if (payout.status === 'completed') {
    throw new Error('PAYOUT_ALREADY_COMPLETED');
  }
  
  await db.query(
    `UPDATE payouts SET
      status = 'failed',
      payment_notes = $2,
      processed_by = $3,
      processed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [payoutId, reason, processedBy]
  );
  
  logger.info('Payout failed', { payoutId, reason, processedBy });
  
  return getPayoutById(payoutId);
}

// ============================================
// PAYOUT REPORTS
// ============================================

/**
 * Get unpaid revenue for a client
 */
export async function getUnpaidRevenue(clientId) {
  // Get last completed payout date
  const lastPayout = await db.queryOne(
    `SELECT period_end FROM payouts 
     WHERE client_id = $1 AND status = 'completed'
     ORDER BY period_end DESC LIMIT 1`,
    [clientId]
  );
  
  const startDate = lastPayout ? lastPayout.period_end : new Date('2020-01-01');
  const endDate = new Date();
  
  return calculatePayoutSummary(clientId, startDate, endDate);
}

/**
 * Get payout summary across all clients
 */
export async function getPlatformPayoutSummary() {
  const result = await db.queryOne(
    `SELECT 
      COUNT(DISTINCT client_id) as clients_with_payouts,
      COUNT(*) as total_payouts,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as completed_amount,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
    FROM payouts`
  );
  
  return {
    clientsWithPayouts: parseInt(result.clients_with_payouts) || 0,
    totalPayouts: parseInt(result.total_payouts) || 0,
    pendingAmount: parseFloat(result.pending_amount) || 0,
    completedAmount: parseFloat(result.completed_amount) || 0,
    pendingCount: parseInt(result.pending_count) || 0,
    completedCount: parseInt(result.completed_count) || 0
  };
}

export default {
  calculatePayoutSummary,
  createPayout,
  getPayoutById,
  listPayouts,
  markPayoutProcessing,
  completePayment,
  failPayout,
  getUnpaidRevenue,
  getPlatformPayoutSummary
};
