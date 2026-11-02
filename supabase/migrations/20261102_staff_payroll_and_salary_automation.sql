-- ============================================================================
-- Migration: Staff Payroll, Salary Configuration & Razorpay Payout Automation
-- ============================================================================

BEGIN;

-- 1. Ensure transport admins and managers exist in public.staff so all campus staff are unified
INSERT INTO public.staff (id, user_id, employee_code, full_name, email, phone, category, role, is_active, created_at)
SELECT 
    'staff-' || SUBSTRING(u.role FROM 1 FOR 3) || '-' || SUBSTRING(u.id FROM 1 FOR 8) AS id,
    u.id AS user_id,
    'EMP-' || UPPER(SUBSTRING(u.role FROM 1 FOR 3)) || '-' || LPAD(FLOOR(RANDOM() * 900 + 100)::TEXT, 3, '0') AS employee_code,
    COALESCE(u.full_name, 'Transport Official') AS full_name,
    u.email,
    u.phone,
    'TRANSPORT_OPS' AS category,
    u.role,
    TRUE AS is_active,
    NOW() AS created_at
FROM public.users u
WHERE u.role IN ('admin', 'transport_admin', 'transport_manager')
  AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = u.id OR s.email = u.email)
ON CONFLICT (id) DO NOTHING;

-- 2. Role Base Salary Defaults Table
CREATE TABLE IF NOT EXISTS public.role_salary_defaults (
    role TEXT PRIMARY KEY,
    base_salary NUMERIC(12,2) NOT NULL DEFAULT 20000.00,
    payment_frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (payment_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    daily_allowance NUMERIC(12,2) DEFAULT 0.00,
    trip_bonus_rate NUMERIC(12,2) DEFAULT 100.00,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed standard institutional salary benchmarks
INSERT INTO public.role_salary_defaults (role, base_salary, payment_frequency, daily_allowance, trip_bonus_rate, description)
VALUES 
    ('transport_admin', 45000.00, 'MONTHLY', 150.00, 0.00, 'Transport Administrator base monthly compensation'),
    ('transport_manager', 35000.00, 'MONTHLY', 100.00, 50.00, 'Transport Manager dispatch operations monthly salary'),
    ('driver', 22000.00, 'MONTHLY', 120.00, 150.00, 'Fleet Bus Driver base salary + per-trip overtime bonus'),
    ('conductor', 18000.00, 'MONTHLY', 100.00, 100.00, 'Bus Conductor / Ticketing Steward base salary + trip bonus')
ON CONFLICT (role) DO UPDATE SET
    base_salary = EXCLUDED.base_salary,
    payment_frequency = EXCLUDED.payment_frequency,
    daily_allowance = EXCLUDED.daily_allowance,
    trip_bonus_rate = EXCLUDED.trip_bonus_rate,
    updated_at = NOW();

-- 3. Staff Salary & Payout Configurations Table (with encrypted banking/UPI details)
CREATE TABLE IF NOT EXISTS public.staff_salary_configs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    staff_id TEXT NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE UNIQUE,
    user_id TEXT,
    role TEXT NOT NULL,
    base_salary NUMERIC(12,2) NOT NULL DEFAULT 20000.00,
    payment_frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (payment_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    payout_method TEXT NOT NULL DEFAULT 'BANK_ACCOUNT' CHECK (payout_method IN ('BANK_ACCOUNT', 'UPI')),
    account_holder_name TEXT,
    bank_name TEXT,
    bank_ifsc TEXT,
    bank_account_encrypted TEXT,
    bank_account_masked TEXT,
    upi_id_encrypted TEXT,
    upi_id_masked TEXT,
    razorpay_contact_id TEXT,
    razorpay_fund_account_id TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    active_bonus_amount NUMERIC(12,2) DEFAULT 0.00,
    active_bonus_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_salary_configs_staff_id ON public.staff_salary_configs(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_salary_configs_role ON public.staff_salary_configs(role);

-- Seed initial configs for all staff members who do not have one yet
INSERT INTO public.staff_salary_configs (staff_id, user_id, role, base_salary, payment_frequency, account_holder_name, bank_name, bank_ifsc, bank_account_masked, is_verified)
SELECT 
    s.id AS staff_id,
    s.user_id,
    s.role,
    COALESCE(d.base_salary, 20000.00) AS base_salary,
    COALESCE(d.payment_frequency, 'MONTHLY') AS payment_frequency,
    s.full_name AS account_holder_name,
    'State Bank of India' AS bank_name,
    'SBIN0000726' AS bank_ifsc,
    '••••••••' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0') AS bank_account_masked,
    TRUE AS is_verified
FROM public.staff s
LEFT JOIN public.role_salary_defaults d ON d.role = s.role
WHERE NOT EXISTS (SELECT 1 FROM public.staff_salary_configs c WHERE c.staff_id = s.id)
ON CONFLICT (staff_id) DO NOTHING;

-- 4. Staff Salary Payouts Audit & Ledger Table (Immutable transaction records)
CREATE TABLE IF NOT EXISTS public.staff_salary_payouts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    payout_ref TEXT NOT NULL UNIQUE,
    staff_id TEXT NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    cycle_period TEXT NOT NULL,
    cycle_start DATE NOT NULL,
    cycle_end DATE NOT NULL,
    base_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    bonus_reason TEXT,
    deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_frequency TEXT NOT NULL,
    payout_method TEXT NOT NULL,
    recipient_masked TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUEUED', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED')),
    gateway TEXT NOT NULL DEFAULT 'RAZORPAYX',
    gateway_payout_id TEXT,
    gateway_fund_account_id TEXT,
    failure_reason TEXT,
    processed_by TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_salary_payouts_staff_id ON public.staff_salary_payouts(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_salary_payouts_status ON public.staff_salary_payouts(status);
CREATE INDEX IF NOT EXISTS idx_staff_salary_payouts_cycle_period ON public.staff_salary_payouts(cycle_period);

-- 5. Unified View for Staff Payroll: public.staff_payroll_full
DROP VIEW IF EXISTS public.staff_payroll_full CASCADE;

CREATE VIEW public.staff_payroll_full AS
SELECT 
    s.id AS staff_id,
    s.user_id,
    s.employee_code,
    COALESCE(u.full_name, s.full_name) AS full_name,
    COALESCE(u.email, s.email) AS email,
    COALESCE(u.phone, s.phone) AS phone,
    u.photo_url,
    s.license_no,
    s.role,
    s.category,
    s.is_active,
    s.created_at AS staff_created_at,
    COALESCE(c.base_salary, d.base_salary, 20000.00) AS base_salary,
    COALESCE(c.payment_frequency, d.payment_frequency, 'MONTHLY') AS payment_frequency,
    COALESCE(c.payout_method, 'BANK_ACCOUNT') AS payout_method,
    c.account_holder_name,
    c.bank_name,
    c.bank_ifsc,
    c.bank_account_masked,
    c.upi_id_masked,
    CASE 
        WHEN c.bank_account_encrypted IS NOT NULL OR c.upi_id_encrypted IS NOT NULL OR c.bank_account_masked IS NOT NULL OR c.upi_id_masked IS NOT NULL 
        THEN TRUE 
        ELSE FALSE 
    END AS is_payout_configured,
    COALESCE(c.is_verified, FALSE) AS is_verified,
    COALESCE(c.active_bonus_amount, 0.00) AS active_bonus_amount,
    c.active_bonus_reason,
    (COALESCE(c.base_salary, d.base_salary, 20000.00) + COALESCE(c.active_bonus_amount, 0.00)) AS net_payable,
    c.razorpay_contact_id,
    c.razorpay_fund_account_id,
    COALESCE(trip_agg.completed_trips_month, 0) AS completed_trips_month,
    COALESCE(payout_agg.total_paid_ytd, 0.00) AS total_paid_ytd,
    payout_agg.last_payout_at,
    payout_agg.last_payout_amount,
    payout_agg.last_payout_status
FROM public.staff s
LEFT JOIN public.users u ON u.id = s.user_id
LEFT JOIN public.staff_salary_configs c ON c.staff_id = s.id
LEFT JOIN public.role_salary_defaults d ON d.role = s.role
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*) AS completed_trips_month
    FROM public.trips t
    WHERE (t.driver_id = s.id OR t.conductor_id = s.id)
      AND t.status = 'COMPLETED'
) trip_agg ON TRUE
LEFT JOIN LATERAL (
    SELECT 
        SUM(CASE WHEN p.status = 'PAID' AND EXTRACT(YEAR FROM p.created_at) = EXTRACT(YEAR FROM CURRENT_DATE) THEN p.net_amount ELSE 0 END) AS total_paid_ytd,
        MAX(p.paid_at) AS last_payout_at,
        (SELECT p2.net_amount FROM public.staff_salary_payouts p2 WHERE p2.staff_id = s.id ORDER BY p2.created_at DESC LIMIT 1) AS last_payout_amount,
        (SELECT p2.status FROM public.staff_salary_payouts p2 WHERE p2.staff_id = s.id ORDER BY p2.created_at DESC LIMIT 1) AS last_payout_status
    FROM public.staff_salary_payouts p
    WHERE p.staff_id = s.id
) payout_agg ON TRUE;

COMMIT;
