/**
 * Customer Service (CRM)
 * Customer database management derived from orders
 * 
 * TASK 7: CRM / Customer Database
 * - Customers derived from orders (not created separately)
 * - Test customers flagged separately
 * - Customer tiers based on spending
 */

import * as db from '../db/pool.js';
import logger from '../utils/logger.js';

// ============================================
// CUSTOMER TIER THRESHOLDS
// ============================================

const TIER_THRESHOLDS = {
  vip: 1000,
  platinum: 500,
  gold: 250,
  silver: 100,
  bronze: 0
};

/**
 * Calculate customer tier based on total spending
 */
function calculateTier(totalSpent) {
  const spent = parseFloat(totalSpent) || 0;
  if (spent >= TIER_THRESHOLDS.vip) return 'vip';
  if (spent >= TIER_THRESHOLDS.platinum) return 'platinum';
  if (spent >= TIER_THRESHOLDS.gold) return 'gold';
  if (spent >= TIER_THRESHOLDS.silver) return 'silver';
  return 'bronze';
}

// ============================================
// CUSTOMER UPSERT (From Orders)
// ============================================

/**
 * Upsert customer from order (within transaction)
 * Called when payment is confirmed
 * 
 * @param {Object} client - Database transaction client
 * @param {Object} data - Customer data from order
 * @returns {UUID} - Customer ID
 */
export async function upsertCustomerFromOrder(client, data) {
  const { email, name, phone, clientId, orderTotal } = data;
  
  if (!email) {
    logger.warn('Cannot upsert customer: no email provided');
    return null;
  }
  
  // Check for existing customer
  const existing = await client.query(
    `SELECT id, total_orders, total_spent, tier 
     FROM customers 
     WHERE email = $1 AND (client_id = $2 OR (client_id IS NULL AND $2 IS NULL))`,
    [email, clientId]
  );
  
  if (existing.rows.length > 0) {
    // Update existing customer
    const customer = existing.rows[0];
    const newTotalOrders = customer.total_orders + 1;
    const newTotalSpent = parseFloat(customer.total_spent) + parseFloat(orderTotal || 0);
    const newTier = calculateTier(newTotalSpent);
    const tierChanged = newTier !== customer.tier;
    
    await client.query(
      `UPDATE customers SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        total_orders = $4,
        total_spent = $5,
        last_order_at = CURRENT_TIMESTAMP,
        tier = $6,
        tier_updated_at = CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE tier_updated_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        customer.id,
        name,
        phone,
        newTotalOrders,
        newTotalSpent,
        newTier,
        tierChanged
      ]
    );
    
    logger.info('Customer updated', {
      customerId: customer.id,
      email,
      totalOrders: newTotalOrders,
      tier: newTier
    });
    
    return customer.id;
  }
  
  // Create new customer
  const result = await client.query(
    `INSERT INTO customers (
      email, name, phone, client_id,
      total_orders, total_spent,
      first_order_at, last_order_at,
      tier, tier_updated_at,
      is_test_customer
    ) VALUES ($1, $2, $3, $4, 1, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP, false)
    RETURNING id`,
    [
      email,
      name,
      phone,
      clientId,
      orderTotal || 0,
      calculateTier(orderTotal || 0)
    ]
  );
  
  logger.info('Customer created', {
    customerId: result.rows[0].id,
    email,
    clientId
  });
  
  return result.rows[0].id;
}

/**
 * Upsert test customer (within transaction)
 * Called when test order is created
 * 
 * @param {Object} client - Database transaction client
 * @param {Object} data - Test customer data
 * @returns {UUID} - Customer ID
 */
export async function upsertTestCustomer(client, data) {
  const { email, name, phone } = data;
  const defaultClientId = '00000000-0000-0000-0000-000000000001';
  
  if (!email) {
    logger.warn('Cannot upsert test customer: no email provided');
    return null;
  }
  
  // Check for existing customer
  const existing = await client.query(
    `SELECT id FROM customers WHERE email = $1 AND client_id = $2`,
    [email, defaultClientId]
  );
  
  if (existing.rows.length > 0) {
    // Update existing to mark as test customer
    await client.query(
      `UPDATE customers SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        is_test_customer = true,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [existing.rows[0].id, name, phone]
    );
    
    return existing.rows[0].id;
  }
  
  // Create new test customer
  const result = await client.query(
    `INSERT INTO customers (
      email, name, phone, client_id,
      total_orders, total_spent,
      first_order_at, last_order_at,
      tier, is_test_customer
    ) VALUES ($1, $2, $3, $4, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'bronze', true)
    RETURNING id`,
    [email, name, phone, defaultClientId]
  );
  
  logger.info('Test customer created', {
    customerId: result.rows[0].id,
    email
  });
  
  return result.rows[0].id;
}

// ============================================
// CUSTOMER QUERIES
// ============================================

/**
 * Get customer by ID
 */
export async function getCustomerById(customerId) {
  return db.queryOne(
    `SELECT c.*, cl.name as client_name
     FROM customers c
     LEFT JOIN clients cl ON cl.id = c.client_id
     WHERE c.id = $1`,
    [customerId]
  );
}

/**
 * Get customer by email (within client scope)
 */
export async function getCustomerByEmail(email, clientId = null) {
  return db.queryOne(
    `SELECT c.*, cl.name as client_name
     FROM customers c
     LEFT JOIN clients cl ON cl.id = c.client_id
     WHERE c.email = $1 
     AND (c.client_id = $2 OR (c.client_id IS NULL AND $2 IS NULL))`,
    [email, clientId]
  );
}

/**
 * List customers with filters
 * @param {Object} filters - Query filters
 */
export async function listCustomers(filters = {}) {
  const {
    clientId,
    tier,
    search,
    includeTest = false,
    limit = 100,
    offset = 0,
    sortBy = 'last_order_at',
    sortOrder = 'DESC'
  } = filters;
  
  let sql = `
    SELECT c.*, cl.name as client_name
    FROM customers c
    LEFT JOIN clients cl ON cl.id = c.client_id
  `;
  
  const conditions = [];
  const params = [];
  
  // Exclude test customers by default
  if (!includeTest) {
    conditions.push(`c.is_test_customer = false`);
  }
  
  if (clientId) {
    params.push(clientId);
    conditions.push(`c.client_id = $${params.length}`);
  }
  
  if (tier) {
    params.push(tier);
    conditions.push(`c.tier = $${params.length}`);
  }
  
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(c.email ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  // Validate sort column
  const validSortColumns = ['email', 'name', 'total_orders', 'total_spent', 'tier', 'first_order_at', 'last_order_at', 'created_at'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'last_order_at';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  sql += ` ORDER BY c.${sortColumn} ${order} NULLS LAST`;
  sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return db.queryAll(sql, params);
}

/**
 * Get customer orders
 */
export async function getCustomerOrders(customerId, includeTest = false) {
  let sql = `
    SELECT o.*, e.name as event_name, t.name as tier_name
    FROM orders o
    JOIN events e ON e.id = o.event_id
    JOIN ticket_tiers t ON t.id = o.tier_id
    WHERE o.customer_id = $1
  `;
  
  if (!includeTest) {
    sql += ` AND o.is_test = false`;
  }
  
  sql += ` ORDER BY o.created_at DESC`;
  
  return db.queryAll(sql, [customerId]);
}

/**
 * Get customer statistics
 */
export async function getCustomerStats(clientId = null, includeTest = false) {
  let sql = `
    SELECT 
      COUNT(*) as total_customers,
      COUNT(CASE WHEN tier = 'bronze' THEN 1 END) as bronze_count,
      COUNT(CASE WHEN tier = 'silver' THEN 1 END) as silver_count,
      COUNT(CASE WHEN tier = 'gold' THEN 1 END) as gold_count,
      COUNT(CASE WHEN tier = 'platinum' THEN 1 END) as platinum_count,
      COUNT(CASE WHEN tier = 'vip' THEN 1 END) as vip_count,
      COALESCE(SUM(total_spent), 0) as total_revenue,
      COALESCE(AVG(total_spent), 0) as avg_spent,
      COALESCE(AVG(total_orders), 0) as avg_orders
    FROM customers
    WHERE 1=1
  `;
  
  const params = [];
  
  if (!includeTest) {
    sql += ` AND is_test_customer = false`;
  }
  
  if (clientId) {
    params.push(clientId);
    sql += ` AND client_id = $${params.length}`;
  }
  
  return db.queryOne(sql, params);
}

// ============================================
// CUSTOMER MANAGEMENT
// ============================================

/**
 * Update customer notes/tags
 */
export async function updateCustomer(customerId, updates) {
  const { notes, tags, metadata } = updates;
  
  const fields = [];
  const params = [customerId];
  
  if (notes !== undefined) {
    params.push(notes);
    fields.push(`notes = $${params.length}`);
  }
  
  if (tags !== undefined) {
    params.push(tags);
    fields.push(`tags = $${params.length}`);
  }
  
  if (metadata !== undefined) {
    params.push(JSON.stringify(metadata));
    fields.push(`metadata = $${params.length}::jsonb`);
  }
  
  if (fields.length === 0) {
    return getCustomerById(customerId);
  }
  
  await db.query(
    `UPDATE customers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    params
  );
  
  return getCustomerById(customerId);
}

/**
 * Recalculate customer stats from orders
 * Useful for fixing data inconsistencies
 */
export async function recalculateCustomerStats(customerId) {
  return db.transaction(async (client) => {
    // Get order stats
    const stats = await client.query(
      `SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_price ELSE 0 END), 0) as total_spent,
        MIN(created_at) as first_order_at,
        MAX(created_at) as last_order_at
       FROM orders
       WHERE customer_id = $1 AND is_test = false`,
      [customerId]
    );
    
    const data = stats.rows[0];
    const newTier = calculateTier(data.total_spent);
    
    await client.query(
      `UPDATE customers SET
        total_orders = $2,
        total_spent = $3,
        first_order_at = $4,
        last_order_at = $5,
        tier = $6,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        customerId,
        parseInt(data.total_orders) || 0,
        parseFloat(data.total_spent) || 0,
        data.first_order_at,
        data.last_order_at,
        newTier
      ]
    );
    
    logger.info('Customer stats recalculated', { customerId, newTier });
    
    return getCustomerById(customerId);
  });
}

export default {
  upsertCustomerFromOrder,
  upsertTestCustomer,
  getCustomerById,
  getCustomerByEmail,
  listCustomers,
  getCustomerOrders,
  getCustomerStats,
  updateCustomer,
  recalculateCustomerStats,
  calculateTier
};
