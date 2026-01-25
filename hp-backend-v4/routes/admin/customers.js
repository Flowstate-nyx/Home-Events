/**
 * Admin Customer Routes
 * CRM / Customer Database
 * 
 * TASK 7: CRM / Customer Database
 * - Customers derived from orders
 * - Test customers flagged separately
 * - Tier progression tracking
 * 
 * BACKWARDS COMPATIBILITY:
 * - All routes are NEW (no existing customer routes)
 * - Default queries exclude test customers
 */

import express from 'express';
import * as customerService from '../../services/customer.js';
import { requireAuth, requireAdmin, scopeToClient } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// All routes require authentication and admin access
router.use(requireAuth, requireAdmin, scopeToClient);

/**
 * GET /api/admin/customers
 * List customers with filtering and pagination
 * Default excludes test customers
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      search,
      tier,
      includeTest,
      limit,
      offset,
      sortBy,
      sortOrder
    } = req.query;
    
    const customers = await customerService.listCustomers({
      clientId: req.scopedClientId,
      search,
      tier,
      includeTest: includeTest === 'true',
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      sortBy: sortBy || 'created_at',
      sortOrder: sortOrder || 'desc'
    });
    
    // Get total count for pagination
    const total = await customerService.countCustomers({
      clientId: req.scopedClientId,
      search,
      tier,
      includeTest: includeTest === 'true'
    });
    
    res.json({
      success: true,
      customers: customers.map(c => ({
        id: c.id,
        email: c.email,
        name: c.name,
        phone: c.phone,
        tier: c.tier,
        totalOrders: parseInt(c.total_orders) || 0,
        totalSpent: parseFloat(c.total_spent) || 0,
        firstOrderAt: c.first_order_at,
        lastOrderAt: c.last_order_at,
        isTestCustomer: c.is_test_customer,
        tags: c.tags || [],
        createdAt: c.created_at
      })),
      pagination: {
        total,
        limit: parseInt(limit) || 100,
        offset: parseInt(offset) || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/customers/stats
 * Customer statistics overview
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await customerService.getCustomerStats({
      clientId: req.scopedClientId
    });
    
    res.json({
      success: true,
      stats: {
        totalCustomers: parseInt(stats.total_customers) || 0,
        activeCustomers: parseInt(stats.active_customers) || 0,
        newThisMonth: parseInt(stats.new_this_month) || 0,
        tierBreakdown: {
          bronze: parseInt(stats.tier_bronze) || 0,
          silver: parseInt(stats.tier_silver) || 0,
          gold: parseInt(stats.tier_gold) || 0,
          platinum: parseInt(stats.tier_platinum) || 0,
          vip: parseInt(stats.tier_vip) || 0
        },
        averageOrderValue: parseFloat(stats.avg_order_value) || 0,
        totalRevenue: parseFloat(stats.total_revenue) || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/customers/export
 * Export customers as CSV
 */
router.get('/export', async (req, res, next) => {
  try {
    const { includeTest } = req.query;
    
    const customers = await customerService.listCustomers({
      clientId: req.scopedClientId,
      includeTest: includeTest === 'true',
      limit: 10000, // Max export
      offset: 0
    });
    
    // Build CSV
    const headers = [
      'Email',
      'Name',
      'Phone',
      'Tier',
      'Total Orders',
      'Total Spent',
      'First Order',
      'Last Order',
      'Test Customer',
      'Created At'
    ];
    
    const rows = customers.map(c => [
      c.email,
      c.name || '',
      c.phone || '',
      c.tier,
      c.total_orders,
      c.total_spent,
      c.first_order_at ? new Date(c.first_order_at).toISOString() : '',
      c.last_order_at ? new Date(c.last_order_at).toISOString() : '',
      c.is_test_customer ? 'Yes' : 'No',
      new Date(c.created_at).toISOString()
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => 
        typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))
          ? `"${cell.replace(/"/g, '""')}"`
          : cell
      ).join(','))
    ].join('\n');
    
    const filename = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/customers/:id
 * Get single customer with full details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }
    
    // Check client access
    if (req.scopedClientId && customer.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Get customer's orders
    const orders = await customerService.getCustomerOrders(customer.id, {
      limit: 50
    });
    
    res.json({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        tier: customer.tier,
        totalOrders: parseInt(customer.total_orders) || 0,
        totalSpent: parseFloat(customer.total_spent) || 0,
        firstOrderAt: customer.first_order_at,
        lastOrderAt: customer.last_order_at,
        isTestCustomer: customer.is_test_customer,
        notes: customer.notes,
        tags: customer.tags || [],
        metadata: customer.metadata || {},
        createdAt: customer.created_at
      },
      orders: orders.map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        eventName: o.event_name,
        tierName: o.tier_name,
        quantity: o.quantity,
        totalPrice: parseFloat(o.total_price) || 0,
        paymentStatus: o.payment_status,
        isTest: o.is_test,
        createdAt: o.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/customers/:id
 * Update customer details (notes, tags, metadata)
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { name, phone, notes, tags, metadata } = req.body;
    
    const customer = await customerService.getCustomerById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }
    
    // Check client access
    if (req.scopedClientId && customer.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;
    if (metadata !== undefined) updates.metadata = metadata;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }
    
    const updated = await customerService.updateCustomer(customer.id, updates);
    
    logger.info('Customer updated', {
      customerId: customer.id,
      updates: Object.keys(updates),
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Customer updated',
      customer: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        notes: updated.notes,
        tags: updated.tags
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/customers/:id/recalculate
 * Recalculate customer stats from orders
 */
router.post('/:id/recalculate', async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }
    
    // Check client access
    if (req.scopedClientId && customer.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const updated = await customerService.recalculateCustomerStats(customer.id);
    
    logger.info('Customer stats recalculated', {
      customerId: customer.id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Customer stats recalculated',
      customer: {
        id: updated.id,
        totalOrders: parseInt(updated.total_orders) || 0,
        totalSpent: parseFloat(updated.total_spent) || 0,
        tier: updated.tier
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/customers/:id/timeline
 * Get customer activity timeline
 */
router.get('/:id/timeline', async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }
    
    // Check client access
    if (req.scopedClientId && customer.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const timeline = await customerService.getCustomerTimeline(customer.id);
    
    res.json({
      success: true,
      timeline
    });
  } catch (err) {
    next(err);
  }
});

export default router;
