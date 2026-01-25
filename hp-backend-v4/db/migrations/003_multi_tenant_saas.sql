-- ============================================
-- MIGRATION 003: MULTI-TENANT SAAS FOUNDATION
-- Home Productions → Multi-Tenant Platform
-- ============================================
-- 
-- SAFETY GUARANTEES:
-- ✅ All existing tables preserved
-- ✅ All existing data preserved
-- ✅ Default values ensure backwards compatibility
-- ✅ Existing orders/events continue to work
-- ✅ Additive changes only (no column drops)
-- ============================================

BEGIN;

-- ============================================
-- 1. CLIENTS (Promoters/Organizers)
-- ============================================
-- Multi-tenant foundation: each client is a promoter/organizer
-- BACKWARDS COMPAT: Default client created for existing data

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    client_code VARCHAR(20) UNIQUE NOT NULL,
    
    -- Contact
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    website VARCHAR(255),
    
    -- Branding (Phase 2)
    logo_url TEXT,
    brand_color VARCHAR(7) DEFAULT '#D4AF37',
    
    -- Platform Fees (TASK 3)
    platform_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 5.00 CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 50),
    platform_fee_fixed DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (platform_fee_fixed >= 0),
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'cancelled')),
    is_platform_client BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(client_code);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status) WHERE status = 'active';

-- ============================================
-- 2. ADD CLIENT SCOPING TO USERS
-- ============================================
-- BACKWARDS COMPAT: client_id is nullable, existing users get NULL (platform admins)

ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- User roles now include client-scoped roles
-- Existing 'admin' role becomes platform_admin for NULL client_id users
ALTER TABLE users 
    DROP CONSTRAINT IF EXISTS users_role_check;
    
ALTER TABLE users
    ADD CONSTRAINT users_role_check 
    CHECK (role IN ('platform_admin', 'platform_staff', 'client_admin', 'client_staff', 'admin', 'superadmin', 'staff'));

CREATE INDEX IF NOT EXISTS idx_users_client ON users(client_id) WHERE client_id IS NOT NULL;

-- ============================================
-- 3. ADD CLIENT SCOPING TO EVENTS
-- ============================================
-- BACKWARDS COMPAT: client_id is nullable initially, migration assigns default

ALTER TABLE events 
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Add is_test flag for test events (TASK 5)
ALTER TABLE events 
    ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- Add identifier for system test events
ALTER TABLE events 
    ADD COLUMN IF NOT EXISTS identifier VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_test ON events(is_test) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_events_identifier ON events(identifier) WHERE identifier IS NOT NULL;

-- ============================================
-- 4. ADD TEST ORDER ISOLATION (TASK 5)
-- ============================================
-- CRITICAL: Test orders must NEVER affect real data

ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS customer_id UUID;

-- Platform fee tracking on orders
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS platform_fee_amount DECIMAL(10, 2) DEFAULT 0.00;

ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS client_revenue DECIMAL(10, 2);

CREATE INDEX IF NOT EXISTS idx_orders_test ON orders(is_test) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_not_test ON orders(is_test) WHERE is_test = false;

-- ============================================
-- 5. CUSTOMERS TABLE (CRM - TASK 7)
-- ============================================
-- Customer database derived from orders
-- DOES NOT modify order creation - backfills and syncs

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    
    -- Client scoping (customers belong to clients who sold them tickets)
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    
    -- Statistics (computed, can be recalculated)
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_spent DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    first_order_at TIMESTAMP WITH TIME ZONE,
    last_order_at TIMESTAMP WITH TIME ZONE,
    
    -- Tier progression (Bronze → VIP)
    tier VARCHAR(50) NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'vip')),
    tier_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Test customer flag
    is_test_customer BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    tags TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique per client
    CONSTRAINT unique_customer_per_client UNIQUE (email, client_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_client ON customers(client_id);
CREATE INDEX IF NOT EXISTS idx_customers_test ON customers(is_test_customer) WHERE is_test_customer = true;
CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(tier);

-- Link orders to customers
ALTER TABLE orders 
    ADD CONSTRAINT IF NOT EXISTS fk_orders_customer 
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- ============================================
-- 6. PAYOUTS TABLE (TASK 4)
-- ============================================
-- Manual payout tracking - NO automatic money movement

CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Client receiving payout
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    
    -- Financial details
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Period covered
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Breakdown
    gross_revenue DECIMAL(10, 2) NOT NULL,
    platform_fees DECIMAL(10, 2) NOT NULL,
    net_payout DECIMAL(10, 2) NOT NULL,
    order_count INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    
    -- Payment info (manual entry)
    payment_method VARCHAR(100),
    payment_reference VARCHAR(255),
    payment_notes TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT payout_period_valid CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_payouts_client ON payouts(client_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_period ON payouts(period_start, period_end);

-- ============================================
-- 7. CHECKINS - ADD TEST FLAG
-- ============================================

ALTER TABLE checkins 
    ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_checkins_test ON checkins(is_test) WHERE is_test = true;

-- ============================================
-- 8. AUDIT LOGS - EXTENDED ACTIONS
-- ============================================
-- Already exists, just ensure we track new action types

COMMENT ON TABLE audit_logs IS 'Extended audit trail for platform actions including fees, payouts, and multi-tenant operations';

-- ============================================
-- 9. CREATE DEFAULT CLIENT (BACKWARDS COMPAT)
-- ============================================
-- CRITICAL: Existing data must continue to work

INSERT INTO clients (
    id,
    name,
    slug,
    client_code,
    email,
    platform_fee_percent,
    platform_fee_fixed,
    is_platform_client,
    status
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Home Productions',
    'homeproductions',
    'HP2024',
    'info@homeproductions.art',
    0.00,  -- No platform fee for original client
    0.00,
    true,  -- This is the platform owner
    'active'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 10. MIGRATE EXISTING DATA TO DEFAULT CLIENT
-- ============================================
-- Assign all existing events to HomeProductions client

UPDATE events 
SET client_id = '00000000-0000-0000-0000-000000000001'
WHERE client_id IS NULL;

-- Assign existing platform users (no client_id, they're platform admins)
-- Don't modify - NULL client_id = platform admin

-- ============================================
-- 11. FUNCTIONS FOR MULTI-TENANT OPERATIONS
-- ============================================

-- Calculate platform fee for an order
CREATE OR REPLACE FUNCTION calculate_platform_fee(
    p_total_price DECIMAL,
    p_fee_percent DECIMAL,
    p_fee_fixed DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
    RETURN ROUND(p_total_price * (p_fee_percent / 100) + p_fee_fixed, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generate test order number (different prefix)
CREATE OR REPLACE FUNCTION generate_test_order_number()
RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN 'TEST-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYMMDD') || '-' || 
           UPPER(SUBSTRING(encode(gen_random_bytes(3), 'hex') FROM 1 FOR 6));
END;
$$ LANGUAGE plpgsql;

-- Upsert customer from order
CREATE OR REPLACE FUNCTION upsert_customer_from_order(
    p_email VARCHAR,
    p_name VARCHAR,
    p_phone VARCHAR,
    p_client_id UUID,
    p_order_total DECIMAL,
    p_is_test BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    -- Try to find existing customer
    SELECT id INTO v_customer_id
    FROM customers
    WHERE email = p_email AND (client_id = p_client_id OR (client_id IS NULL AND p_client_id IS NULL));
    
    IF v_customer_id IS NULL THEN
        -- Create new customer
        INSERT INTO customers (email, name, phone, client_id, total_orders, total_spent, first_order_at, last_order_at, is_test_customer)
        VALUES (p_email, p_name, p_phone, p_client_id, 1, p_order_total, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, p_is_test)
        RETURNING id INTO v_customer_id;
    ELSE
        -- Update existing customer
        UPDATE customers
        SET 
            name = COALESCE(p_name, name),
            phone = COALESCE(p_phone, phone),
            total_orders = total_orders + 1,
            total_spent = total_spent + p_order_total,
            last_order_at = CURRENT_TIMESTAMP,
            is_test_customer = is_test_customer OR p_is_test,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_customer_id;
    END IF;
    
    RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql;

-- Calculate customer tier based on spending
CREATE OR REPLACE FUNCTION calculate_customer_tier(p_total_spent DECIMAL)
RETURNS VARCHAR AS $$
BEGIN
    IF p_total_spent >= 1000 THEN RETURN 'vip';
    ELSIF p_total_spent >= 500 THEN RETURN 'platinum';
    ELSIF p_total_spent >= 250 THEN RETURN 'gold';
    ELSIF p_total_spent >= 100 THEN RETURN 'silver';
    ELSE RETURN 'bronze';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 12. TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to new tables
DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_payouts_updated_at ON payouts;
CREATE TRIGGER trg_payouts_updated_at
    BEFORE UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 13. BACKFILL CUSTOMERS FROM EXISTING ORDERS
-- ============================================
-- Populate CRM from historical order data

INSERT INTO customers (email, name, phone, client_id, total_orders, total_spent, first_order_at, last_order_at, is_test_customer)
SELECT 
    o.buyer_email,
    MAX(o.buyer_name),
    MAX(o.buyer_phone),
    e.client_id,
    COUNT(*) as total_orders,
    SUM(CASE WHEN o.status = 'paid' THEN o.total_price ELSE 0 END) as total_spent,
    MIN(o.created_at) as first_order_at,
    MAX(o.created_at) as last_order_at,
    false as is_test_customer
FROM orders o
JOIN events e ON e.id = o.event_id
WHERE NOT EXISTS (
    SELECT 1 FROM customers c 
    WHERE c.email = o.buyer_email 
    AND (c.client_id = e.client_id OR (c.client_id IS NULL AND e.client_id IS NULL))
)
GROUP BY o.buyer_email, e.client_id
ON CONFLICT (email, client_id) DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    total_spent = EXCLUDED.total_spent,
    first_order_at = EXCLUDED.first_order_at,
    last_order_at = EXCLUDED.last_order_at,
    updated_at = CURRENT_TIMESTAMP;

-- Link existing orders to customers
UPDATE orders o
SET customer_id = c.id
FROM customers c
JOIN events e ON e.id = o.event_id
WHERE o.buyer_email = c.email 
AND (c.client_id = e.client_id OR (c.client_id IS NULL AND e.client_id IS NULL))
AND o.customer_id IS NULL;

-- ============================================
-- 14. VIEWS FOR BACKWARDS COMPATIBILITY
-- ============================================

-- View for non-test orders (default view)
CREATE OR REPLACE VIEW v_orders_real AS
SELECT * FROM orders WHERE is_test = false;

-- View for non-test events (default view)  
CREATE OR REPLACE VIEW v_events_real AS
SELECT * FROM events WHERE is_test = false;

-- View for non-test customers
CREATE OR REPLACE VIEW v_customers_real AS
SELECT * FROM customers WHERE is_test_customer = false;

-- Client revenue summary view
CREATE OR REPLACE VIEW v_client_revenue AS
SELECT 
    c.id as client_id,
    c.name as client_name,
    COUNT(DISTINCT o.id) as total_orders,
    SUM(o.total_price) as gross_revenue,
    SUM(COALESCE(o.platform_fee_amount, 0)) as platform_fees,
    SUM(o.total_price) - SUM(COALESCE(o.platform_fee_amount, 0)) as net_revenue,
    COUNT(DISTINCT o.buyer_email) as unique_customers
FROM clients c
LEFT JOIN events e ON e.client_id = c.id AND e.is_test = false
LEFT JOIN orders o ON o.event_id = e.id AND o.status = 'paid' AND o.is_test = false
GROUP BY c.id, c.name;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

COMMENT ON TABLE clients IS 'Multi-tenant client organizations (promoters/organizers)';
COMMENT ON TABLE customers IS 'CRM customer database derived from orders';
COMMENT ON TABLE payouts IS 'Manual payout tracking for client revenue splits';
COMMENT ON COLUMN orders.is_test IS 'Flag for test orders - excluded from stats and revenue';
COMMENT ON COLUMN orders.platform_fee_amount IS 'Platform fee charged on this order';
COMMENT ON COLUMN events.is_test IS 'Flag for test events - internal use only';

COMMIT;
