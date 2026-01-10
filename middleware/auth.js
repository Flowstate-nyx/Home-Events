/**
 * Authentication Middleware
 * JWT-based with refresh token support
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getConfig } from '../config/env.js';
import * as db from '../db/pool.js';
import { sha256, generateToken } from '../utils/crypto.js';
import * as auditService from '../services/audit.js';
import logger from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;

/**
 * Generate access token
 */
function generateAccessToken(user) {
  const config = getConfig();
  
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.accessExpires,
      issuer: 'home-productions'
    }
  );
}

/**
 * Generate refresh token
 */
async function generateRefreshToken(userId) {
  const config = getConfig();
  const token = generateToken(40);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + config.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);
  
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  
  return token;
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
  const config = getConfig();
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: 'home-productions'
    });
    
    if (decoded.type !== 'access') {
      return null;
    }
    
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Verify refresh token
 */
async function verifyRefreshToken(userId, token) {
  const tokenHash = sha256(token);
  
  const result = await db.queryOne(
    `SELECT * FROM refresh_tokens
     WHERE user_id = $1 AND token_hash = $2
       AND expires_at > CURRENT_TIMESTAMP
       AND revoked_at IS NULL`,
    [userId, tokenHash]
  );
  
  return result;
}

/**
 * Revoke refresh token
 */
async function revokeRefreshToken(tokenId) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [tokenId]
  );
}

/**
 * Revoke all user tokens
 */
async function revokeAllUserTokens(userId) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [userId]
  );
}

/**
 * Hash password
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Login
 */
export async function login(email, password, req = null) {
  const user = await db.queryOne(
    `SELECT * FROM users WHERE email = $1 AND is_active = true`,
    [email.toLowerCase()]
  );
  
  if (!user) {
    throw new Error('INVALID_CREDENTIALS');
  }
  
  const valid = await verifyPassword(password, user.password_hash);
  
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }
  
  // Update last login
  await db.query(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [user.id]
  );
  
  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);
  
  // Audit
  await auditService.logLogin(user.id, req?.ip, req?.get?.('user-agent'));
  
  logger.info('User logged in', { userId: user.id, email: user.email });
  
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  };
}

/**
 * Refresh tokens
 */
export async function refresh(userId, refreshToken) {
  const tokenRecord = await verifyRefreshToken(userId, refreshToken);
  
  if (!tokenRecord) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }
  
  const user = await db.queryOne(
    `SELECT * FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );
  
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  
  // Revoke old token
  await revokeRefreshToken(tokenRecord.id);
  
  // Generate new tokens
  const accessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user.id);
  
  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  };
}

/**
 * Logout
 */
export async function logout(userId) {
  await revokeAllUserTokens(userId);
  await auditService.logLogout(userId);
  logger.info('User logged out', { userId });
}

/**
 * Create admin user
 */
export async function createUser(email, password, name, role = 'admin') {
  const existing = await db.queryOne(
    `SELECT id FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  
  if (existing) {
    throw new Error('EMAIL_EXISTS');
  }
  
  const passwordHash = await hashPassword(password);
  
  const result = await db.queryOne(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, created_at`,
    [email.toLowerCase(), passwordHash, name, role]
  );
  
  logger.info('User created', { userId: result.id, email: result.email, role });
  
  return result;
}

/**
 * Change password
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await db.queryOne(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId]
  );
  
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  
  const valid = await verifyPassword(currentPassword, user.password_hash);
  
  if (!valid) {
    throw new Error('INVALID_PASSWORD');
  }
  
  const newHash = await hashPassword(newPassword);
  
  await db.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2`,
    [newHash, userId]
  );
  
  // Revoke all tokens
  await revokeAllUserTokens(userId);
  
  logger.info('Password changed', { userId });
}

/**
 * Authentication middleware
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'NO_TOKEN'
    });
  }
  
  const token = authHeader.substring(7);
  const decoded = verifyAccessToken(token);
  
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
  
  req.user = {
    id: decoded.sub,
    email: decoded.email,
    role: decoded.role
  };
  
  next();
}

/**
 * Role authorization middleware
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_USER'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN'
      });
    }
    
    next();
  };
}

/**
 * Optional auth middleware
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    
    if (decoded) {
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role
      };
    }
  }
  
  next();
}

/**
 * Initialize default admin
 */
export async function initDefaultAdmin() {
  const config = getConfig();
  
  if (!config.admin.defaultEmail || !config.admin.defaultPassword) {
    return null;
  }
  
  const existing = await db.queryOne(
    `SELECT id FROM users WHERE email = $1`,
    [config.admin.defaultEmail.toLowerCase()]
  );
  
  if (existing) {
    return null;
  }
  
  const admin = await createUser(
    config.admin.defaultEmail,
    config.admin.defaultPassword,
    'Admin',
    'superadmin'
  );
  
  logger.info('Default admin created', { email: config.admin.defaultEmail });
  
  return admin;
}

/**
 * Cleanup expired tokens
 */
export async function cleanupTokens() {
  const result = await db.query(
    `DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP OR revoked_at IS NOT NULL`
  );
  
  if (result.rowCount > 0) {
    logger.info('Cleaned up expired tokens', { count: result.rowCount });
  }
}

export default {
  login,
  refresh,
  logout,
  createUser,
  changePassword,
  requireAuth,
  requireRole,
  optionalAuth,
  initDefaultAdmin,
  cleanupTokens,
  hashPassword
};
