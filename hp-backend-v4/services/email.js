/**
 * Email Service
 * Outbox pattern for reliable email delivery
 * Email sending is DECOUPLED from order status changes
 */

const nodemailer = require('nodemailer');
const { getConfig } = require('../config/env');
const qrService = require('./qr');
const logger = require('../utils/logger');

let transporter = null;

/**
 * Initialize email transporter
 */
function initTransporter() {
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

/**
 * Queue ticket email in outbox
 * Does NOT send immediately - just queues
 * @param {Object} db - Database module
 * @param {Object} order - Order object
 * @param {string} qrPlaintext - QR code plaintext (required for ticket emails)
 */
async function queueTicketEmail(db, order, qrPlaintext) {
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

  // qrPlaintext is REQUIRED for ticket emails
  if (!qrPlaintext) {
    logger.error('qrPlaintext required for ticket email', { orderId: order.id });
    throw new Error('QR_PLAINTEXT_REQUIRED');
  }

  const result = await db.queryOne(
    `INSERT INTO email_outbox (order_id, email_type, recipient_email, subject, qr_plaintext)
     VALUES ($1, 'ticket', $2, $3, $4)
     RETURNING id`,
    [
      order.id,
      order.buyer_email,
      `🎫 Your Ticket: ${order.event_name}`,
      qrPlaintext
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
 * Called periodically or after payment confirmation
 * @param {Object} db - Database module
 * @param {number} limit - Max emails to process
 */
async function processPendingEmails(db, limit = 10) {
  const config = getConfig();
  
  if (!config.email.configured) {
    logger.debug('Email not configured, skipping processing');
    return { processed: 0, sent: 0, failed: 0 };
  }
  
  if (!transporter) {
    initTransporter();
  }
  
  // Get pending emails (includes qr_plaintext from email_outbox)
  const pending = await db.queryAll(
    `SELECT e.*, e.qr_plaintext, o.order_number, o.buyer_name, o.buyer_email, o.quantity,
            o.qr_code_hash, ev.name as event_name, ev.event_date, ev.event_time, ev.location,
            t.name as tier_name
     FROM email_outbox e
     JOIN orders o ON o.id = e.order_id
     JOIN events ev ON ev.id = o.event_id
     JOIN ticket_tiers t ON t.id = o.tier_id
     WHERE e.status IN ('pending', 'failed')
       AND e.attempts < 5
       AND o.status = 'paid'
       AND e.qr_plaintext IS NOT NULL
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
      
      // Generate QR code for email using stored qr_plaintext
      const qrDataUrl = await qrService.generateQRDataUrl(
        {
          orderNumber: email.order_number,
          eventName: email.event_name,
          tierName: email.tier_name
        },
        email.qr_plaintext
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
      
      // Mark as sent AND wipe qr_plaintext for security
      await db.query(
        `UPDATE email_outbox
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, qr_plaintext = NULL
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

/**
 * Get email status for an order
 * @param {Object} db - Database module
 * @param {string} orderId - Order UUID
 */
async function getEmailStatus(db, orderId) {
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
 * Only works if qr_plaintext is still available (email not yet sent)
 * @param {Object} db - Database module
 * @param {string} orderId - Order UUID
 */
async function forceResendTicket(db, orderId) {
  // Check existing email and its qr_plaintext status
  const existing = await db.queryOne(
    `SELECT id, status, qr_plaintext FROM email_outbox
     WHERE order_id = $1 AND email_type = 'ticket'`,
    [orderId]
  );

  if (!existing) {
    // No email queued - cannot resend (qr_plaintext unavailable)
    throw new Error('EMAIL_NOT_QUEUED');
  }

  if (!existing.qr_plaintext) {
    // qr_plaintext was wiped after successful send - cannot resend
    throw new Error('QR_PLAINTEXT_EXPIRED');
  }

  // Reset existing email to pending (qr_plaintext still available)
  await db.query(
    `UPDATE email_outbox
     SET status = 'pending', attempts = 0, error_message = NULL
     WHERE id = $1`,
    [existing.id]
  );

  logger.info('Email reset for resend', { orderId, emailId: existing.id });

  // Process immediately
  return processPendingEmails(db, 1);
}

/**
 * Generate ticket email HTML
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
 * Check if email service is configured
 */
function isConfigured() {
  return getConfig().email.configured;
}

module.exports = {
  initTransporter,
  queueTicketEmail,
  processPendingEmails,
  getEmailStatus,
  forceResendTicket,
  isConfigured
};
