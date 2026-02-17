-- Migration 035: Add check_email_exists function
-- Allows checking if an email already exists in auth.users before creating a new user

-- ============================================================================
-- 1. Create function to check if email exists in auth.users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    -- Check auth.users table (requires SECURITY DEFINER)
    RETURN EXISTS (
        SELECT 1 FROM auth.users
        WHERE LOWER(email) = LOWER(p_email)
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO service_role;

-- ============================================================================
-- 2. Add comment
-- ============================================================================
COMMENT ON FUNCTION public.check_email_exists(TEXT) IS 'Returns true if email already exists in auth.users table';
