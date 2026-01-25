/**
 * Admin Client Routes
 * Multi-tenant client (promoter/organizer) management
 * 
 * TASK 1: Multi-Tenant SaaS Foundation
 * - Create/update clients
 * - Client code management
 * - Fee configuration
 */

import express from 'express';
import * as clientService from '../../services/client.js';
import * as auditService from '../../services/audit.js';
import { requirePlatformAdmin } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ============================================
// PLATFORM ADMIN ONLY ROUTES
// ============================================

/**
 * GET /api/admin/clients
 * List all clients (platform admin only)
 */
router.get('/', requirePlatformAdmin, async (req, res, next) => {
  try {
    const { status, search, limit, offset } = req.query;
    
    const clients = await clientService.listClients({
      status,
      search,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    
    res.json({
      success: true,
      clients: clients.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        clientCode: c.client_code,
        email: c.email,
        phone: c.phone,
        website: c.website,
        logoUrl: c.logo_url,
        brandColor: c.brand_color,
        platformFeePercent: parseFloat(c.platform_fee_percent),
        platformFeeFixed: parseFloat(c.platform_fee_fixed),
        status: c.status,
        isPlatformClient: c.is_platform_client,
        createdAt: c.created_at
      })),
      count: clients.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/clients
 * Create new client (platform admin only)
 */
router.post('/', requirePlatformAdmin, async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      website,
      logoUrl,
      brandColor,
      platformFeePercent,
      platformFeeFixed,
      settings
    } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }
    
    const client = await clientService.createClient({
      name,
      email,
      phone,
      website,
      logoUrl,
      brandColor,
      platformFeePercent: parseFloat(platformFeePercent) || 5.0,
      platformFeeFixed: parseFloat(platformFeeFixed) || 0,
      settings
    });
    
    await auditService.logClientCreated(client.id, req.user.id, client);
    
    logger.info('Client created', {
      clientId: client.id,
      name: client.name,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Client created',
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        clientCode: client.client_code,
        email: client.email,
        platformFeePercent: parseFloat(client.platform_fee_percent),
        platformFeeFixed: parseFloat(client.platform_fee_fixed)
      }
    });
  } catch (err) {
    if (err.message === 'CLIENT_NAME_EMAIL_REQUIRED') {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'A client with this email or name already exists'
      });
    }
    next(err);
  }
});

/**
 * GET /api/admin/clients/:id
 * Get client by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const client = await clientService.getClientById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }
    
    // Check access (platform admin or same client)
    if (!req.user.is_platform_admin && req.user.client_id !== client.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Get revenue summary
    const revenue = await clientService.getClientRevenue(client.id);
    
    res.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        clientCode: client.client_code,
        email: client.email,
        phone: client.phone,
        website: client.website,
        logoUrl: client.logo_url,
        brandColor: client.brand_color,
        platformFeePercent: parseFloat(client.platform_fee_percent),
        platformFeeFixed: parseFloat(client.platform_fee_fixed),
        status: client.status,
        isPlatformClient: client.is_platform_client,
        settings: client.settings,
        createdAt: client.created_at
      },
      revenue: {
        totalOrders: parseInt(revenue.total_orders) || 0,
        grossRevenue: parseFloat(revenue.gross_revenue) || 0,
        platformFees: parseFloat(revenue.platform_fees) || 0,
        netRevenue: parseFloat(revenue.net_revenue) || 0,
        uniqueCustomers: parseInt(revenue.unique_customers) || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/clients/:id
 * Update client (platform admin only)
 */
router.put('/:id', requirePlatformAdmin, async (req, res, next) => {
  try {
    const clientId = req.params.id;
    
    const existingClient = await clientService.getClientById(clientId);
    if (!existingClient) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }
    
    const updates = {};
    const allowedFields = [
      'name', 'email', 'phone', 'website',
      'logoUrl', 'brandColor', 'settings', 'status'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }
    
    const client = await clientService.updateClient(clientId, updates);
    
    await auditService.logClientUpdated(clientId, req.user.id, 
      { name: existingClient.name }, 
      { name: client.name, ...updates }
    );
    
    res.json({
      success: true,
      message: 'Client updated',
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        status: client.status
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/clients/:id/fees
 * Update client platform fees (platform admin only)
 */
router.put('/:id/fees', requirePlatformAdmin, async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const { platformFeePercent, platformFeeFixed } = req.body;
    
    const existingClient = await clientService.getClientById(clientId);
    if (!existingClient) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }
    
    const oldFees = {
      percent: parseFloat(existingClient.platform_fee_percent),
      fixed: parseFloat(existingClient.platform_fee_fixed)
    };
    
    const client = await clientService.updatePlatformFees(
      clientId,
      parseFloat(platformFeePercent),
      parseFloat(platformFeeFixed),
      req.user.id
    );
    
    const newFees = {
      percent: parseFloat(client.platform_fee_percent),
      fixed: parseFloat(client.platform_fee_fixed)
    };
    
    await auditService.logFeeChange(clientId, req.user.id, oldFees, newFees);
    
    logger.info('Platform fees updated', {
      clientId,
      oldFees,
      newFees,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Platform fees updated',
      fees: newFees
    });
  } catch (err) {
    if (err.message === 'INVALID_FEE_PERCENT') {
      return res.status(400).json({
        success: false,
        error: 'Fee percentage must be between 0 and 50'
      });
    }
    if (err.message === 'INVALID_FEE_FIXED') {
      return res.status(400).json({
        success: false,
        error: 'Fixed fee must be 0 or greater'
      });
    }
    next(err);
  }
});

/**
 * GET /api/admin/clients/:id/events
 * Get client events
 */
router.get('/:id/events', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    
    // Check access
    if (!req.user.is_platform_admin && req.user.client_id !== clientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const events = await clientService.getClientEvents(clientId);
    
    res.json({
      success: true,
      events: events.map(e => ({
        id: e.id,
        name: e.name,
        eventDate: e.event_date,
        status: e.status,
        paidOrders: parseInt(e.paid_orders) || 0,
        ticketsSold: parseInt(e.tickets_sold) || 0,
        totalRevenue: parseFloat(e.total_revenue) || 0
      })),
      count: events.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/clients/validate-code
 * Validate client code (for signup)
 */
router.post('/validate-code', async (req, res, next) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Client code is required'
      });
    }
    
    const result = await clientService.validateClientCode(code);
    
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: result.error === 'CLIENT_INACTIVE' 
          ? 'This client code is no longer active'
          : 'Invalid client code'
      });
    }
    
    res.json({
      success: true,
      client: result.client
    });
  } catch (err) {
    next(err);
  }
});

export default router;
