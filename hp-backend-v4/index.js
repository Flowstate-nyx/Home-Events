/**
 * Home Productions Backend v4.0
 * Production-ready Event Ticketing System
 * 
 * ES MODULE VERSION
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Config
import { validateEnv, getConfig } from './config/env.js';

// Database
import * as db from './db/pool.js';
import { runMigrations } from './db/migrate.js';

// Middleware
import { requireAuth, initDefaultAdmin, cleanupTokens } from './middleware/auth.js';
import { createLimiter, createAuthLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Services
import * as emailService from './services/email.js';

// Routes
import authRoutes from './routes/auth.js';
import eventsRoutes from './routes/events.js';
import ordersRoutes from './routes/orders.js';
import checkinRoutes from './routes/checkin.js';
import webhookRoutes from './routes/webhook.js';
import galleryRoutes from './routes/gallery.js';
import newsletterRoutes from './routes/newsletter.js';
import adminRoutes from './routes/admin/index.js';

// Logger
import logger from './utils/logger.js';

// ============================================
// STARTUP
// ============================================

// Validate environment (crashes if missing required vars)
validateEnv();

const config = getConfig();
const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS
app.use(cors({
  origin: [
  'https://admin.homeproductions.art',
  'https://homeproductions.art'
],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/auth', createAuthLimiter());
app.use('/api', createLimiter());

// Trust proxy (Railway)
app.set('trust proxy', 1);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  const dbHealth = await db.healthCheck();
  
  res.json({
    status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    database: dbHealth,
    email: config.email.configured ? 'configured' : 'not_configured',
    cloudinary: config.cloudinary.configured ? 'configured' : 'not_configured'
  });
});

// ============================================
// ROUTES
// ============================================

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/newsletter', newsletterRoutes);

// Admin routes (protected)
app.use('/api/admin', adminRoutes);

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// BACKGROUND JOBS
// ============================================

let tokenCleanupInterval = null;
let emailProcessInterval = null;

function startBackgroundJobs() {
  // Token cleanup every hour
  tokenCleanupInterval = setInterval(() => {
    cleanupTokens().catch(err => {
      logger.error('Token cleanup failed', { error: err.message });
    });
  }, 60 * 60 * 1000);
  
  // Email processing every 30 seconds
  if (config.email.configured) {
    emailService.initTransporter();
    
    emailProcessInterval = setInterval(() => {
      emailService.processPendingEmails(db, 10).catch(err => {
        logger.error('Email processing failed', { error: err.message });
      });
    }, 30 * 1000);
  }
  
  logger.info('Background jobs started');
}

function stopBackgroundJobs() {
  if (tokenCleanupInterval) {
    clearInterval(tokenCleanupInterval);
    tokenCleanupInterval = null;
  }
  if (emailProcessInterval) {
    clearInterval(emailProcessInterval);
    emailProcessInterval = null;
  }
  logger.info('Background jobs stopped');
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  stopBackgroundJobs();
  
  await db.closePool();
  
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================
// START SERVER
// ============================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectWithRetry(maxRetries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Database connection attempt ${attempt}/${maxRetries}...`);
    
    const connected = await db.testConnection();
    
    if (connected) {
      console.log('✅ Database connected successfully!');
      return true;
    }
    
    if (attempt < maxRetries) {
      console.log(`Retrying in ${delayMs/1000} seconds...`);
      await sleep(delayMs);
    }
  }
  
  console.error('❌ All database connection attempts failed!');
  return false;
}

async function start() {
  try {
    console.log('Starting Home Productions Backend v4.0...');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    
    // Initialize database pool
    db.initPool();
    
    // Test connection with retry
    const connected = await connectWithRetry(5, 3000);
    if (!connected) {
      logger.error('Database connection failed after all retries');
      process.exit(1);
    }
    
    // Run migrations
    await runMigrations();
    
    // Create default admin if configured
    await initDefaultAdmin();
    
    // Start background jobs
    startBackgroundJobs();
    
    // Start server
    const server = app.listen(config.port, () => {
      logger.info('Server started', {
        port: config.port,
        env: config.nodeEnv,
        cors: config.corsOrigin,
        email: config.email.configured ? 'enabled' : 'disabled',
        cloudinary: config.cloudinary.configured ? 'enabled' : 'disabled'
      });
      
      console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🏠 HOME PRODUCTIONS BACKEND v4.0                       ║
║                                                          ║
║   Status: RUNNING                                        ║
║   Port: ${config.port}                                          ║
║   Environment: ${config.nodeEnv.padEnd(41)}║
║                                                          ║
║   Health: http://localhost:${config.port}/health                 ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
      `);
    });
    
    // Handle server errors
    server.on('error', (err) => {
      logger.error('Server error', { error: err.message });
      process.exit(1);
    });
    
  } catch (err) {
    logger.error('Startup failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Run
start();
