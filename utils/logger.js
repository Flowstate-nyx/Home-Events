/**
 * Structured Logger
 * JSON output for production
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

function log(level, message, data = {}) {
  if (LOG_LEVELS[level] > CURRENT_LEVEL) return;
  
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...data
  };
  
  // Remove undefined values
  Object.keys(entry).forEach(key => {
    if (entry[key] === undefined) delete entry[key];
  });
  
  const output = JSON.stringify(entry);
  
  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}

const logger = {
  error: (msg, data) => log('error', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  info: (msg, data) => log('info', msg, data),
  debug: (msg, data) => log('debug', msg, data)
};

export default logger;
