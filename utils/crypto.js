/**
 * Cryptographic Utilities
 * Secure hashing functions
 */

import crypto from 'crypto';

/**
 * Hash string with SHA-256
 */
export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate random hex string
 */
export function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex').toUpperCase();
}

/**
 * Generate secure token
 */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string comparison
 */
export function secureCompare(a, b) {
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

export default {
  sha256,
  randomHex,
  generateToken,
  secureCompare
};
