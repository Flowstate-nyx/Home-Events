/**
 * HOME PRODUCTIONS BACKEND v4.0
 * Production-safe ticketing system
 * 
 * Features:
 * - JWT authentication with refresh tokens
 * - PostgreSQL with transactional inventory
 * - Email outbox pattern
 * - Atomic check-in
 * - Cloudinary image upload
 * - Audit logging
 */

// Load environment FIRST
const { validateEnv, getConfig } = require('./config/env');
validateEnv();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const db = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const auth = require('./middleware/auth');
const { createLimiter, createAuthLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const emailService = require('./services/email');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const eventsRoutes = require('./routes/events');
const ordersRoutes = require('./routes/orders');
const checkinRoutes = require('./routes/checkin');
const webhookRoutes = require('./routes/webhook');
const galleryRoutes = require('./routes/gallery');
const newsletterRoutes = require('./routes/newsletter');
const adminRoutes = require('./routes/admin');

const app = express();
const config = getConfig();

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS
app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy
app.set('trust proxy', 1);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug('Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration
    });
  });
  next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  const dbHealth = await db.healthCheck();
  
  res.json({
    status: dbHealth.status,
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    database: dbHealth,
    email: emailService.isConfigured() ? 'configured' : 'not_configured',
    cloudinary: config.cloudinary.configured ? 'configured' : 'not_configured'
  });
});

// ============================================
// API ROUTES
// ============================================

// Rate limiting
app.use('/api/auth', createAuthLimiter());
app.use('/api', createLimiter());

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/newsletter', newsletterRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Legacy compatibility routes
app.post('/api/admin/mark-paid', auth.requireAuth, require('./routes/admin/orders').router?.handle || ((req, res, next) => next()));

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// STARTUP
// ============================================

async function start() {
  try {
    logger.info('Starting server...');
    
    // Initialize database
    logger.info('Connecting to database...');
    db.initPool();
    const connected = await db.testConnection();
    
    if (!connected) {
      throw new Error('Database connection failed');
    }
    
    // Run migrations
    logger.info('Running migrations...');
    await runMigrations();
    
    // Initialize default admin
    logger.info('Checking default admin...');
    await auth.initDefaultAdmin();
    
    // Initialize email transporter
    if (emailService.isConfigured()) {
      emailService.initTransporter();
    }
    
    // Start token cleanup interval
    setInterval(() => {
      auth.cleanupTokens().catch(err => {
        logger.error('Token cleanup failed', { error: err.message });
      });
    }, 60 * 60 * 1000); // Every hour
    
    // Start email processing interval
    setInterval(async () => {
      if (emailService.isConfigured()) {
        try {
          await emailService.processPendingEmails(db, 10);
        } catch (err) {
          logger.error('Email processing failed', { error: err.message });
        }
      }
    }, 30 * 1000); // Every 30 seconds
    
    // Start server
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info('Server started', { 
        port: config.port,
        env: config.nodeEnv,
        version: '4.0.0'
      });
      
      console.log(`
╔═══════════════════════════════════════════════════╗
║     HOME PRODUCTIONS BACKEND v4.0                 ║
║     Running on port ${config.port}                         ║
╠═══════════════════════════════════════════════════╣
║  Public:                                          ║
║  GET  /health              Health check           ║
║  GET  /api/events          List events            ║
║  POST /api/orders          Create order           ║
║  POST /api/checkin         Check-in               ║
╠═══════════════════════════════════════════════════╣
║  Auth:                                            ║
║  POST /api/auth/login      Login                  ║
║  POST /api/auth/refresh    Refresh token          ║
║  POST /api/auth/logout     Logout                 ║
╠═══════════════════════════════════════════════════╣
║  Admin (JWT required):                            ║
║  /api/admin/events         Event management       ║
║  /api/admin/orders         Order management       ║
║  /api/admin/upload         Image upload           ║
║  /api/admin/stats          Dashboard              ║
╚═══════════════════════════════════════════════════╝
      `);
    });
    
    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        await db.closePool();
        logger.info('Database pool closed');
        process.exit(0);
      });
      
      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (err) {
    logger.error('Startup failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();
