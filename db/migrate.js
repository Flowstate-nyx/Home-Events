/**
 * Database Migration Runner
 * Runs SQL migrations in order
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations() {
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
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { validateEnv } = await import('../config/env.js');
  const { initPool } = await import('./pool.js');
  
  validateEnv();
  initPool();
  
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
