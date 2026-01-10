-- ============================================
-- HOME PRODUCTIONS DATABASE SCHEMA v4.0
-- Production-safe ticketing system
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS (Admins)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin', 'staff')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

-- ============================================
-- REFRESH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT refresh_tokens_not_expired CHECK (expires_at > created_at)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;

-- ============================================
-- EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    location VARCHAR(255) NOT NULL,
    venue VARCHAR(255),
    event_date DATE NOT NULL,
    event_time TIME NOT NULL DEFAULT '21:00',
    end_time TIME,
    description TEXT,
    event_type VARCHAR(50) NOT NULL DEFAULT 'party' CHECK (event_type IN ('party', 'festival', 'gathering', 'concert', 'workshop')),
    main_artist VARCHAR(255),
    artists TEXT[],
    image_url TEXT,
    cloudinary_public_id VARCHAR(255),
    min_age INTEGER NOT NULL DEFAULT 18 CHECK (min_age >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'cancelled', 'completed', 'deleted')),
    is_featured BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_slug ON events(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_events_active ON events(status) WHERE status = 'active';

-- ============================================
-- TICKET TIERS
-- ============================================
CREATE TABLE IF NOT EXISTS ticket_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    sold INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
    max_per_order INTEGER NOT NULL DEFAULT 10 CHECK (max_per_order > 0),
    payment_link TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sale_starts_at TIMESTAMP WITH TIME ZONE,
    sale_ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tier_sold_not_exceed_quantity CHECK (sold <= quantity)
);

CREATE INDEX idx_tiers_event ON ticket_tiers(event_id);
CREATE INDEX idx_tiers_active ON ticket_tiers(is_active) WHERE is_active = true;

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    event_id UUID NOT NULL REFERENCES events(id),
    tier_id UUID NOT NULL REFERENCES ticket_tiers(id),
    
    -- Buyer info (immutable after creation)
    buyer_name VARCHAR(255) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50),
    buyer_country VARCHAR(100),
    buyer_nationality VARCHAR(100),
    
    -- Order details (immutable)
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10, 2) NOT NULL CHECK (total_price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Status (only field that changes)
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
    
    -- Payment tracking
    payment_method VARCHAR(50),
    payment_provider VARCHAR(50),
    payment_reference VARCHAR(255),
    payment_confirmed_at TIMESTAMP WITH TIME ZONE,
    payment_confirmed_by UUID REFERENCES users(id),
    
    -- QR Code (hashed for security)
    qr_code_hash VARCHAR(64) UNIQUE NOT NULL,
    qr_code_url TEXT,
    
    -- Tracking
    referral_source VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_event ON orders(event_id);
CREATE INDEX idx_orders_tier ON orders(tier_id);
CREATE INDEX idx_orders_email ON orders(buyer_email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_qr_hash ON orders(qr_code_hash);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_paid ON orders(status) WHERE status = 'paid';

-- ============================================
-- CHECKINS (Separate audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    checked_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_in_by UUID REFERENCES users(id),
    device_info VARCHAR(255),
    location_info VARCHAR(255),
    notes TEXT,
    CONSTRAINT unique_order_checkin UNIQUE (order_id)
);

CREATE INDEX idx_checkins_order ON checkins(order_id);
CREATE INDEX idx_checkins_time ON checkins(checked_in_at DESC);

-- ============================================
-- EMAIL OUTBOX (Decoupled email sending)
-- ============================================
CREATE TABLE IF NOT EXISTS email_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    email_type VARCHAR(50) NOT NULL CHECK (email_type IN ('ticket', 'confirmation', 'reminder', 'refund')),
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    qr_plaintext TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT max_email_attempts CHECK (attempts <= 5)
);

CREATE INDEX idx_email_outbox_order ON email_outbox(order_id);
CREATE INDEX idx_email_outbox_pending ON email_outbox(status) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_email_outbox_type ON email_outbox(order_id, email_type);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================
-- SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

-- ============================================
-- GALLERIES
-- ============================================
CREATE TABLE IF NOT EXISTS galleries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    photographer VARCHAR(255),
    cover_image_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_galleries_event ON galleries(event_id);
CREATE INDEX IF NOT EXISTS idx_galleries_published ON galleries(is_published) WHERE is_published = true;

-- ============================================
-- GALLERY IMAGES
-- ============================================
CREATE TABLE IF NOT EXISTS gallery_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    caption VARCHAR(500),
    cloudinary_public_id VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gallery_images_gallery ON gallery_images(gallery_id);

-- ============================================
-- NEWSLETTER SUBSCRIBERS
-- ============================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    result VARCHAR(50);
BEGIN
    result := 'HP' || TO_CHAR(CURRENT_TIMESTAMP, 'YYMMDD') || '-' || 
              UPPER(SUBSTRING(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 8));
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Generate QR code (returns plaintext, caller must hash for storage)
CREATE OR REPLACE FUNCTION generate_qr_code()
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN UPPER(encode(gen_random_bytes(16), 'hex'));
END;
$$ LANGUAGE plpgsql;

-- Hash QR code for storage
CREATE OR REPLACE FUNCTION hash_qr_code(plaintext VARCHAR)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(plaintext, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Reserve inventory (atomic with FOR UPDATE)
CREATE OR REPLACE FUNCTION reserve_inventory(
    p_tier_id UUID,
    p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available INTEGER;
BEGIN
    -- Lock the row and check availability
    SELECT quantity - sold INTO v_available
    FROM ticket_tiers
    WHERE id = p_tier_id
    FOR UPDATE;
    
    IF v_available IS NULL THEN
        RAISE EXCEPTION 'Tier not found: %', p_tier_id;
    END IF;
    
    IF v_available < p_quantity THEN
        RETURN FALSE;
    END IF;
    
    -- Update sold count
    UPDATE ticket_tiers
    SET sold = sold + p_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_tier_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Release inventory (for refunds/cancellations)
CREATE OR REPLACE FUNCTION release_inventory(
    p_tier_id UUID,
    p_quantity INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE ticket_tiers
    SET sold = GREATEST(0, sold - p_quantity),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_tier_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ticket_tiers_updated_at
    BEFORE UPDATE ON ticket_tiers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DEFAULT DATA
-- ============================================

INSERT INTO settings (key, value) VALUES
    ('site_name', '"Home Productions"'),
    ('contact_email', '"info@homeproductions.art"'),
    ('email_require_confirmation', 'true')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE orders IS 'Immutable order records - only status field changes';
COMMENT ON COLUMN orders.qr_code_hash IS 'SHA-256 hash of QR code for secure lookup';
COMMENT ON TABLE email_outbox IS 'Decoupled email queue with retry support';
COMMENT ON COLUMN email_outbox.qr_plaintext IS 'Temporary QR plaintext for email generation - MUST be NULL after send';
COMMENT ON TABLE checkins IS 'Separate check-in records for audit trail';
COMMENT ON FUNCTION reserve_inventory IS 'Atomic inventory reservation using FOR UPDATE';
