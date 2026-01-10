/**
 * Admin Upload Routes
 * Cloudinary signed upload for event images
 */

import express from 'express';
import cloudinaryPkg from 'cloudinary';
import { getConfig } from '../../config/env.js';
import * as db from '../../db/pool.js';
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
 * POST /api/admin/upload/sign
 * Get signed upload URL for Cloudinary
 */
router.post('/sign', async (req, res, next) => {
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
    
    const { folder, eventId } = req.body;
    const timestamp = Math.round(Date.now() / 1000);
    
    // Determine folder based on context
    const uploadFolder = eventId 
      ? `home-productions/events/${eventId}`
      : folder || 'home-productions/uploads';
    
    const paramsToSign = {
      timestamp,
      folder: uploadFolder,
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
      folder: uploadFolder,
      cloudName: config.cloudinary.cloudName,
      apiKey: config.cloudinary.apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/upload`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/upload/event-image/:eventId
 * Upload event image directly (receives base64 or URL)
 */
router.post('/event-image/:eventId', async (req, res, next) => {
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
    
    const eventId = req.params.eventId;
    const { image } = req.body; // base64 or URL
    
    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Image required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    // Get event to check it exists
    const event = await db.queryOne(
      `SELECT id, cloudinary_public_id FROM events WHERE id = $1`,
      [eventId]
    );
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND'
      });
    }
    
    // Delete old image if exists
    if (event.cloudinary_public_id) {
      try {
        await cloudinary.uploader.destroy(event.cloudinary_public_id);
        logger.info('Old event image deleted', { publicId: event.cloudinary_public_id });
      } catch (err) {
        logger.warn('Failed to delete old image', { error: err.message });
      }
    }
    
    // Upload new image
    const uploadResult = await cloudinary.uploader.upload(image, {
      folder: `home-productions/events/${eventId}`,
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' }
      ],
      resource_type: 'image'
    });
    
    // Update event with new image
    await db.query(
      `UPDATE events SET image_url = $1, cloudinary_public_id = $2 WHERE id = $3`,
      [uploadResult.secure_url, uploadResult.public_id, eventId]
    );
    
    logger.info('Event image uploaded', { 
      eventId, 
      publicId: uploadResult.public_id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      message: 'Image uploaded'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/upload/event-image/:eventId
 * Remove event image
 */
router.delete('/event-image/:eventId', async (req, res, next) => {
  try {
    const config = getConfig();
    
    if (!config.cloudinary.configured) {
      return res.status(400).json({
        success: false,
        error: 'Cloudinary not configured'
      });
    }
    
    initCloudinary();
    
    const eventId = req.params.eventId;
    
    const event = await db.queryOne(
      `SELECT cloudinary_public_id FROM events WHERE id = $1`,
      [eventId]
    );
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    if (event.cloudinary_public_id) {
      await cloudinary.uploader.destroy(event.cloudinary_public_id);
    }
    
    await db.query(
      `UPDATE events SET image_url = NULL, cloudinary_public_id = NULL WHERE id = $1`,
      [eventId]
    );
    
    logger.info('Event image deleted', { eventId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Image deleted'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
