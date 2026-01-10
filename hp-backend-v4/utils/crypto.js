/**
 * Cryptographic Utilities
 * Secure hashing functions
 */

const crypto = require('crypto');

/**
 * Hash string with SHA-256
 */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate random hex string
 */
function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex').toUpperCase();
}

/**
 * Generate secure token
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string comparison
 */
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  if (bufA.length !== bufB.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  sha256,
  randomHex,
  generateToken,
  secureCompare
};
