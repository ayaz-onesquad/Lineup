-- Migration 016: Server-Side Rate Limiting
-- Implements OWASP-compliant rate limiting that persists across page refreshes
--
-- This migration creates:
-- 1. login_attempts table to track failed login attempts
-- 2. RPC functions for checking and recording attempts
-- 3. Automatic cleanup of old records

-- ============================================================================
-- 1. CREATE LOGIN_ATTEMPTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_cleanup ON login_attempts(attempted_at);

-- ============================================================================
-- 2. RATE LIMIT CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type TEXT UNIQUE NOT NULL,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    window_seconds INTEGER NOT NULL DEFAULT 60,
    block_seconds INTEGER NOT NULL DEFAULT 300,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configurations
INSERT INTO rate_limit_config (action_type, max_attempts, window_seconds, block_seconds)
VALUES
    ('login', 5, 60, 300),           -- 5 attempts per minute, 5 minute block
    ('password_reset', 3, 900, 1800), -- 3 attempts per 15 min, 30 minute block
    ('signup', 3, 60, 300)            -- 3 attempts per minute, 5 minute block
ON CONFLICT (action_type) DO NOTHING;

-- ============================================================================
-- 3. CHECK RATE LIMIT FUNCTION
-- ============================================================================
-- This function checks if an action should be rate limited
-- Returns: { allowed: boolean, remaining_attempts: int, retry_after_seconds: int }

CREATE OR REPLACE FUNCTION check_rate_limit(
    p_email TEXT,
    p_action_type TEXT DEFAULT 'login'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config RECORD;
    v_attempt_count INTEGER;
    v_oldest_attempt TIMESTAMPTZ;
    v_most_recent_attempt TIMESTAMPTZ;
    v_blocked_until TIMESTAMPTZ;
    v_window_start TIMESTAMPTZ;
BEGIN
    -- Get rate limit configuration
    SELECT * INTO v_config
    FROM rate_limit_config
    WHERE action_type = p_action_type;

    -- Default to login config if not found
    IF NOT FOUND THEN
        v_config.max_attempts := 5;
        v_config.window_seconds := 60;
        v_config.block_seconds := 300;
    END IF;

    -- Calculate window start time
    v_window_start := NOW() - (v_config.window_seconds || ' seconds')::INTERVAL;

    -- Count failed attempts in the window
    SELECT
        COUNT(*),
        MIN(attempted_at),
        MAX(attempted_at)
    INTO v_attempt_count, v_oldest_attempt, v_most_recent_attempt
    FROM login_attempts
    WHERE email = LOWER(p_email)
      AND success = FALSE
      AND attempted_at > v_window_start;

    -- Check if user is blocked
    IF v_attempt_count >= v_config.max_attempts THEN
        -- Calculate when block expires
        v_blocked_until := v_most_recent_attempt + (v_config.block_seconds || ' seconds')::INTERVAL;

        IF NOW() < v_blocked_until THEN
            -- Still blocked
            RETURN jsonb_build_object(
                'allowed', FALSE,
                'remaining_attempts', 0,
                'retry_after_seconds', EXTRACT(EPOCH FROM (v_blocked_until - NOW()))::INTEGER,
                'blocked_until', v_blocked_until
            );
        END IF;
    END IF;

    -- Not blocked - return remaining attempts
    RETURN jsonb_build_object(
        'allowed', TRUE,
        'remaining_attempts', GREATEST(0, v_config.max_attempts - v_attempt_count),
        'retry_after_seconds', 0
    );
END;
$$;

-- ============================================================================
-- 4. RECORD LOGIN ATTEMPT FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION record_login_attempt(
    p_email TEXT,
    p_success BOOLEAN,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO login_attempts (
        email,
        ip_address,
        user_agent,
        success,
        error_message,
        attempted_at
    ) VALUES (
        LOWER(p_email),
        p_ip_address::INET,
        p_user_agent,
        p_success,
        p_error_message,
        NOW()
    );

    -- If successful login, clear previous failed attempts for this email
    -- This allows users to try again immediately after successful login
    IF p_success THEN
        DELETE FROM login_attempts
        WHERE email = LOWER(p_email)
          AND success = FALSE
          AND attempted_at < NOW();
    END IF;
END;
$$;

-- ============================================================================
-- 5. CLEANUP OLD RECORDS FUNCTION
-- ============================================================================
-- Should be called periodically (e.g., daily cron job)

CREATE OR REPLACE FUNCTION cleanup_login_attempts(
    p_older_than_hours INTEGER DEFAULT 24
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM login_attempts
    WHERE attempted_at < NOW() - (p_older_than_hours || ' hours')::INTERVAL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================
-- These functions can be called by unauthenticated users (for login rate limiting)

GRANT EXECUTE ON FUNCTION check_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_login_attempts TO authenticated;

-- ============================================================================
-- 7. RLS POLICIES FOR LOGIN_ATTEMPTS
-- ============================================================================
-- Only sys_admins can view login attempts (for audit purposes)

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- sys_admin can view all attempts
CREATE POLICY "sys_admin_view_login_attempts" ON login_attempts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users
            WHERE user_id = auth.uid()
              AND role = 'sys_admin'
              AND status = 'active'
        )
    );

-- rate_limit_config is read-only for all, modifiable only by sys_admin
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_read_rate_config" ON rate_limit_config
    FOR SELECT USING (TRUE);

CREATE POLICY "sys_admin_can_modify_rate_config" ON rate_limit_config
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tenant_users
            WHERE user_id = auth.uid()
              AND role = 'sys_admin'
              AND status = 'active'
        )
    );

-- ============================================================================
-- 8. NOTIFY SCHEMA RELOAD
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE login_attempts IS 'Tracks login attempts for server-side rate limiting. Failed attempts are counted per email within a time window.';
COMMENT ON TABLE rate_limit_config IS 'Configuration for rate limiting different action types (login, password_reset, signup).';
COMMENT ON FUNCTION check_rate_limit IS 'Check if an action should be rate limited. Returns allowed status, remaining attempts, and retry time.';
COMMENT ON FUNCTION record_login_attempt IS 'Record a login attempt. Clears failed attempts on successful login.';
