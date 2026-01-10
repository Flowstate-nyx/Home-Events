/**
 * Database Migration Runner
 * Runs SQL migrations in order
 */

const fs = require('fs');
const path = require('path');
const { query } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  console.log('[MIGRATE] Starting migrations...');
  
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('[MIGRATE] No migrations directory found');
    return;
  }
  
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  for (const file of files) {
    console.log(`[MIGRATE] Running: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    
    try {
      await query(sql);
      console.log(`[MIGRATE] Completed: ${file}`);
    } catch (err) {
      // Ignore "already exists" errors
      if (err.code === '42P07' || err.code === '42710' || err.code === '42P16') {
        console.log(`[MIGRATE] ${file} - objects already exist, continuing`);
      } else {
        console.error(`[MIGRATE] FAILED: ${file}`);
        console.error(err.message);
        throw err;
      }
    }
  }
  
  console.log('[MIGRATE] All migrations completed');
}

// Run if called directly
if (require.main === module) {
  require('../config/env').validateEnv();
  require('./pool').initPool();
  
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigrations };
