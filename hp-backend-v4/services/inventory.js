/**
 * Inventory Service
 * Transactional inventory management with SELECT FOR UPDATE
 * Prevents overselling under concurrent load
 */

import logger from '../utils/logger.js';

/**
 * Reserve inventory within a transaction
 * MUST be called within a transaction context
 * @param {Client} client - PostgreSQL client from transaction
 * @param {string} tierId - Tier UUID
 * @param {number} quantity - Quantity to reserve
 * @returns {boolean} - Success or failure
 */
export async function reserveWithinTransaction(client, tierId, quantity) {
  // Lock the row and check availability
  const result = await client.query(
    `SELECT id, quantity, sold, (quantity - sold) as available
     FROM ticket_tiers
     WHERE id = $1
     FOR UPDATE`,
    [tierId]
  );
  
  if (result.rows.length === 0) {
    logger.warn('Tier not found for reservation', { tierId });
    throw new Error('TIER_NOT_FOUND');
  }
  
  const tier = result.rows[0];
  const available = parseInt(tier.available, 10);
  
  if (available < quantity) {
    logger.warn('Insufficient inventory', { 
      tierId, 
      requested: quantity, 
      available 
    });
    return false;
  }
  
  // Update sold count
  await client.query(
    `UPDATE ticket_tiers 
     SET sold = sold + $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [quantity, tierId]
  );
  
  logger.info('Inventory reserved', { 
    tierId, 
    quantity, 
    newSold: tier.sold + quantity 
  });
  
  return true;
}

/**
 * Release inventory within a transaction
 * For refunds/cancellations
 * @param {Client} client - PostgreSQL client from transaction
 * @param {string} tierId - Tier UUID
 * @param {number} quantity - Quantity to release
 */
export async function releaseWithinTransaction(client, tierId, quantity) {
  await client.query(
    `UPDATE ticket_tiers 
     SET sold = GREATEST(0, sold - $1), updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [quantity, tierId]
  );
  
  logger.info('Inventory released', { tierId, quantity });
}

/**
 * Get tier availability (non-locking read)
 * @param {Object} db - Database module
 * @param {string} tierId - Tier UUID
 * @returns {Object} - Tier with availability info
 */
export async function getTierAvailability(db, tierId) {
  const result = await db.queryOne(
    `SELECT id, name, price, quantity, sold, 
            (quantity - sold) as available,
            is_active, sale_starts_at, sale_ends_at
     FROM ticket_tiers
     WHERE id = $1`,
    [tierId]
  );
  
  if (!result) {
    return null;
  }
  
  return {
    id: result.id,
    name: result.name,
    price: parseFloat(result.price),
    quantity: result.quantity,
    sold: result.sold,
    available: parseInt(result.available, 10),
    isActive: result.is_active,
    saleStartsAt: result.sale_starts_at,
    saleEndsAt: result.sale_ends_at
  };
}

/**
 * Check if tier is purchasable
 * @param {Object} tier - Tier object from getTierAvailability
 * @param {number} requestedQty - Requested quantity
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateTierPurchase(tier, requestedQty) {
  if (!tier) {
    return { valid: false, error: 'TIER_NOT_FOUND' };
  }
  
  if (!tier.isActive) {
    return { valid: false, error: 'TIER_INACTIVE' };
  }
  
  const now = new Date();
  
  if (tier.saleStartsAt && new Date(tier.saleStartsAt) > now) {
    return { valid: false, error: 'SALE_NOT_STARTED' };
  }
  
  if (tier.saleEndsAt && new Date(tier.saleEndsAt) < now) {
    return { valid: false, error: 'SALE_ENDED' };
  }
  
  if (tier.available < requestedQty) {
    return { valid: false, error: 'INSUFFICIENT_INVENTORY', available: tier.available };
  }
  
  return { valid: true };
}

export default {
  reserveWithinTransaction,
  releaseWithinTransaction,
  getTierAvailability,
  validateTierPurchase
};
