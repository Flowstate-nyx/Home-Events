/**
 * Newsletter Routes
 */

import express from 'express';
import * as db from '../db/pool.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/newsletter/subscribe
 */
router.post('/subscribe', async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Check if already subscribed
    const existing = await db.queryOne(
      `SELECT id, is_active FROM newsletter_subscribers WHERE email = $1`,
      [email.toLowerCase()]
    );
    
    if (existing) {
      if (existing.is_active) {
        return res.json({
          success: true,
          message: 'Already subscribed'
        });
      }
      
      // Reactivate
      await db.query(
        `UPDATE newsletter_subscribers SET is_active = true, unsubscribed_at = NULL WHERE id = $1`,
        [existing.id]
      );
      
      logger.info('Newsletter resubscribed', { email });
      
      return res.json({
        success: true,
        message: 'Resubscribed successfully'
      });
    }
    
    // New subscriber
    await db.query(
      `INSERT INTO newsletter_subscribers (email) VALUES ($1)`,
      [email.toLowerCase()]
    );
    
    logger.info('Newsletter subscribed', { email });
    
    res.status(201).json({
      success: true,
      message: 'Subscribed successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/newsletter/unsubscribe
 */
router.post('/unsubscribe', async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email required'
      });
    }
    
    await db.query(
      `UPDATE newsletter_subscribers SET is_active = false, unsubscribed_at = CURRENT_TIMESTAMP WHERE email = $1`,
      [email.toLowerCase()]
    );
    
    logger.info('Newsletter unsubscribed', { email });
    
    res.json({
      success: true,
      message: 'Unsubscribed successfully'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
