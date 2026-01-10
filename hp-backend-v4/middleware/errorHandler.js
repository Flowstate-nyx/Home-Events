/**
 * Global Error Handler
 */

const logger = require('../utils/logger');

/**
 * Error mapping
 */
const ERROR_MAP = {
  // Business errors
  TIER_NOT_FOUND: { status: 404, message: 'Ticket tier not found' },
  EVENT_NOT_FOUND: { status: 404, message: 'Event not found' },
  ORDER_NOT_FOUND: { status: 404, message: 'Order not found' },
  USER_NOT_FOUND: { status: 404, message: 'User not found' },
  GALLERY_NOT_FOUND: { status: 404, message: 'Gallery not found' },
  
  EVENT_NOT_ACTIVE: { status: 400, message: 'Event is not active' },
  TIER_NOT_ACTIVE: { status: 400, message: 'Ticket tier is not active' },
  INSUFFICIENT_INVENTORY: { status: 400, message: 'Not enough tickets available' },
  SOLD_OUT: { status: 400, message: 'Sold out' },
  
  ORDER_NOT_PENDING: { status: 400, message: 'Order is not pending' },
  CANNOT_CANCEL_NON_PENDING: { status: 400, message: 'Can only cancel pending orders' },
  CANNOT_REFUND_NON_PAID: { status: 400, message: 'Can only refund paid orders' },
  ALREADY_CHECKED_IN: { status: 400, message: 'Already checked in' },
  NOT_PAID: { status: 400, message: 'Order not paid' },
  
  // Auth errors
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password' },
  INVALID_TOKEN: { status: 401, message: 'Invalid or expired token' },
  INVALID_REFRESH_TOKEN: { status: 401, message: 'Invalid refresh token' },
  INVALID_PASSWORD: { status: 400, message: 'Current password is incorrect' },
  EMAIL_EXISTS: { status: 400, message: 'Email already in use' },
  
  // Validation
  VALIDATION_ERROR: { status: 400, message: 'Validation error' },
  MISSING_REQUIRED_FIELDS: { status: 400, message: 'Missing required fields' }
};

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // Check if it's a known error
  const errorInfo = ERROR_MAP[err.message];
  
  if (errorInfo) {
    return res.status(errorInfo.status).json({
      success: false,
      error: errorInfo.message,
      code: err.message
    });
  }
  
  // Database errors
  if (err.code) {
    switch (err.code) {
      case '23505': // unique violation
        return res.status(400).json({
          success: false,
          error: 'Duplicate entry',
          code: 'DUPLICATE'
        });
      case '23503': // foreign key violation
        return res.status(400).json({
          success: false,
          error: 'Referenced record not found',
          code: 'REFERENCE_ERROR'
        });
      case '23514': // check violation
        return res.status(400).json({
          success: false,
          error: 'Constraint violation',
          code: 'CONSTRAINT_ERROR'
        });
    }
  }
  
  // Default error
  const isProd = process.env.NODE_ENV === 'production';
  
  res.status(500).json({
    success: false,
    error: isProd ? 'Internal server error' : err.message,
    code: 'SERVER_ERROR'
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Not found',
    code: 'NOT_FOUND'
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
