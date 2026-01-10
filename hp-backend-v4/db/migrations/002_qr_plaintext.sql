-- ============================================
-- Migration: Add qr_plaintext to email_outbox
-- Purpose: Temporarily store QR plaintext for email sending
-- Security: MUST be wiped after successful email send
-- ============================================

-- Add qr_plaintext column to email_outbox
ALTER TABLE email_outbox
ADD COLUMN IF NOT EXISTS qr_plaintext TEXT;

-- Comment for documentation
COMMENT ON COLUMN email_outbox.qr_plaintext IS 'Temporary QR plaintext for email generation - MUST be NULL after send';
