/**
 * QR Code Service
 * Generates and verifies QR codes with hashed storage
 * QR codes are stored HASHED, never in plaintext
 */

import QRCode from 'qrcode';
import { sha256, randomHex } from '../utils/crypto.js';
import logger from '../utils/logger.js';

/**
 * Generate a new QR code
 * Returns both plaintext (for display) and hash (for storage)
 * @returns {Object} - { plaintext: string, hash: string }
 */
export function generateQRCode() {
  // 32-character uppercase hex string
  const plaintext = randomHex(16);
  const hash = sha256(plaintext);
  
  return { plaintext, hash };
}

/**
 * Hash a QR code for storage/lookup
 * @param {string} plaintext - Plain QR code value
 * @returns {string} - SHA-256 hash
 */
export function hashQRCode(plaintext) {
  return sha256(plaintext.toUpperCase());
}

/**
 * Generate QR code data URL for email
 * @param {Object} orderData - Order information to encode
 * @param {string} qrPlaintext - Plain QR code value
 * @returns {Promise<string>} - Data URL
 */
export async function generateQRDataUrl(orderData, qrPlaintext) {
  const payload = JSON.stringify({
    id: orderData.orderNumber,
    qr: qrPlaintext,
    event: orderData.eventName,
    tier: orderData.tierName
  });
  
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      width: 300,
      margin: 2,
      color: {
        dark: '#0d1f1a',
        light: '#F5F0E8'
      },
      errorCorrectionLevel: 'H'
    });
    
    return dataUrl;
  } catch (err) {
    logger.error('QR code generation failed', { error: err.message });
    throw new Error('QR_GENERATION_FAILED');
  }
}

/**
 * Verify QR code against stored hash
 * @param {string} providedQR - QR code provided at check-in
 * @param {string} storedHash - Hash stored in database
 * @returns {boolean}
 */
export function verifyQRCode(providedQR, storedHash) {
  const providedHash = hashQRCode(providedQR);
  return providedHash === storedHash;
}

/**
 * Find order by QR code
 * @param {Object} db - Database module
 * @param {string} qrCode - Plain QR code value
 * @returns {Object|null} - Order if found
 */
export async function findOrderByQR(db, qrCode) {
  const hash = hashQRCode(qrCode);
  
  const order = await db.queryOne(
    `SELECT o.*, e.name as event_name, t.name as tier_name
     FROM orders o
     JOIN events e ON e.id = o.event_id
     JOIN ticket_tiers t ON t.id = o.tier_id
     WHERE o.qr_code_hash = $1`,
    [hash]
  );
  
  return order;
}

export default {
  generateQRCode,
  hashQRCode,
  generateQRDataUrl,
  verifyQRCode,
  findOrderByQR
};
