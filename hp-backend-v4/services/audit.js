/**
 * Audit Service
 * Logs all admin actions for accountability
 */

const db = require('../db/pool');
const logger = require('../utils/logger');

/**
 * Log an audit event
 */
async function log(action, entityType, entityId, data = {}) {
  const { userId, oldValue, newValue, ipAddress, userAgent } = data;
  
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId || null,
        action,
        entityType,
        entityId || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress || null,
        userAgent || null
      ]
    );
    
    logger.debug('Audit logged', { action, entityType, entityId });
  } catch (err) {
    logger.error('Audit log failed', { error: err.message, action, entityType });
  }
}

/**
 * Get audit logs with filters
 */
async function getLogs(filters = {}) {
  const { userId, entityType, entityId, action, limit = 100, offset = 0 } = filters;
  
  let sql = `
    SELECT al.*, u.email as user_email, u.name as user_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
  `;
  
  const conditions = [];
  const params = [];
  
  if (userId) {
    params.push(userId);
    conditions.push(`al.user_id = $${params.length}`);
  }
  
  if (entityType) {
    params.push(entityType);
    conditions.push(`al.entity_type = $${params.length}`);
  }
  
  if (entityId) {
    params.push(entityId);
    conditions.push(`al.entity_id = $${params.length}`);
  }
  
  if (action) {
    params.push(action);
    conditions.push(`al.action = $${params.length}`);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  return db.queryAll(sql, params);
}

// Convenience methods
const logLogin = (userId, ip, ua) => log('LOGIN', 'user', userId, { userId, ipAddress: ip, userAgent: ua });
const logLogout = (userId) => log('LOGOUT', 'user', userId, { userId });
const logEventCreate = (eventId, userId, data) => log('CREATE', 'event', eventId, { userId, newValue: data });
const logEventUpdate = (eventId, userId, oldData, newData) => log('UPDATE', 'event', eventId, { userId, oldValue: oldData, newValue: newData });
const logEventDelete = (eventId, userId, oldData) => log('DELETE', 'event', eventId, { userId, oldValue: oldData });
const logOrderStatusChange = (orderId, userId, oldStatus, newStatus) => log('STATUS_CHANGE', 'order', orderId, { userId, oldValue: { status: oldStatus }, newValue: { status: newStatus } });
const logCheckin = (orderId, userId) => log('CHECKIN', 'order', orderId, { userId });

module.exports = {
  log,
  getLogs,
  logLogin,
  logLogout,
  logEventCreate,
  logEventUpdate,
  logEventDelete,
  logOrderStatusChange,
  logCheckin
};
