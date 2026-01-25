/**
 * Authentication & Authorization Middleware
 * Multi-tenant SaaS with backwards compatibility
 * 
 * BACKWARDS COMPATIBILITY:
 * - Existing requireAuth middleware preserved
 * - Existing requireAdmin middleware preserved
 * - Users without client_id are treated as platform admins
 * 
 * NEW FEATURES:
 * - requirePlatformAdmin: Platform-level access only
 * - requireClientAdmin: Client admin or platform admin
 * - requireClientAccess: Any user with access to client
 * - scopeToClient: Automatic client scoping for queries
 */

import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import logger from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * EXISTING: Verify JWT token and attach user to request
 * PRESERVED: Exact same behavior as before
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const token = authHeader.substring(7);
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    // Get user from database with role and client info
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.client_id,
        u.status,
        u.created_at,
        c.name as client_name,
        c.slug as client_slug,
        c.status as client_status,
        c.is_platform_client
      FROM users u
      LEFT JOIN clients c ON u.client_id = c.id
      WHERE u.id = $1
    `, [decoded.userId || decoded.id]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const user = result.rows[0];
    
    if (user.status === 'inactive' || user.status === 'suspended') {
      return res.status(401).json({
        success: false,
        error: 'Account is not active'
      });
    }
    
    // BACKWARDS COMPATIBILITY: 
    // Users with NULL client_id are platform admins (existing users)
    // Users with 'admin' role are platform admins (legacy)
    const isPlatformAdmin = (
      user.client_id === null ||
      user.role === 'platform_admin' ||
      user.role === 'admin' ||  // Legacy role preserved
      user.is_platform_client === true
    );
    
    // Attach user to request with computed flags
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      client_id: user.client_id,
      client_name: user.client_name,
      client_slug: user.client_slug,
      is_platform_admin: isPlatformAdmin,
      is_client_admin: user.role === 'client_admin' || isPlatformAdmin,
      is_client_staff: user.role === 'client_staff' || user.role === 'client_admin' || isPlatformAdmin
    };
    
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};

/**
 * EXISTING: Require admin role
 * PRESERVED: Exact same behavior - checks for 'admin' role
 * ENHANCED: Also accepts platform_admin and client_admin
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  // BACKWARDS COMPATIBILITY: 'admin' role still works
  const isAdmin = (
    req.user.role === 'admin' ||
    req.user.role === 'platform_admin' ||
    req.user.role === 'client_admin' ||
    req.user.is_platform_admin
  );
  
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  
  next();
};

/**
 * NEW: Require platform admin role
 * Only platform admins can access (not client admins)
 */
export const requirePlatformAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  if (!req.user.is_platform_admin) {
    return res.status(403).json({
      success: false,
      error: 'Platform admin access required'
    });
  }
  
  next();
};

/**
 * NEW: Require client admin role
 * Client admin or platform admin can access
 */
export const requireClientAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  if (!req.user.is_client_admin) {
    return res.status(403).json({
      success: false,
      error: 'Client admin access required'
    });
  }
  
  next();
};

/**
 * NEW: Require access to specific client
 * Checks if user has access to the client specified in params or body
 */
export const requireClientAccess = (clientIdParam = 'clientId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Platform admins can access any client
    if (req.user.is_platform_admin) {
      return next();
    }
    
    // Get client ID from params, body, or query
    const requestedClientId = (
      req.params[clientIdParam] ||
      req.body.client_id ||
      req.body.clientId ||
      req.query.client_id ||
      req.query.clientId
    );
    
    // If no specific client requested, scope to user's client
    if (!requestedClientId) {
      return next();
    }
    
    // Check if user belongs to requested client
    if (req.user.client_id !== requestedClientId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this client'
      });
    }
    
    next();
  };
};

/**
 * NEW: Automatically scope queries to user's client
 * Adds client_id to req for use in queries
 * Platform admins can optionally filter by client
 */
export const scopeToClient = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  // Get requested client filter
  const requestedClientId = (
    req.query.client_id ||
    req.query.clientId ||
    req.body.client_id ||
    req.body.clientId
  );
  
  if (req.user.is_platform_admin) {
    // Platform admin can filter by any client or see all
    req.scopedClientId = requestedClientId || null;
  } else {
    // Non-platform users are always scoped to their client
    req.scopedClientId = req.user.client_id;
    
    // If they requested a different client, deny
    if (requestedClientId && requestedClientId !== req.user.client_id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this client'
      });
    }
  }
  
  next();
};

/**
 * NEW: Optional authentication
 * Attaches user if token present, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    
    // Delegate to requireAuth but catch errors
    await requireAuth(req, res, (err) => {
      if (err) {
        req.user = null;
      }
      next();
    });
  } catch (err) {
    req.user = null;
    next();
  }
};

/**
 * NEW: Can access test orders
 * Client admin+ can create/view test orders
 */
export const canAccessTestOrders = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  // Only platform_admin and client_admin can access test orders
  const canAccess = (
    req.user.is_platform_admin ||
    req.user.role === 'client_admin'
  );
  
  if (!canAccess) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required for test orders'
    });
  }
  
  next();
};

// Default export for backwards compatibility
export default {
  requireAuth,
  requireAdmin,
  requirePlatformAdmin,
  requireClientAdmin,
  requireClientAccess,
  scopeToClient,
  optionalAuth,
  canAccessTestOrders
};
