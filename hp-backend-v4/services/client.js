/**
 * Client Service
 * Multi-tenant client (promoter/organizer) management
 * 
 * TASK 1: Multi-Tenant SaaS Foundation
 * - Client organizations (promoters/organizers)
 * - Client codes for signup
 * - Platform fee configuration
 */

import * as db from '../db/pool.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

// ============================================
// CLIENT CODE GENERATION
// ============================================

/**
 * Generate unique client code
 * Format: 2-3 letter prefix + 4 digits
 */
function generateClientCode(name) {
  // Create prefix from name (first 2-3 consonants or letters)
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
    .padEnd(2, 'X');
  
  // Add random 4 digits
  const digits = Math.floor(1000 + Math.random() * 9000);
  
  return `${prefix}${digits}`;
}

/**
 * Generate unique slug from name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ============================================
// CLIENT CRUD
// ============================================

/**
 * Create new client (promoter/organizer)
 * @param {Object} clientData - Client details
 * @returns {Object} - Created client
 */
export async function createClient(clientData) {
  const {
    name,
    email,
    phone,
    website,
    logoUrl,
    brandColor,
    platformFeePercent = 5.0,
    platformFeeFixed = 0.0,
    settings = {}
  } = clientData;
  
  if (!name || !email) {
    throw new Error('CLIENT_NAME_EMAIL_REQUIRED');
  }
  
  // Generate unique code and slug
  let clientCode = generateClientCode(name);
  let slug = generateSlug(name);
  
  // Ensure uniqueness
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.queryOne(
      `SELECT id FROM clients WHERE client_code = $1 OR slug = $2`,
      [clientCode, slug]
    );
    
    if (!existing) break;
    
    // Regenerate with more randomness
    clientCode = generateClientCode(name) + crypto.randomInt(10, 99);
    slug = slug + '-' + crypto.randomInt(100, 999);
    attempts++;
  }
  
  const result = await db.queryOne(
    `INSERT INTO clients (
      name, slug, client_code, email, phone, website,
      logo_url, brand_color,
      platform_fee_percent, platform_fee_fixed,
      settings, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
    RETURNING *`,
    [
      name, slug, clientCode, email, phone || null, website || null,
      logoUrl || null, brandColor || '#D4AF37',
      platformFeePercent, platformFeeFixed,
      JSON.stringify(settings)
    ]
  );
  
  logger.info('Client created', {
    clientId: result.id,
    name,
    clientCode
  });
  
  return result;
}

/**
 * Get client by ID
 */
export async function getClientById(clientId) {
  return db.queryOne(
    `SELECT * FROM clients WHERE id = $1`,
    [clientId]
  );
}

/**
 * Get client by code (for signup)
 */
export async function getClientByCode(clientCode) {
  return db.queryOne(
    `SELECT * FROM clients WHERE client_code = $1 AND status = 'active'`,
    [clientCode.toUpperCase()]
  );
}

/**
 * Get client by slug
 */
export async function getClientBySlug(slug) {
  return db.queryOne(
    `SELECT * FROM clients WHERE slug = $1`,
    [slug.toLowerCase()]
  );
}

/**
 * List all clients
 */
export async function listClients(filters = {}) {
  const { status, search, limit = 100, offset = 0 } = filters;
  
  let sql = `SELECT * FROM clients`;
  const conditions = [];
  const params = [];
  
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return db.queryAll(sql, params);
}

/**
 * Update client
 */
export async function updateClient(clientId, updates) {
  const allowedFields = [
    'name', 'email', 'phone', 'website',
    'logo_url', 'brand_color',
    'platform_fee_percent', 'platform_fee_fixed',
    'settings', 'status'
  ];
  
  const fields = [];
  const params = [clientId];
  
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey) && value !== undefined) {
      params.push(key === 'settings' ? JSON.stringify(value) : value);
      fields.push(`${snakeKey} = $${params.length}`);
    }
  }
  
  if (fields.length === 0) {
    return getClientById(clientId);
  }
  
  await db.query(
    `UPDATE clients SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    params
  );
  
  logger.info('Client updated', { clientId, fields: Object.keys(updates) });
  
  return getClientById(clientId);
}

// ============================================
// PLATFORM FEE MANAGEMENT (TASK 3)
// ============================================

/**
 * Update client platform fees
 * @param {UUID} clientId - Client ID
 * @param {number} feePercent - Percentage fee (0-50)
 * @param {number} feeFixed - Fixed fee amount
 * @param {UUID} updatedBy - User making the change
 */
export async function updatePlatformFees(clientId, feePercent, feeFixed, updatedBy = null) {
  if (feePercent < 0 || feePercent > 50) {
    throw new Error('INVALID_FEE_PERCENT');
  }
  
  if (feeFixed < 0) {
    throw new Error('INVALID_FEE_FIXED');
  }
  
  const client = await getClientById(clientId);
  if (!client) {
    throw new Error('CLIENT_NOT_FOUND');
  }
  
  const oldFees = {
    percent: parseFloat(client.platform_fee_percent),
    fixed: parseFloat(client.platform_fee_fixed)
  };
  
  await db.query(
    `UPDATE clients SET
      platform_fee_percent = $2,
      platform_fee_fixed = $3,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [clientId, feePercent, feeFixed]
  );
  
  logger.info('Platform fees updated', {
    clientId,
    oldFees,
    newFees: { percent: feePercent, fixed: feeFixed },
    updatedBy
  });
  
  return getClientById(clientId);
}

// ============================================
// CLIENT REVENUE & STATS
// ============================================

/**
 * Get client revenue summary
 */
export async function getClientRevenue(clientId, dateRange = {}) {
  const { startDate, endDate } = dateRange;
  
  let sql = `
    SELECT 
      COUNT(o.id) as total_orders,
      COALESCE(SUM(o.total_price), 0) as gross_revenue,
      COALESCE(SUM(o.platform_fee_amount), 0) as platform_fees,
      COALESCE(SUM(o.client_revenue), 0) as net_revenue,
      COUNT(DISTINCT o.buyer_email) as unique_customers
    FROM orders o
    JOIN events e ON e.id = o.event_id
    WHERE e.client_id = $1 
      AND o.status = 'paid'
      AND o.is_test = false
  `;
  
  const params = [clientId];
  
  if (startDate) {
    params.push(startDate);
    sql += ` AND o.created_at >= $${params.length}`;
  }
  
  if (endDate) {
    params.push(endDate);
    sql += ` AND o.created_at <= $${params.length}`;
  }
  
  return db.queryOne(sql, params);
}

/**
 * Get client events summary
 */
export async function getClientEvents(clientId, includeTest = false) {
  let sql = `
    SELECT 
      e.*,
      COUNT(DISTINCT CASE WHEN o.status = 'paid' THEN o.id END) as paid_orders,
      COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.quantity ELSE 0 END), 0) as tickets_sold,
      COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_price ELSE 0 END), 0) as total_revenue
    FROM events e
    LEFT JOIN orders o ON o.event_id = e.id ${includeTest ? '' : 'AND o.is_test = false'}
    WHERE e.client_id = $1
  `;
  
  if (!includeTest) {
    sql += ` AND e.is_test = false`;
  }
  
  sql += `
    GROUP BY e.id
    ORDER BY e.event_date DESC
  `;
  
  return db.queryAll(sql, [clientId]);
}

/**
 * Validate client code (for signup)
 */
export async function validateClientCode(clientCode) {
  const client = await getClientByCode(clientCode);
  
  if (!client) {
    return { valid: false, error: 'INVALID_CODE' };
  }
  
  if (client.status !== 'active') {
    return { valid: false, error: 'CLIENT_INACTIVE' };
  }
  
  return { 
    valid: true, 
    client: {
      id: client.id,
      name: client.name,
      slug: client.slug
    }
  };
}

export default {
  createClient,
  getClientById,
  getClientByCode,
  getClientBySlug,
  listClients,
  updateClient,
  updatePlatformFees,
  getClientRevenue,
  getClientEvents,
  validateClientCode,
  generateClientCode
};
