/**
 * Authentication Routes
 */

const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db/pool');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    const result = await auth.login(email, password, req);
    
    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user
    });
  } catch (err) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { userId, refreshToken } = req.body;
    
    if (!userId || !refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'User ID and refresh token required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    const result = await auth.refresh(userId, refreshToken);
    
    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user
    });
  } catch (err) {
    if (err.message === 'INVALID_REFRESH_TOKEN' || err.message === 'USER_NOT_FOUND') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    next(err);
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', auth.requireAuth, async (req, res, next) => {
  try {
    await auth.logout(req.user.id);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', auth.requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current and new password required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
        code: 'VALIDATION_ERROR'
      });
    }
    
    await auth.changePassword(req.user.id, currentPassword, newPassword);
    
    res.json({ success: true, message: 'Password changed' });
  } catch (err) {
    if (err.message === 'INVALID_PASSWORD') {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }
    next(err);
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', auth.requireAuth, async (req, res, next) => {
  try {
    const user = await db.queryOne(
      `SELECT id, email, name, role, last_login_at, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
