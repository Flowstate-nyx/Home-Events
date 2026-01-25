/**
 * Admin Events Routes
 * Event management with multi-tenant support
 * 
 * BACKWARDS COMPATIBILITY:
 * - All existing event routes preserved
 * - Default excludes test events
 * - Existing event creation unchanged
 * 
 * NEW FEATURES:
 * - Event duplication (TASK 8)
 * - Client scoping
 * - Test event filtering
 */

import express from 'express';
import pool from '../../db/pool.js';
import { requireAuth, requireAdmin, scopeToClient } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// All routes require authentication and admin access
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/events
 * List events with filtering
 * BACKWARDS COMPATIBLE: Same response structure
 * ENHANCED: Multi-tenant scoping, test exclusion
 */
router.get('/', scopeToClient, async (req, res, next) => {
  try {
    const {
      status,
      includeTest,
      search,
      limit,
      offset,
      sortBy,
      sortOrder
    } = req.query;
    
    const params = [];
    let paramIndex = 1;
    
    let whereClause = 'WHERE 1=1';
    
    // Exclude test events by default
    if (includeTest !== 'true') {
      whereClause += ` AND (e.is_test = false OR e.is_test IS NULL) AND e.status != 'test'`;
    }
    
    // Client scoping
    if (req.scopedClientId) {
      whereClause += ` AND e.client_id = $${paramIndex}`;
      params.push(req.scopedClientId);
      paramIndex++;
    }
    
    // Status filter
    if (status) {
      whereClause += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    // Search filter
    if (search) {
      whereClause += ` AND (e.name ILIKE $${paramIndex} OR e.venue ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Sorting
    const validSortFields = ['name', 'event_date', 'created_at', 'status'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'event_date';
    const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    const query = `
      SELECT 
        e.*,
        c.name as client_name,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.id END) as paid_orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.quantity ELSE 0 END), 0) as tickets_sold,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.total_price ELSE 0 END), 0) as revenue
      FROM events e
      LEFT JOIN clients c ON e.client_id = c.id
      LEFT JOIN orders o ON e.id = o.event_id
      ${whereClause}
      GROUP BY e.id, c.name
      ORDER BY e.${sortField} ${sortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit) || 100);
    params.push(parseInt(offset) || 0);
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countParams = params.slice(0, -2); // Remove limit/offset
    const countQuery = `
      SELECT COUNT(DISTINCT e.id) as total
      FROM events e
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      success: true,
      events: result.rows.map(e => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        eventDate: e.event_date,
        venue: e.venue,
        status: e.status,
        isTest: e.is_test || false,
        clientId: e.client_id,
        clientName: e.client_name,
        paidOrders: parseInt(e.paid_orders) || 0,
        ticketsSold: parseInt(e.tickets_sold) || 0,
        revenue: parseFloat(e.revenue) || 0,
        createdAt: e.created_at
      })),
      pagination: {
        total: parseInt(countResult.rows[0].total) || 0,
        limit: parseInt(limit) || 100,
        offset: parseInt(offset) || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/events/:id
 * Get single event with full details
 * BACKWARDS COMPATIBLE
 */
router.get('/:id', scopeToClient, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const eventQuery = `
      SELECT 
        e.*,
        c.name as client_name
      FROM events e
      LEFT JOIN clients c ON e.client_id = c.id
      WHERE e.id = $1
    `;
    
    const eventResult = await pool.query(eventQuery, [id]);
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    const event = eventResult.rows[0];
    
    // Check client access
    if (req.scopedClientId && event.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Get tiers
    const tiersQuery = `
      SELECT 
        t.*,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' AND (o.is_test = false OR o.is_test IS NULL) THEN o.quantity ELSE 0 END), 0) as sold
      FROM tiers t
      LEFT JOIN orders o ON t.id = o.tier_id
      WHERE t.event_id = $1
      GROUP BY t.id
      ORDER BY t.price DESC
    `;
    
    const tiersResult = await pool.query(tiersQuery, [id]);
    
    // Get order stats (excluding test)
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN payment_status = 'paid' THEN id END) as paid_orders,
        COUNT(DISTINCT CASE WHEN payment_status = 'pending' THEN id END) as pending_orders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN quantity ELSE 0 END), 0) as tickets_sold,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_price ELSE 0 END), 0) as revenue
      FROM orders
      WHERE event_id = $1
        AND (is_test = false OR is_test IS NULL)
    `;
    
    const statsResult = await pool.query(statsQuery, [id]);
    const stats = statsResult.rows[0];
    
    res.json({
      success: true,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        eventDate: event.event_date,
        venue: event.venue,
        venueAddress: event.venue_address,
        status: event.status,
        isTest: event.is_test || false,
        clientId: event.client_id,
        clientName: event.client_name,
        coverImage: event.cover_image,
        settings: event.settings,
        createdAt: event.created_at
      },
      tiers: tiersResult.rows.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price: parseFloat(t.price) || 0,
        quantity: parseInt(t.quantity) || 0,
        sold: parseInt(t.sold) || 0,
        available: Math.max(0, (parseInt(t.quantity) || 0) - (parseInt(t.sold) || 0)),
        status: t.status,
        sortOrder: t.sort_order
      })),
      stats: {
        paidOrders: parseInt(stats.paid_orders) || 0,
        pendingOrders: parseInt(stats.pending_orders) || 0,
        ticketsSold: parseInt(stats.tickets_sold) || 0,
        revenue: parseFloat(stats.revenue) || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/events
 * Create new event
 * BACKWARDS COMPATIBLE: Same payload structure
 * ENHANCED: Assigns to user's client or specified client
 */
router.post('/', scopeToClient, async (req, res, next) => {
  try {
    const {
      name,
      description,
      eventDate,
      venue,
      venueAddress,
      coverImage,
      status,
      settings,
      tiers
    } = req.body;
    
    if (!name || !eventDate) {
      return res.status(400).json({
        success: false,
        error: 'Name and event date are required'
      });
    }
    
    // Generate slug
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Determine client ID
    const clientId = req.scopedClientId || req.user.client_id;
    
    // Create event
    const eventQuery = `
      INSERT INTO events (
        id, name, slug, description, event_date, venue, venue_address,
        cover_image, status, client_id, settings, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
      )
      RETURNING *
    `;
    
    const eventId = uuidv4();
    const eventResult = await pool.query(eventQuery, [
      eventId,
      name,
      slug,
      description || null,
      eventDate,
      venue || null,
      venueAddress || null,
      coverImage || null,
      status || 'draft',
      clientId,
      settings ? JSON.stringify(settings) : null
    ]);
    
    const event = eventResult.rows[0];
    
    // Create tiers if provided
    let createdTiers = [];
    if (tiers && Array.isArray(tiers) && tiers.length > 0) {
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const tierQuery = `
          INSERT INTO tiers (
            id, event_id, name, description, price, quantity, status, sort_order
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
          )
          RETURNING *
        `;
        
        const tierResult = await pool.query(tierQuery, [
          uuidv4(),
          eventId,
          tier.name,
          tier.description || null,
          tier.price || 0,
          tier.quantity || 0,
          tier.status || 'active',
          tier.sortOrder || i
        ]);
        
        createdTiers.push(tierResult.rows[0]);
      }
    }
    
    logger.info('Event created', {
      eventId: event.id,
      name: event.name,
      clientId,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Event created',
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        eventDate: event.event_date,
        status: event.status
      },
      tiers: createdTiers.map(t => ({
        id: t.id,
        name: t.name,
        price: parseFloat(t.price) || 0,
        quantity: parseInt(t.quantity) || 0
      }))
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'An event with this slug already exists'
      });
    }
    next(err);
  }
});

/**
 * PUT /api/admin/events/:id
 * Update event
 * BACKWARDS COMPATIBLE
 */
router.put('/:id', scopeToClient, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check event exists and access
    const checkQuery = `SELECT * FROM events WHERE id = $1`;
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    const existingEvent = checkResult.rows[0];
    
    if (req.scopedClientId && existingEvent.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Build update query dynamically
    const allowedFields = [
      'name', 'description', 'event_date', 'venue', 'venue_address',
      'cover_image', 'status', 'settings'
    ];
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(req.body)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey) && value !== undefined) {
        updates.push(`${snakeKey} = $${paramIndex}`);
        values.push(snakeKey === 'settings' && value ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }
    
    values.push(id);
    const updateQuery = `
      UPDATE events 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, values);
    const event = result.rows[0];
    
    logger.info('Event updated', {
      eventId: event.id,
      updates: Object.keys(req.body),
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Event updated',
      event: {
        id: event.id,
        name: event.name,
        status: event.status
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/events/:id/duplicate
 * Duplicate an event with its tiers
 * NEW FEATURE: TASK 8 - Event duplication
 */
router.post('/:id/duplicate', scopeToClient, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      name: newName,
      eventDate: newDate,
      status: newStatus = 'draft'
    } = req.body;
    
    // Get original event
    const eventQuery = `SELECT * FROM events WHERE id = $1`;
    const eventResult = await pool.query(eventQuery, [id]);
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    const original = eventResult.rows[0];
    
    // Check client access
    if (req.scopedClientId && original.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Generate new name and slug
    const duplicateName = newName || `${original.name} (Copy)`;
    const baseSlug = duplicateName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Ensure unique slug
    let slug = baseSlug;
    let slugAttempt = 0;
    while (true) {
      const slugCheck = await pool.query(
        'SELECT id FROM events WHERE slug = $1',
        [slug]
      );
      if (slugCheck.rows.length === 0) break;
      slugAttempt++;
      slug = `${baseSlug}-${slugAttempt}`;
    }
    
    // Create duplicate event
    const newEventId = uuidv4();
    const createQuery = `
      INSERT INTO events (
        id, name, slug, description, event_date, venue, venue_address,
        cover_image, status, client_id, settings, is_test, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, NOW()
      )
      RETURNING *
    `;
    
    const newEventResult = await pool.query(createQuery, [
      newEventId,
      duplicateName,
      slug,
      original.description,
      newDate || original.event_date,
      original.venue,
      original.venue_address,
      original.cover_image,
      newStatus,
      original.client_id,
      original.settings
    ]);
    
    const newEvent = newEventResult.rows[0];
    
    // Get and duplicate tiers
    const tiersQuery = `SELECT * FROM tiers WHERE event_id = $1 ORDER BY sort_order`;
    const tiersResult = await pool.query(tiersQuery, [id]);
    
    const newTiers = [];
    for (const tier of tiersResult.rows) {
      const newTierId = uuidv4();
      const tierCreateQuery = `
        INSERT INTO tiers (
          id, event_id, name, description, price, quantity, status, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        RETURNING *
      `;
      
      const newTierResult = await pool.query(tierCreateQuery, [
        newTierId,
        newEventId,
        tier.name,
        tier.description,
        tier.price,
        tier.quantity, // Reset to original capacity
        tier.status,
        tier.sort_order
      ]);
      
      newTiers.push(newTierResult.rows[0]);
    }
    
    logger.info('Event duplicated', {
      originalEventId: id,
      newEventId: newEvent.id,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Event duplicated',
      event: {
        id: newEvent.id,
        name: newEvent.name,
        slug: newEvent.slug,
        eventDate: newEvent.event_date,
        status: newEvent.status
      },
      tiers: newTiers.map(t => ({
        id: t.id,
        name: t.name,
        price: parseFloat(t.price) || 0,
        quantity: parseInt(t.quantity) || 0
      }))
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/events/:id
 * Delete event (soft delete by setting status)
 * BACKWARDS COMPATIBLE
 */
router.delete('/:id', scopeToClient, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check event exists and access
    const checkQuery = `SELECT * FROM events WHERE id = $1`;
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    const event = checkResult.rows[0];
    
    if (req.scopedClientId && event.client_id !== req.scopedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Check for paid orders
    const ordersQuery = `
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE event_id = $1 AND payment_status = 'paid' AND (is_test = false OR is_test IS NULL)
    `;
    const ordersResult = await pool.query(ordersQuery, [id]);
    
    if (parseInt(ordersResult.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete event with paid orders. Set status to cancelled instead.'
      });
    }
    
    // Soft delete - set status to deleted
    const deleteQuery = `
      UPDATE events 
      SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
    `;
    await pool.query(deleteQuery, [id]);
    
    logger.info('Event deleted', {
      eventId: id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Event deleted'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
