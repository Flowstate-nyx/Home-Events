/**
 * Authentication Routes
 * Home Productions Ticketing Platform
 * 
 * BACKWARDS COMPATIBILITY:
 * - POST /api/auth/login - PRESERVED: Existing login works exactly as before
 * - POST /api/auth/refresh - PRESERVED: Token refresh unchanged
 * - POST /api/auth/logout - PRESERVED: Logout unchanged
 * - GET /api/auth/me - PRESERVED: Current user info (ENHANCED with client info)
 * 
 * NEW FEATURES (TASK 2):
 * - POST /api/auth/signup - Client code signup flow
 * - POST /api/auth/validate-code - Validate client code before signup
 * - All existing users continue to work without migration
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '30d';
const BCRYPT_ROUNDS = 12;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
  
  return { accessToken, refreshToken };
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Validate password strength
 */
const isValidPassword = (password) => {
  return password && password.length >= 8;
};

// ============================================
// EXISTING ROUTES - PRESERVED
// ============================================

/**
 * POST /api/auth/login
 * PRESERVED: Existing login flow - no changes to behavior
 * ENHANCED: Returns client info if user belongs to a client
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
    // Get user with client info
    // BACKWARDS COMPATIBLE: LEFT JOIN preserves users without client_id
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.password_hash,
        u.name,
        u.role,
        u.status,
        u.client_id,
        c.name as client_name,
        c.slug as client_slug,
        c.status as client_status,
        c.is_platform_client
      FROM users u
      LEFT JOIN clients c ON u.client_id = c.id
      WHERE LOWER(u.email) = LOWER($1)
    `, [email.trim()]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    const user = result.rows[0];
    
    // Check account status
    if (user.status === 'inactive') {
      return res.status(401).json({
        success: false,
        error: 'Account is inactive'
      });
    }
    
    if (user.status === 'suspended') {
      return res.status(401).json({
        success: false,
        error: 'Account has been suspended'
      });
    }
    
    // Check client status (if applicable)
    if (user.client_id && user.client_status === 'inactive') {
      return res.status(401).json({
        success: false,
        error: 'Organization account is inactive'
      });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );
    
    logger.info('User logged in', { userId: user.id, email: user.email });
    
    // BACKWARDS COMPATIBLE response with ENHANCED client info
    res.json({
      success: true,
      tokens: {
        accessToken,
        refreshToken
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        // NEW: Client info (null for existing users without client)
        clientId: user.client_id,
        clientName: user.client_name,
        clientSlug: user.client_slug,
        isPlatformClient: user.is_platform_client || false,
        // Computed flags for frontend
        isPlatformAdmin: (
          user.client_id === null ||
          user.role === 'platform_admin' ||
          user.role === 'admin' ||
          user.is_platform_client === true
        ),
        isClientAdmin: (
          user.role === 'client_admin' ||
          user.role === 'platform_admin' ||
          user.role === 'admin'
        )
      }
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * POST /api/auth/refresh
 * PRESERVED: Token refresh - no changes
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required'
      });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token type'
      });
    }
    
    // Verify user still exists and is active
    const result = await pool.query(
      'SELECT id, status FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0 || result.rows[0].status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }
    
    // Generate new tokens
    const tokens = generateTokens(decoded.userId);
    
    res.json({
      success: true,
      tokens
    });
  } catch (err) {
    logger.error('Token refresh error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * PRESERVED: Logout - no changes
 * Note: With JWT, logout is mainly client-side token removal
 */
router.post('/logout', requireAuth, (req, res) => {
  // JWT tokens are stateless, so logout is handled client-side
  // This endpoint exists for audit logging and future token blacklisting
  logger.info('User logged out', { userId: req.user.id });
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/auth/me
 * PRESERVED: Get current user - behavior unchanged
 * ENHANCED: Returns additional client info
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    // Get full user info with client details
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.status,
        u.client_id,
        u.created_at,
        u.last_login,
        c.name as client_name,
        c.slug as client_slug,
        c.logo_url as client_logo,
        c.status as client_status,
        c.is_platform_client
      FROM users u
      LEFT JOIN clients c ON u.client_id = c.id
      WHERE u.id = $1
    `, [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const user = result.rows[0];
    
    // BACKWARDS COMPATIBLE response with ENHANCED client info
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        // Client info (null for users without client)
        clientId: user.client_id,
        clientName: user.client_name,
        clientSlug: user.client_slug,
        clientLogo: user.client_logo,
        isPlatformClient: user.is_platform_client || false,
        // Computed flags
        isPlatformAdmin: (
          user.client_id === null ||
          user.role === 'platform_admin' ||
          user.role === 'admin' ||
          user.is_platform_client === true
        ),
        isClientAdmin: (
          user.role === 'client_admin' ||
          user.role === 'platform_admin' ||
          user.role === 'admin'
        )
      }
    });
  } catch (err) {
    logger.error('Get user error', { error: err.message, userId: req.user.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get user info'
    });
  }
});

// ============================================
// NEW ROUTES - TASK 2: CLIENT CODE SIGNUP
// ============================================

/**
 * POST /api/auth/validate-code
 * NEW: Validate client code before signup
 * Public endpoint - no auth required
 */
router.post('/validate-code', async (req, res) => {
  try {
    const { clientCode } = req.body;
    
    if (!clientCode) {
      return res.status(400).json({
        success: false,
        error: 'Client code is required'
      });
    }
    
    // Find client by code
    const result = await pool.query(`
      SELECT id, name, slug, status, logo_url
      FROM clients
      WHERE UPPER(client_code) = UPPER($1)
    `, [clientCode.trim()]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invalid client code'
      });
    }
    
    const client = result.rows[0];
    
    if (client.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'This organization is not accepting new signups'
      });
    }
    
    res.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        logoUrl: client.logo_url
      }
    });
  } catch (err) {
    logger.error('Validate code error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to validate code'
    });
  }
});

/**
 * POST /api/auth/signup
 * NEW: Invite-only signup with client code
 * Does NOT affect existing login flow
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, clientCode } = req.body;
    
    // Validate required fields
    if (!email || !password || !clientCode) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and client code are required'
      });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }
    
    // Validate client code
    const clientResult = await pool.query(`
      SELECT id, name, status
      FROM clients
      WHERE UPPER(client_code) = UPPER($1)
    `, [clientCode.trim()]);
    
    if (clientResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid client code'
      });
    }
    
    const client = clientResult.rows[0];
    
    if (client.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'This organization is not accepting new signups'
      });
    }
    
    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    // Create user with client_staff role (default for new signups)
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, role, status, client_id)
      VALUES ($1, $2, $3, 'client_staff', 'active', $4)
      RETURNING id, email, name, role, client_id
    `, [
      email.trim().toLowerCase(),
      passwordHash,
      name?.trim() || email.split('@')[0],
      client.id
    ]);
    
    const user = userResult.rows[0];
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    logger.info('New user signed up', {
      userId: user.id,
      email: user.email,
      clientId: client.id,
      clientName: client.name
    });
    
    res.status(201).json({
      success: true,
      message: `Welcome to ${client.name}!`,
      tokens: {
        accessToken,
        refreshToken
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.client_id,
        clientName: client.name,
        isPlatformAdmin: false,
        isClientAdmin: false
      }
    });
  } catch (err) {
    logger.error('Signup error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Signup failed'
    });
  }
});

/**
 * POST /api/auth/change-password
 * PRESERVED: Change password functionality
 */
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }
    
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters'
      });
    }
    
    // Get current password hash
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    
    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, req.user.id]
    );
    
    logger.info('Password changed', { userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (err) {
    logger.error('Change password error', { error: err.message, userId: req.user.id });
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

export default router;
