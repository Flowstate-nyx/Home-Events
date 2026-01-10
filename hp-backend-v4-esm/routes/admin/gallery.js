/**
 * Admin Gallery Routes
 */

import express from 'express';
import cloudinaryPkg from 'cloudinary';
import * as db from '../../db/pool.js';
import { getConfig } from '../../config/env.js';
import logger from '../../utils/logger.js';

const cloudinary = cloudinaryPkg.v2;
const router = express.Router();

/**
 * Initialize Cloudinary
 */
function initCloudinary() {
  const config = getConfig();
  
  if (!config.cloudinary.configured) {
    return false;
  }
  
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret
  });
  
  return true;
}

/**
 * GET /api/admin/gallery
 * List all galleries
 */
router.get('/', async (req, res, next) => {
  try {
    const galleries = await db.queryAll(`
      SELECT g.*, e.name as event_name,
             COUNT(gi.id) as image_count
      FROM galleries g
      LEFT JOIN events e ON e.id = g.event_id
      LEFT JOIN gallery_images gi ON gi.gallery_id = g.id
      GROUP BY g.id, e.name
      ORDER BY g.created_at DESC
    `);
    
    res.json({
      success: true,
      galleries: galleries.map(g => ({
        id: g.id,
        title: g.title,
        description: g.description,
        coverUrl: g.cover_image_url,
        eventId: g.event_id,
        eventName: g.event_name,
        photographer: g.photographer,
        isPublished: g.is_published,
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
 * GET /api/admin/gallery/:id
 * Get gallery with images
 */
router.get('/:id', async (req, res, next) => {
  try {
    const gallery = await db.queryOne(`
      SELECT g.*, e.name as event_name
      FROM galleries g
      LEFT JOIN events e ON e.id = g.event_id
      WHERE g.id = $1
    `, [req.params.id]);
    
    if (!gallery) {
      return res.status(404).json({
        success: false,
        error: 'Gallery not found',
        code: 'GALLERY_NOT_FOUND'
      });
    }
    
    const images = await db.queryAll(`
      SELECT id, image_url, thumbnail_url, caption, cloudinary_public_id, sort_order
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
        photographer: gallery.photographer,
        isPublished: gallery.is_published,
        createdAt: gallery.created_at,
        images: images.map(img => ({
          id: img.id,
          url: img.image_url,
          thumbnail: img.thumbnail_url,
          caption: img.caption,
          cloudinaryId: img.cloudinary_public_id,
          sortOrder: img.sort_order
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/gallery
 * Create gallery
 */
router.post('/', async (req, res, next) => {
  try {
    const { title, description, eventId, photographer, isPublished, coverUrl, images } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    const gallery = await db.transaction(async (client) => {
      // Create gallery
      const result = await client.query(
        `INSERT INTO galleries (title, description, event_id, photographer, is_published, cover_image_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [title, description || '', eventId || null, photographer || '', isPublished || false, coverUrl || null, req.user.id]
      );
      
      const gallery = result.rows[0];
      
      // Add images if provided
      if (images && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          await client.query(
            `INSERT INTO gallery_images (gallery_id, image_url, thumbnail_url, caption, cloudinary_public_id, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [gallery.id, img.url, img.thumbnail || img.url, img.caption || '', img.cloudinaryId || null, i]
          );
        }
      }
      
      return gallery;
    });
    
    logger.info('Gallery created', { galleryId: gallery.id, title, userId: req.user.id });
    
    res.status(201).json({
      success: true,
      gallery: { id: gallery.id, title: gallery.title },
      message: 'Gallery created'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/gallery/:id
 * Update gallery
 */
router.put('/:id', async (req, res, next) => {
  try {
    const galleryId = req.params.id;
    const { title, description, eventId, photographer, isPublished, coverUrl, images } = req.body;
    
    const existing = await db.queryOne(
      `SELECT * FROM galleries WHERE id = $1`,
      [galleryId]
    );
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Gallery not found',
        code: 'GALLERY_NOT_FOUND'
      });
    }
    
    await db.transaction(async (client) => {
      // Update gallery
      await client.query(
        `UPDATE galleries SET
          title = COALESCE($1, title),
          description = COALESCE($2, description),
          event_id = $3,
          photographer = COALESCE($4, photographer),
          is_published = COALESCE($5, is_published),
          cover_image_url = $6
         WHERE id = $7`,
        [title, description, eventId, photographer, isPublished, coverUrl, galleryId]
      );
      
      // Update images if provided
      if (images !== undefined) {
        // Delete existing images from DB
        await client.query(
          `DELETE FROM gallery_images WHERE gallery_id = $1`,
          [galleryId]
        );
        
        // Insert new images
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          await client.query(
            `INSERT INTO gallery_images (gallery_id, image_url, thumbnail_url, caption, cloudinary_public_id, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [galleryId, img.url, img.thumbnail || img.url, img.caption || '', img.cloudinaryId || null, i]
          );
        }
      }
    });
    
    logger.info('Gallery updated', { galleryId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Gallery updated'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/gallery/:id
 * Delete gallery
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const galleryId = req.params.id;
    const config = getConfig();
    
    const gallery = await db.queryOne(
      `SELECT * FROM galleries WHERE id = $1`,
      [galleryId]
    );
    
    if (!gallery) {
      return res.status(404).json({
        success: false,
        error: 'Gallery not found',
        code: 'GALLERY_NOT_FOUND'
      });
    }
    
    // Get images for Cloudinary cleanup
    const images = await db.queryAll(
      `SELECT cloudinary_public_id FROM gallery_images WHERE gallery_id = $1`,
      [galleryId]
    );
    
    // Delete from DB (cascade deletes images)
    await db.query(
      `DELETE FROM galleries WHERE id = $1`,
      [galleryId]
    );
    
    // Cleanup Cloudinary images
    if (config.cloudinary.configured && images.length > 0) {
      initCloudinary();
      for (const img of images) {
        if (img.cloudinary_public_id) {
          try {
            await cloudinary.uploader.destroy(img.cloudinary_public_id);
          } catch (err) {
            logger.warn('Failed to delete Cloudinary image', { publicId: img.cloudinary_public_id });
          }
        }
      }
    }
    
    logger.info('Gallery deleted', { galleryId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Gallery deleted'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/gallery/upload-sign
 * Get signed upload URL for gallery images
 */
router.post('/upload-sign', async (req, res, next) => {
  try {
    const config = getConfig();
    
    if (!config.cloudinary.configured) {
      return res.status(400).json({
        success: false,
        error: 'Cloudinary not configured',
        code: 'CLOUDINARY_NOT_CONFIGURED'
      });
    }
    
    initCloudinary();
    
    const { galleryId } = req.body;
    const timestamp = Math.round(Date.now() / 1000);
    const folder = galleryId 
      ? `home-productions/galleries/${galleryId}`
      : 'home-productions/galleries/temp';
    
    const paramsToSign = {
      timestamp,
      folder,
      transformation: 'c_limit,w_1920,h_1080,q_auto,f_auto'
    };
    
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      config.cloudinary.apiSecret
    );
    
    res.json({
      success: true,
      signature,
      timestamp,
      folder,
      cloudName: config.cloudinary.cloudName,
      apiKey: config.cloudinary.apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/upload`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
