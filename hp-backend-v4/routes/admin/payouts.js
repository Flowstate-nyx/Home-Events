/**
 * Admin Payout Routes
 * Manual payout tracking (NO automatic money movement)
 * 
 * TASK 4: Payout Tracking (Manual)
 * - Track payouts to clients
 * - Calculate unpaid revenue
 * - Record payment completion
 * 
 * BACKWARDS COMPATIBILITY:
 * - All routes are NEW (no existing payout routes)
 * - No impact on existing payment flow
 */

import express from 'express';
import * as payoutService from '../../services/payout.js';
import * as auditService from '../../services/audit.js';
import { requireAuth, requirePlatformAdmin, scopeToClient } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// ============================================
// CLIENT & PLATFORM ADMIN ROUTES
// View payouts for own client
// ============================================

/**
 * GET /api/admin/payouts
 * List payouts (scoped by client for non-platform admins)
 */
router.get('/', scopeToClient, async (req, res, next) => {
  try {
    const {
      status,
      startDate,
      endDate,
      limit,
      offset
    } = req.query;
    
    const payouts = await payoutService.listPayouts({
      clientId: req.scopedClientId,
      status,
      startDate,
      endDate,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    
    res.json({
      success: true,
      payouts: payouts.map(p => ({
        id: p.id,
        clientId: p.client_id,
        clientName: p.client_name,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        totalOrders: parseInt(p.total_orders) || 0,
        grossAmount: parseFloat(p.gross_amount) || 0,
        platformFees: parseFloat(p.platform_fees) || 0,
        netAmount: parseFloat(p.net_amount) || 0,
        status: p.status,
        paymentMethod: p.payment_method,
        paymentReference: p.payment_reference,
        paidAt: p.paid_at,
        notes: p.notes,
        createdBy: p.created_by_name,
        createdAt: p.created_at
      })),
      count: payouts.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/payouts/summary
 * Get payout summary for a client
 */
router.get('/summary', scopeToClient, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Non-platform admins must have a client_id
    if (!req.scopedClientId && !req.user.is_platform_admin) {
      return res.status(400).json({
        success: false,
        error: 'Client ID required'
      });
    }
    
    const summary = await payoutService.calculatePayoutSummary({
      clientId: req.scopedClientId,
      startDate,
      endDate
    });
    
    res.json({
      success: true,
      summary: {
        periodStart: summary.period_start,
        periodEnd: summary.period_end,
        totalOrders: parseInt(summary.total_orders) || 0,
        grossAmount: parseFloat(summary.gross_amount) || 0,
        platformFees: parseFloat(summary.platform_fees) || 0,
        netAmount: parseFloat(summary.net_amount) || 0,
        ticketsSold: parseInt(summary.tickets_sold) || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/payouts/unpaid
 * Get unpaid revenue for a client
 */
router.get('/unpaid', scopeToClient, async (req, res, next) => {
  try {
    if (!req.scopedClientId && !req.user.is_platform_admin) {
      return res.status(400).json({
        success: false,
        error: 'Client ID required'
      });
    }
    
    const unpaid = await payoutService.getUnpaidRevenue(req.scopedClientId);
    
    res.json({
      success: true,
      unpaid: {
        sinceDate: unpaid.since_date,
        totalOrders: parseInt(unpaid.total_orders) || 0,
        grossAmount: parseFloat(unpaid.gross_amount) || 0,
        platformFees: parseFloat(unpaid.platform_fees) || 0,
        netAmount: parseFloat(unpaid.net_amount) || 0,
        lastPayoutDate: unpaid.last_payout_date
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/payouts/:id
 * Get single payout details
 */
router.get('/:id', scopeToClient, async (req, res, next) => {
  try {
    const payout = await payoutService.getPayoutById(req.params.id);
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: 'Payout not found'
      });
    }
    
    // Check client access
    if (req.scopedClientId && payout.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Get orders included in this payout
    const orders = await payoutService.getPayoutOrders(payout.id);
    
    res.json({
      success: true,
      payout: {
        id: payout.id,
        clientId: payout.client_id,
        clientName: payout.client_name,
        periodStart: payout.period_start,
        periodEnd: payout.period_end,
        totalOrders: parseInt(payout.total_orders) || 0,
        grossAmount: parseFloat(payout.gross_amount) || 0,
        platformFees: parseFloat(payout.platform_fees) || 0,
        netAmount: parseFloat(payout.net_amount) || 0,
        status: payout.status,
        paymentMethod: payout.payment_method,
        paymentReference: payout.payment_reference,
        paidAt: payout.paid_at,
        notes: payout.notes,
        failureReason: payout.failure_reason,
        createdBy: payout.created_by_name,
        createdAt: payout.created_at
      },
      orders: orders.map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        eventName: o.event_name,
        totalPrice: parseFloat(o.total_price) || 0,
        platformFee: parseFloat(o.platform_fee_amount) || 0,
        clientRevenue: parseFloat(o.client_revenue) || 0,
        createdAt: o.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// PLATFORM ADMIN ONLY ROUTES
// Create and manage payouts
// ============================================

/**
 * POST /api/admin/payouts
 * Create a new payout record (platform admin only)
 */
router.post('/', requirePlatformAdmin, async (req, res, next) => {
  try {
    const {
      clientId,
      periodStart,
      periodEnd,
      paymentMethod,
      notes
    } = req.body;
    
    if (!clientId || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'Client ID, period start, and period end are required'
      });
    }
    
    const payout = await payoutService.createPayout({
      clientId,
      periodStart,
      periodEnd,
      paymentMethod,
      notes,
      createdBy: req.user.id
    });
    
    await auditService.logPayoutCreated(payout.id, req.user.id, {
      clientId,
      periodStart,
      periodEnd,
      netAmount: payout.net_amount
    });
    
    logger.info('Payout created', {
      payoutId: payout.id,
      clientId,
      netAmount: payout.net_amount,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Payout created',
      payout: {
        id: payout.id,
        periodStart: payout.period_start,
        periodEnd: payout.period_end,
        totalOrders: parseInt(payout.total_orders) || 0,
        grossAmount: parseFloat(payout.gross_amount) || 0,
        platformFees: parseFloat(payout.platform_fees) || 0,
        netAmount: parseFloat(payout.net_amount) || 0,
        status: payout.status
      }
    });
  } catch (err) {
    if (err.message === 'OVERLAPPING_PAYOUT_PERIOD') {
      return res.status(400).json({
        success: false,
        error: 'A payout already exists for part of this period'
      });
    }
    if (err.message === 'NO_ORDERS_IN_PERIOD') {
      return res.status(400).json({
        success: false,
        error: 'No paid orders found in this period'
      });
    }
    if (err.message === 'CLIENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/payouts/:id/processing
 * Mark payout as processing (platform admin only)
 */
router.put('/:id/processing', requirePlatformAdmin, async (req, res, next) => {
  try {
    const { paymentMethod, notes } = req.body;
    
    const payout = await payoutService.markPayoutProcessing(req.params.id, {
      paymentMethod,
      notes
    });
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: 'Payout not found'
      });
    }
    
    logger.info('Payout marked processing', {
      payoutId: payout.id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Payout marked as processing',
      payout: {
        id: payout.id,
        status: payout.status,
        paymentMethod: payout.payment_method
      }
    });
  } catch (err) {
    if (err.message === 'INVALID_PAYOUT_STATUS') {
      return res.status(400).json({
        success: false,
        error: 'Payout must be pending to mark as processing'
      });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/payouts/:id/complete
 * Mark payout as completed (platform admin only)
 */
router.put('/:id/complete', requirePlatformAdmin, async (req, res, next) => {
  try {
    const { paymentReference, notes } = req.body;
    
    if (!paymentReference) {
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required'
      });
    }
    
    const payout = await payoutService.completePayment(req.params.id, {
      paymentReference,
      notes
    });
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: 'Payout not found'
      });
    }
    
    await auditService.logPayoutCompleted(payout.id, req.user.id, {
      paymentReference,
      netAmount: payout.net_amount
    });
    
    logger.info('Payout completed', {
      payoutId: payout.id,
      paymentReference,
      netAmount: payout.net_amount,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Payout completed',
      payout: {
        id: payout.id,
        status: payout.status,
        paymentReference: payout.payment_reference,
        paidAt: payout.paid_at
      }
    });
  } catch (err) {
    if (err.message === 'INVALID_PAYOUT_STATUS') {
      return res.status(400).json({
        success: false,
        error: 'Payout must be pending or processing to complete'
      });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/payouts/:id/fail
 * Mark payout as failed (platform admin only)
 */
router.put('/:id/fail', requirePlatformAdmin, async (req, res, next) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Failure reason is required'
      });
    }
    
    const payout = await payoutService.failPayout(req.params.id, reason);
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: 'Payout not found'
      });
    }
    
    await auditService.logPayoutFailed(payout.id, req.user.id, reason);
    
    logger.info('Payout failed', {
      payoutId: payout.id,
      reason,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Payout marked as failed',
      payout: {
        id: payout.id,
        status: payout.status,
        failureReason: payout.failure_reason
      }
    });
  } catch (err) {
    if (err.message === 'INVALID_PAYOUT_STATUS') {
      return res.status(400).json({
        success: false,
        error: 'Payout must be pending or processing to mark as failed'
      });
    }
    next(err);
  }
});

/**
 * DELETE /api/admin/payouts/:id
 * Cancel/delete a pending payout (platform admin only)
 */
router.delete('/:id', requirePlatformAdmin, async (req, res, next) => {
  try {
    const payout = await payoutService.getPayoutById(req.params.id);
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: 'Payout not found'
      });
    }
    
    if (payout.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Only pending payouts can be deleted'
      });
    }
    
    await payoutService.deletePayout(req.params.id);
    
    logger.info('Payout deleted', {
      payoutId: payout.id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Payout deleted'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
