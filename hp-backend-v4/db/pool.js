/**
 * PostgreSQL Connection Pool
 * Production-ready with proper error handling
 */

import pg from 'pg';
import logger from '../utils/logger.js';

const { Pool } = pg;

let pool = null;

/**
 * Initialize connection pool
 */
export function initPool() {
  if (pool) {
    console.log('Pool already initialized');
    return pool;
  }
  
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  console.log('Initializing database pool with Railway configuration...');
  
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  
  pool.on('error', (err, client) => {
    console.error('Unexpected pool error:', err.message);
    logger.error('Unexpected pool error', { error: err.message, stack: err.stack });
  });
  
  pool.on('connect', (client) => {
    console.log('New database client connected');
    logger.debug('New database client connected');
  });
  
  return pool;
}

/**
 * Get pool instance
 */
export function getPool() {
  if (!pool) {
    throw new Error('Pool not initialized. Call initPool() first.');
  }
  return pool;
}

/**
 * Execute query
 */
export async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Query failed', { 
      error: err.message, 
      code: err.code,
      query: text.substring(0, 100)
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get single row
 */
export async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/**
 * Get all rows
 */
export async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Execute transaction
 */
export async function transaction(callback) {
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
 * Test connection with detailed error logging
 */
export async function testConnection() {
  let client;
  
  try {
    const DATABASE_URL = process.env.DATABASE_URL;
    
    if (!DATABASE_URL) {
      console.error('❌ FATAL: DATABASE_URL environment variable is not set!');
      return false;
    }
    
    // Mask password in log
    const maskedUrl = DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
    console.log('Attempting database connection to:', maskedUrl);
    
    console.log('Getting client from pool...');
    client = await pool.connect();
    console.log('✅ Client acquired from pool');
    
    console.log('Executing test query...');
    const result = await client.query('SELECT NOW() as now, current_database() as db, version() as version');
    
    console.log('✅ Database connected successfully to:', result.rows[0].db);
    console.log('   PostgreSQL version:', result.rows[0].version.split(',')[0]);
    console.log('   Server time:', result.rows[0].now);
    
    logger.info('Database connected', { 
      database: result.rows[0].db, 
      time: result.rows[0].now 
    });
    
    return true;
    
  } catch (err) {
    console.error('❌ Database connection test failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error Details:');
    console.error('  Name:', err.name);
    console.error('  Message:', err.message);
    console.error('  Code:', err.code);
    console.error('  Detail:', err.detail || 'N/A');
    console.error('  Hint:', err.hint || 'N/A');
    console.error('  Position:', err.position || 'N/A');
    console.error('  Where:', err.where || 'N/A');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Full Error Object:', JSON.stringify(err, null, 2));
    console.error('Stack Trace:', err.stack);
    
    logger.error('Database connection failed', { 
      error: err.message, 
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      stack: err.stack
    });
    
    return false;
    
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Health check
 */
export async function healthCheck() {
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
export async function closePool() {
  if (pool) {
    logger.info('Closing database pool');
    await pool.end();
    pool = null;
  }
}

export default {
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