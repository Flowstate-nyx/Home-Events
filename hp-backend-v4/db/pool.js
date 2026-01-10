/**
 * PostgreSQL Connection Pool
 * Production-ready with proper error handling
 */

const { Pool } = require('pg');
const { getConfig } = require('../config/env');
const logger = require('../utils/logger');

let pool = null;

/**
 * Initialize connection pool
 */
function initPool() {
  if (pool) return pool;
  
  const config = getConfig();
  
  pool = new Pool({
    connectionString: config.database.url,
    ssl: config.database.ssl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
  
  pool.on('error', (err) => {
    logger.error('Unexpected pool error', { error: err.message });
  });
  
  pool.on('connect', () => {
    logger.debug('New database client connected');
  });
  
  return pool;
}

/**
 * Get pool instance
 */
function getPool() {
  if (!pool) {
    initPool();
  }
  return pool;
}

/**
 * Execute query
 */
async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { duration, rows: result.rowCount });
    return result;
  } finally {
    client.release();
  }
}

/**
 * Get single row
 */
async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/**
 * Get all rows
 */
async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Execute transaction
 */
async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test connection
 */
async function testConnection() {
  try {
    const result = await queryOne('SELECT NOW() as now, current_database() as db');
    logger.info('Database connected', { database: result.db, time: result.now });
    return true;
  } catch (err) {
    logger.error('Database connection failed', { error: err.message });
    return false;
  }
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    await queryOne('SELECT 1');
    return {
      status: 'healthy',
      connected: true,
      pool: {
        total: pool?.totalCount || 0,
        idle: pool?.idleCount || 0,
        waiting: pool?.waitingCount || 0
      }
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      connected: false,
      error: err.message
    };
  }
}

/**
 * Close pool (graceful shutdown)
 */
async function closePool() {
  if (pool) {
    logger.info('Closing database pool');
    await pool.end();
    pool = null;
  }
}

module.exports = {
  initPool,
  getPool,
  query,
  queryOne,
  queryAll,
  transaction,
  testConnection,
  healthCheck,
  closePool
};
