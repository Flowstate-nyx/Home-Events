/**
 * Admin Event Routes
 */

import express from 'express';
import * as db from '../../db/pool.js';
import * as auditService from '../../services/audit.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/admin/events
 * List all events (including drafts)
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, includeDeleted } = req.query;
    
    let sql = `
      SELECT e.*,
        COALESCE(json_agg(
          json_build_object(
            'id', t.id,
            'name', t.name,
            'price', t.price,
            'quantity', t.quantity,
            'sold', t.sold,
            'payment_link', t.payment_link,
            'is_active', t.is_active
          ) ORDER BY t.sort_order
        ) FILTER (WHERE t.id IS NOT NULL), '[]') as tiers
      FROM events e
      LEFT JOIN ticket_tiers t ON t.event_id = e.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (!includeDeleted) {
      conditions.push(`e.status != 'deleted'`);
    }
    
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' GROUP BY e.id ORDER BY e.event_date DESC, e.created_at DESC';
    
    const events = await db.queryAll(sql, params);
    
    res.json({
      success: true,
      events: events.map(e => ({
        id: e.id,
        name: e.name,
        location: e.location,
        date: e.event_date,
        time: e.event_time,
        description: e.description,
        type: e.event_type,
        mainArtist: e.main_artist,
        image: e.image_url,
        status: e.status,
        isFeatured: e.is_featured,
        tiers: e.tiers,
        createdAt: e.created_at
      })),
      count: events.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/events
 * Create event
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      name, location, venue, event_date, event_time, description, event_type,
      main_artist, artists, image_url, status, min_age, tiers
    } = req.body;
    
    if (!name || !location || !event_date) {
      return res.status(400).json({
        success: false,
        error: 'Name, location, and date are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const event = await db.transaction(async (client) => {
      // Create event
      const eventResult = await client.query(
        `INSERT INTO events (name, location, venue, event_date, event_time, description, 
                            event_type, main_artist, artists, image_url, status, min_age, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          name, location, venue || null, event_date, event_time || '21:00', description || '',
          event_type || 'party', main_artist || null, artists || [], image_url || null,
          status || 'draft', min_age || 18, req.user.id
        ]
      );
      
      const event = eventResult.rows[0];
      
      // Create tiers
      if (tiers && tiers.length > 0) {
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          await client.query(
            `INSERT INTO ticket_tiers (event_id, name, description, price, quantity, payment_link, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              event.id, tier.name, tier.description || '',
              tier.price, tier.quantity || 100, tier.paymentLink || '', i
            ]
          );
        }
      }
      
      return event;
    });
    
    await auditService.logEventCreate(event.id, req.user.id, { name, location, date: event_date });
    
    logger.info('Event created', { eventId: event.id, name, userId: req.user.id });
    
    res.status(201).json({
      success: true,
      event: { id: event.id, name: event.name },
      message: 'Event created'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/events/:id
 * Update event
 */
router.put('/:id', async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const {
      name, location, venue, event_date, event_time, description, event_type,
      main_artist, artists, image_url, status, min_age, isFeatured, tiers
    } = req.body;
    
    // Get existing event
    const existing = await db.queryOne(
      `SELECT * FROM events WHERE id = $1`,
      [eventId]
    );
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND'
      });
    }
    
    await db.transaction(async (client) => {
      // Update event
      await client.query(
        `UPDATE events SET
          name = COALESCE($1, name),
          location = COALESCE($2, location),
          venue = COALESCE($3, venue),
          event_date = COALESCE($4, event_date),
          event_time = COALESCE($5, event_time),
          description = COALESCE($6, description),
          event_type = COALESCE($7, event_type),
          main_artist = COALESCE($8, main_artist),
          artists = COALESCE($9, artists),
          image_url = COALESCE($10, image_url),
          status = COALESCE($11, status),
          min_age = COALESCE($12, min_age),
          is_featured = COALESCE($13, is_featured)
         WHERE id = $14`,
        [
          name, location, venue, event_date, event_time, description, event_type,
          main_artist, artists, image_url, status, min_age, isFeatured, eventId
        ]
      );
      
      // Update tiers if provided
      if (tiers) {
        const existingTiers = await client.query(
          `SELECT id, sold FROM ticket_tiers WHERE event_id = $1`,
          [eventId]
        );
        const existingMap = new Map(existingTiers.rows.map(t => [t.id, t.sold]));
        
        // Get IDs from incoming tiers
        const incomingIds = new Set(tiers.filter(t => t.id).map(t => t.id));
        
        // Delete tiers that are not in incoming (only if no sales)
        for (const [id, sold] of existingMap) {
          if (!incomingIds.has(id) && sold === 0) {
            await client.query(`DELETE FROM ticket_tiers WHERE id = $1`, [id]);
          }
        }
        
        // Upsert tiers
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          
          if (tier.id && existingMap.has(tier.id)) {
            // Update existing
            await client.query(
              `UPDATE ticket_tiers SET
                name = $1, description = $2, price = $3,
                quantity = GREATEST($4, sold),
                payment_link = $5, sort_order = $6, is_active = $7
               WHERE id = $8`,
              [
                tier.name, tier.description || '', tier.price,
                tier.quantity, tier.paymentLink || '', i, tier.isActive !== false, tier.id
              ]
            );
          } else {
            // Insert new
            await client.query(
              `INSERT INTO ticket_tiers (event_id, name, description, price, quantity, payment_link, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [eventId, tier.name, tier.description || '', tier.price, tier.quantity || 100, tier.paymentLink || '', i]
            );
          }
        }
      }
    });
    
    await auditService.logEventUpdate(eventId, req.user.id, 
      { name: existing.name }, 
      { name: name || existing.name }
    );
    
    logger.info('Event updated', { eventId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Event updated'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/events/:id
 * Soft delete event
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const eventId = req.params.id;
    
    const existing = await db.queryOne(
      `SELECT name FROM events WHERE id = $1`,
      [eventId]
    );
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND'
      });
    }
    
    await db.query(
      `UPDATE events SET status = 'deleted' WHERE id = $1`,
      [eventId]
    );
    
    await auditService.logEventDelete(eventId, req.user.id, { name: existing.name });
    
    logger.info('Event deleted', { eventId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Event deleted'
    });
  } catch (err) {
    next(err);
  }
});

export default router;