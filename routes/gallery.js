/**
 * Public Gallery Routes
 */

import express from 'express';
import * as db from '../db/pool.js';

const router = express.Router();

/**
 * GET /api/gallery
 * List published galleries
 */
router.get('/', async (req, res, next) => {
  try {
    const galleries = await db.queryAll(`
      SELECT g.*, e.name as event_name, e.event_date,
             COUNT(gi.id) as image_count,
             (SELECT gi2.image_url FROM gallery_images gi2 WHERE gi2.gallery_id = g.id ORDER BY gi2.sort_order LIMIT 1) as cover_url
      FROM galleries g
      LEFT JOIN events e ON e.id = g.event_id
      LEFT JOIN gallery_images gi ON gi.gallery_id = g.id
      WHERE g.is_published = true
      GROUP BY g.id, e.name, e.event_date
      ORDER BY g.created_at DESC
    `);
    
    res.json({
      success: true,
      galleries: galleries.map(g => ({
        id: g.id,
        title: g.title,
        description: g.description,
        coverUrl: g.cover_url || g.cover_image_url,
        eventId: g.event_id,
        eventName: g.event_name,
        eventDate: g.event_date,
        photographer: g.photographer,
        imageCount: parseInt(g.image_count) || 0,
        createdAt: g.created_at
      })),
      count: galleries.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gallery/:id
 * Get gallery with images
 */
router.get('/:id', async (req, res, next) => {
  try {
    const gallery = await db.queryOne(`
      SELECT g.*, e.name as event_name, e.event_date
      FROM galleries g
      LEFT JOIN events e ON e.id = g.event_id
      WHERE g.id = $1 AND g.is_published = true
    `, [req.params.id]);
    
    if (!gallery) {
      return res.status(404).json({
        success: false,
        error: 'Gallery not found',
        code: 'GALLERY_NOT_FOUND'
      });
    }
    
    const images = await db.queryAll(`
      SELECT id, image_url, thumbnail_url, caption, cloudinary_public_id
      FROM gallery_images
      WHERE gallery_id = $1
      ORDER BY sort_order ASC
    `, [req.params.id]);
    
    res.json({
      success: true,
      gallery: {
        id: gallery.id,
        title: gallery.title,
        description: gallery.description,
        coverUrl: gallery.cover_image_url,
        eventId: gallery.event_id,
        eventName: gallery.event_name,
        eventDate: gallery.event_date,
        photographer: gallery.photographer,
        createdAt: gallery.created_at,
        images: images.map(img => ({
          id: img.id,
          url: img.image_url,
          thumbnail: img.thumbnail_url,
          caption: img.caption
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
