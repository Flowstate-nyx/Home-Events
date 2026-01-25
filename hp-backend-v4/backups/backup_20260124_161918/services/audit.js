/**
 * Audit Service
 * Logs all admin actions for accountability
 */

import * as db from '../db/pool.js';
import logger from '../utils/logger.js';

/**
 * Log an audit event
 */
export async function log(action, entityType, entityId, data = {}) {
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
export async function getLogs(filters = {}) {
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
export const logLogin = (userId, ip, ua) => log('LOGIN', 'user', userId, { userId, ipAddress: ip, userAgent: ua });
export const logLogout = (userId) => log('LOGOUT', 'user', userId, { userId });
export const logEventCreate = (eventId, userId, data) => log('CREATE', 'event', eventId, { userId, newValue: data });
export const logEventUpdate = (eventId, userId, oldData, newData) => log('UPDATE', 'event', eventId, { userId, oldValue: oldData, newValue: newData });
export const logEventDelete = (eventId, userId, oldData) => log('DELETE', 'event', eventId, { userId, oldValue: oldData });
export const logOrderStatusChange = (orderId, userId, oldStatus, newStatus) => log('STATUS_CHANGE', 'order', orderId, { userId, oldValue: { status: oldStatus }, newValue: { status: newStatus } });
export const logCheckin = (orderId, userId) => log('CHECKIN', 'order', orderId, { userId });

export default {
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
