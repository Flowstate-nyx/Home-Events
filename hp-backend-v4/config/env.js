/**
 * Environment Configuration
 * App CRASHES on boot if required vars are missing
 */

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
];

const OPTIONAL_VARS = {
  PORT: '8080',
  NODE_ENV: 'production',
  CORS_ORIGIN: '*',
  
  // Email (optional but recommended)
  EMAIL_HOST: '',
  EMAIL_PORT: '465',
  EMAIL_USER: '',
  EMAIL_PASS: '',
  EMAIL_FROM: '',
  
  // Cloudinary (optional)
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  
  // Admin defaults
  DEFAULT_ADMIN_EMAIL: '',
  DEFAULT_ADMIN_PASSWORD: '',
  
  // Token expiry
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES_DAYS: '7',
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX: '100',
  AUTH_RATE_LIMIT_MAX: '10'
};

function validateEnv() {
  const missing = [];
  
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    console.error('═══════════════════════════════════════════════════════');
    console.error('FATAL: Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    console.error('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
  
  // Set defaults for optional vars
  for (const [key, defaultValue] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[key]) {
      process.env[key] = defaultValue;
    }
  }
  
  // Validate JWT_SECRET length
  if (process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }
  
  if (process.env.JWT_REFRESH_SECRET.length < 32) {
    console.error('FATAL: JWT_REFRESH_SECRET must be at least 32 characters');
    process.exit(1);
  }
}

function getConfig() {
  return {
    port: parseInt(process.env.PORT, 10),
    nodeEnv: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN,
    
    database: {
      url: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    },
    
    jwt: {
      secret: process.env.JWT_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      accessExpires: process.env.JWT_ACCESS_EXPIRES,
      refreshExpiresDays: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS, 10)
    },
    
    email: {
      configured: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS),
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER
    },
    
    cloudinary: {
      configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET
    },
    
    admin: {
      defaultEmail: process.env.DEFAULT_ADMIN_EMAIL,
      defaultPassword: process.env.DEFAULT_ADMIN_PASSWORD
    },
    
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10),
      max: parseInt(process.env.RATE_LIMIT_MAX, 10),
      authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10)
    }
  };
}

module.exports = { validateEnv, getConfig };
