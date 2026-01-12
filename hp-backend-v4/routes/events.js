/**
 * Public Event Routes
 */

import express from 'express';
import * as db from '../db/pool.js';

const router = express.Router();

/**
 * Format event for API response
 */
function formatEvent(event) {
  return {
    id: event.id,
    name: event.name,
    slug: event.slug,
    location: event.location,
    venue: event.venue,
    date: event.date,
    time: event.event_time,
    description: event.description,
    type: event.event_type,
    mainArtist: event.main_artist,
    artists: event.artists || [],
    image: event.image_url,
    minAge: event.min_age,
    status: event.status,
    isFeatured: event.is_featured,
    tiers: (event.tiers || []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: parseFloat(t.price),
      quantity: t.quantity,
      sold: t.sold,
      available: t.quantity - t.sold,
      paymentLink: t.payment_link,
      isActive: t.is_active
    }))
  };
}

/**
 * GET /api/events
 * List active events with tiers
 */
router.get('/', async (req, res, next) => {
  try {
    const events = await db.queryAll(`
      SELECT e.*,
        COALESCE(json_agg(
          json_build_object(
            'id', t.id,
            'name', t.name,
            'description', t.description,
            'price', t.price,
            'quantity', t.quantity,
            'sold', t.sold,
            'payment_link', t.payment_link,
            'is_active', t.is_active
          ) ORDER BY t.sort_order
        ) FILTER (WHERE t.id IS NOT NULL), '[]') as tiers
      FROM events e
      LEFT JOIN ticket_tiers t ON t.event_id = e.id AND t.is_active = true
      WHERE e.status = 'active'
      GROUP BY e.id
      ORDER BY e.event_date ASC, e.created_at DESC
    `);
    
    res.json({
      success: true,
      events: events.map(formatEvent),
      count: events.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/events/:id
 * Get single event
 */
router.get('/:id', async (req, res, next) => {
  try {
    const event = await db.queryOne(`
      SELECT e.*,
        COALESCE(json_agg(
          json_build_object(
            'id', t.id,
            'name', t.name,
            'description', t.description,
            'price', t.price,
            'quantity', t.quantity,
            'sold', t.sold,
            'payment_link', t.payment_link,
            'is_active', t.is_active
          ) ORDER BY t.sort_order
        ) FILTER (WHERE t.id IS NOT NULL), '[]') as tiers
      FROM events e
      LEFT JOIN ticket_tiers t ON t.event_id = e.id
      WHERE e.id = $1 AND e.status != 'deleted'
      GROUP BY e.id
    `, [req.params.id]);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      event: formatEvent(event)
    });
  } catch (err) {
    next(err);
  }
});

export default router;
