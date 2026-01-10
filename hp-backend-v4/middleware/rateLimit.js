/**
 * Rate Limiting Middleware
 */

const rateLimit = require('express-rate-limit');
const { getConfig } = require('../config/env');

/**
 * Create general rate limiter
 */
function createLimiter() {
  const config = getConfig();
  
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
}

/**
 * Create auth rate limiter (stricter)
 */
function createAuthLimiter() {
  const config = getConfig();
  
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    message: {
      success: false,
      error: 'Too many authentication attempts',
      code: 'RATE_LIMITED'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
}

module.exports = {
  createLimiter,
  createAuthLimiter
};
