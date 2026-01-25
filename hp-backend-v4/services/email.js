/**
 * Email Service v2.0
 * Outbox pattern with test email support
 * 
 * BACKWARDS COMPATIBILITY:
 * - All existing functions preserved
 * - Test emails clearly marked with [TEST] prefix
 * - Test emails sent immediately (not queued)
 */

import nodemailer from 'nodemailer';
import { getConfig } from '../config/env.js';
import * as qrService from './qr.js';
import logger from '../utils/logger.js';

let transporter = null;

// ============================================
// TRANSPORTER INITIALIZATION
// ============================================

/**
 * Initialize email transporter
 */
export function initTransporter() {
  const config = getConfig();
  
  if (!config.email.configured) {
    logger.warn('Email not configured - emails will be queued but not sent');
    return null;
  }
  
  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.pass
    },
    tls: { rejectUnauthorized: false }
  });
  
  logger.info('Email transporter initialized', { host: config.email.host });
  return transporter;
}

// ============================================
// STANDARD TICKET EMAIL (EXISTING)
// ============================================

/**
 * Queue ticket email in outbox
 * Does NOT send immediately - just queues
 * @param {Object} db - Database module
 * @param {Object} order - Order object
 */
export async function queueTicketEmail(db, order) {
  // Check if email already queued
  const existing = await db.queryOne(
    `SELECT id FROM email_outbox 
     WHERE order_id = $1 AND email_type = 'ticket'`,
    [order.id]
  );
  
  if (existing) {
    logger.warn('Ticket email already queued', { orderId: order.id });
    return existing.id;
  }
  
  const result = await db.queryOne(
    `INSERT INTO email_outbox (order_id, email_type, recipient_email, subject)
     VALUES ($1, 'ticket', $2, $3)
     RETURNING id`,
    [
      order.id,
      order.buyer_email,
      `🎫 Your Ticket: ${order.event_name}`
    ]
  );
  
  logger.info('Ticket email queued', { 
    orderId: order.id, 
    emailId: result.id 
  });
  
  return result.id;
}

/**
 * Process pending emails from outbox
 * UPDATED: Excludes test orders (they use sendTestTicketEmail directly)
 * @param {Object} db - Database module
 * @param {number} limit - Max emails to process
 */
export async function processPendingEmails(db, limit = 10) {
  const config = getConfig();
  
  if (!config.email.configured) {
    logger.debug('Email not configured, skipping processing');
    return { processed: 0, sent: 0, failed: 0 };
  }
  
  if (!transporter) {
    initTransporter();
  }
  
  // Get pending emails (EXCLUDE test orders)
  const pending = await db.queryAll(
    `SELECT e.*, o.order_number, o.buyer_name, o.buyer_email, o.quantity,
            o.qr_code_hash, o.is_test,
            ev.name as event_name, ev.event_date, ev.event_time, ev.location,
            t.name as tier_name
     FROM email_outbox e
     JOIN orders o ON o.id = e.order_id
     JOIN events ev ON ev.id = o.event_id
     JOIN ticket_tiers t ON t.id = o.tier_id
     WHERE e.status IN ('pending', 'failed')
       AND e.attempts < 5
       AND o.status = 'paid'
       AND o.is_test = false
     ORDER BY e.created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  
  let sent = 0;
  let failed = 0;
  
  for (const email of pending) {
    try {
      // Mark as processing
      await db.query(
        `UPDATE email_outbox 
         SET status = 'processing', 
             attempts = attempts + 1,
             last_attempt_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [email.id]
      );
      
      // Generate QR code for email
      const qrDataUrl = await qrService.generateQRDataUrl(
        {
          orderNumber: email.order_number,
          eventName: email.event_name,
          tierName: email.tier_name
        },
        email.order_number
      );
      
      // Send email
      const html = generateTicketEmailHtml({
        buyerName: email.buyer_name,
        eventName: email.event_name,
        eventDate: email.event_date,
        eventTime: email.event_time,
        location: email.location,
        tierName: email.tier_name,
        orderNumber: email.order_number,
        qrDataUrl
      });
      
      await transporter.sendMail({
        from: `"Home Productions" <${config.email.from}>`,
        to: email.buyer_email,
        subject: email.subject,
        html,
        attachments: [{
          filename: 'ticket-qr.png',
          content: qrDataUrl.split(',')[1],
          encoding: 'base64',
          cid: 'qrcode'
        }]
      });
      
      // Mark as sent
      await db.query(
        `UPDATE email_outbox 
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [email.id]
      );
      
      logger.info('Email sent', { 
        emailId: email.id, 
        orderId: email.order_id,
        recipient: email.buyer_email 
      });
      
      sent++;
    } catch (err) {
      // Mark as failed
      await db.query(
        `UPDATE email_outbox 
         SET status = 'failed', error_message = $2
         WHERE id = $1`,
        [email.id, err.message]
      );
      
      logger.error('Email send failed', { 
        emailId: email.id, 
        error: err.message 
      });
      
      failed++;
    }
  }
  
  return { processed: pending.length, sent, failed };
}

// ============================================
// TEST TICKET EMAIL (TASK 5)
// ============================================

/**
 * Send test ticket email IMMEDIATELY
 * Does not queue - sends directly
 * Clearly marked with [TEST] prefix
 * 
 * @param {Object} db - Database module
 * @param {Object} order - Test order object
 * @returns {boolean} - Whether email was sent
 */
export async function sendTestTicketEmail(db, order) {
  const config = getConfig();
  
  if (!config.email.configured) {
    logger.warn('Email not configured, test email not sent', { orderId: order.id });
    return false;
  }
  
  if (!transporter) {
    initTransporter();
  }
  
  try {
    // Generate QR code (real QR for check-in testing)
    const qrDataUrl = await qrService.generateQRDataUrl(
      {
        orderNumber: order.order_number,
        eventName: order.event_name || 'TEST MODE — INTERNAL',
        tierName: order.tier_name || 'TEST TICKET'
      },
      order.order_number
    );
    
    // Generate test-specific email HTML
    const html = generateTestTicketEmailHtml({
      buyerName: order.buyer_name,
      eventName: order.event_name || 'TEST MODE — INTERNAL',
      orderNumber: order.order_number,
      quantity: order.quantity,
      qrDataUrl
    });
    
    await transporter.sendMail({
      from: `"Home Productions" <${config.email.from}>`,
      to: order.buyer_email,
      subject: `[TEST] 🎫 Test Ticket — ${order.order_number}`,
      html,
      attachments: [{
        filename: 'test-ticket-qr.png',
        content: qrDataUrl.split(',')[1],
        encoding: 'base64',
        cid: 'qrcode'
      }]
    });
    
    logger.info('Test ticket email sent', { 
      orderId: order.id, 
      orderNumber: order.order_number,
      recipient: order.buyer_email 
    });
    
    return true;
  } catch (err) {
    logger.error('Test ticket email failed', { 
      orderId: order.id, 
      error: err.message 
    });
    return false;
  }
}

// ============================================
// EMAIL STATUS & RESEND (EXISTING)
// ============================================

/**
 * Get email status for an order
 * @param {Object} db - Database module
 * @param {string} orderId - Order UUID
 */
export async function getEmailStatus(db, orderId) {
  const email = await db.queryOne(
    `SELECT status, attempts, sent_at, last_attempt_at, error_message
     FROM email_outbox
     WHERE order_id = $1 AND email_type = 'ticket'`,
    [orderId]
  );
  
  return email;
}

/**
 * Force resend ticket email (admin action)
 * UPDATED: Detects test orders and uses appropriate email function
 * @param {Object} db - Database module
 * @param {string} orderId - Order UUID
 */
export async function forceResendTicket(db, orderId) {
  // Get order with test flag
  const order = await db.queryOne(
    `SELECT o.*, e.name as event_name, t.name as tier_name
     FROM orders o
     JOIN events e ON e.id = o.event_id
     JOIN ticket_tiers t ON t.id = o.tier_id
     WHERE o.id = $1`,
    [orderId]
  );
  
  if (!order) {
    throw new Error('ORDER_NOT_FOUND');
  }
  
  // Test orders use direct send
  if (order.is_test) {
    const sent = await sendTestTicketEmail(db, order);
    return { processed: 1, sent: sent ? 1 : 0, failed: sent ? 0 : 1 };
  }
  
  // Regular orders use outbox
  const result = await db.query(
    `UPDATE email_outbox 
     SET status = 'pending', attempts = 0, error_message = NULL
     WHERE order_id = $1 AND email_type = 'ticket'
     RETURNING id`,
    [orderId]
  );
  
  if (result.rowCount === 0) {
    // No existing email, queue new one
    await queueTicketEmail(db, order);
  }
  
  // Process immediately
  return processPendingEmails(db, 1);
}

// ============================================
// HTML TEMPLATES
// ============================================

/**
 * Generate standard ticket email HTML
 */
function generateTicketEmailHtml(data) {
  const eventDate = new Date(data.eventDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0d1f1a;font-family:Arial,sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:30px 20px;">
    <div style="background:linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05));border:1px solid rgba(212,175,55,0.3);border-radius:20px;padding:30px;text-align:center;">
      <h1 style="color:#D4AF37;font-size:28px;margin:0 0 10px;font-family:Georgia,serif;">HOME PRODUCTIONS</h1>
      <p style="color:#F5F0E8;opacity:0.8;margin:0 0 25px;font-size:14px;">Your ticket is confirmed! 🎉</p>
      
      <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:15px;padding:20px;margin-bottom:25px;">
        <h2 style="color:#F5F0E8;font-size:20px;margin:0 0 15px;">${data.eventName}</h2>
        <p style="color:#F5F0E8;opacity:0.8;font-size:14px;margin:0 0 5px;">📍 ${data.location}</p>
        <p style="color:#F5F0E8;opacity:0.8;font-size:14px;margin:0 0 15px;">📅 ${eventDate} • ${data.eventTime}</p>
        <p style="color:#D4AF37;font-size:16px;margin:0 0 5px;font-weight:bold;">${data.tierName}</p>
        <p style="color:#F5F0E8;opacity:0.7;font-size:14px;margin:0;">Order: ${data.orderNumber}</p>
      </div>
      
      <div style="background:#F5F0E8;border-radius:15px;padding:20px;display:inline-block;margin-bottom:25px;">
        <img src="cid:qrcode" alt="QR Code" style="width:200px;height:200px;display:block;">
      </div>
      
      <p style="color:#F5F0E8;font-size:13px;opacity:0.8;margin:0 0 5px;">📱 Show this QR code at the entrance</p>
      <p style="color:#F5F0E8;font-size:13px;opacity:0.8;margin:0 0 20px;">🪪 Bring valid ID matching: <strong>${data.buyerName}</strong></p>
      
      <div style="border-top:1px solid rgba(212,175,55,0.3);padding-top:20px;margin-top:20px;">
        <p style="color:#F5F0E8;opacity:0.6;font-size:12px;margin:0;">
          Home Productions<br>
          <a href="mailto:info@homeproductions.art" style="color:#D4AF37;">info@homeproductions.art</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate TEST ticket email HTML
 * Clearly marked with warning banner
 */
function generateTestTicketEmailHtml(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1a1a1a;font-family:Arial,sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:30px 20px;">
    
    <!-- TEST WARNING BANNER -->
    <div style="background:linear-gradient(135deg,#ff6b00,#ff8c00);border-radius:10px;padding:15px;margin-bottom:20px;text-align:center;">
      <p style="color:#fff;font-size:18px;font-weight:bold;margin:0;">⚠️ TEST TICKET — NOT FOR REAL EVENT</p>
      <p style="color:#fff;font-size:12px;margin:5px 0 0;opacity:0.9;">This is a test ticket for internal validation only</p>
    </div>
    
    <div style="background:linear-gradient(135deg,rgba(255,107,0,0.1),rgba(255,140,0,0.05));border:2px dashed rgba(255,107,0,0.5);border-radius:20px;padding:30px;text-align:center;">
      <h1 style="color:#ff6b00;font-size:24px;margin:0 0 10px;font-family:Georgia,serif;">🧪 TEST MODE</h1>
      <p style="color:#ccc;margin:0 0 25px;font-size:14px;">Home Productions Testing System</p>
      
      <div style="background:rgba(255,107,0,0.1);border:1px solid rgba(255,107,0,0.3);border-radius:15px;padding:20px;margin-bottom:25px;">
        <h2 style="color:#fff;font-size:18px;margin:0 0 15px;">${data.eventName}</h2>
        <p style="color:#ff6b00;font-size:14px;margin:0 0 5px;font-weight:bold;">TEST TICKET x${data.quantity}</p>
        <p style="color:#aaa;font-size:14px;margin:0;">Order: ${data.orderNumber}</p>
      </div>
      
      <div style="background:#fff;border-radius:15px;padding:20px;display:inline-block;margin-bottom:25px;">
        <img src="cid:qrcode" alt="QR Code" style="width:180px;height:180px;display:block;">
      </div>
      
      <p style="color:#ff6b00;font-size:14px;margin:0 0 5px;font-weight:bold;">✅ This QR code IS scannable</p>
      <p style="color:#aaa;font-size:13px;margin:0 0 20px;">Use this to test the check-in flow</p>
      
      <div style="border-top:1px solid rgba(255,107,0,0.3);padding-top:20px;margin-top:20px;">
        <p style="color:#666;font-size:12px;margin:0;">
          Name: <strong style="color:#fff;">${data.buyerName}</strong><br>
          This is an internal test - $0.00 value
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================
// UTILITIES
// ============================================

/**
 * Check if email service is configured
 */
export function isConfigured() {
  return getConfig().email.configured;
}

export default {
  initTransporter,
  queueTicketEmail,
  processPendingEmails,
  sendTestTicketEmail,
  getEmailStatus,
  forceResendTicket,
  isConfigured
};
