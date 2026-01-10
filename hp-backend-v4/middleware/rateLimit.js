/**
 * Rate Limiting Middleware
 */

import rateLimit from 'express-rate-limit';
import { getConfig } from '../config/env.js';

/**
 * Create general rate limiter
 */
export function createLimiter() {
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
export function createAuthLimiter() {
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

export default {
  createLimiter,
  createAuthLimiter
};
