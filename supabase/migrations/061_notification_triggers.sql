-- Migration 061: Notification Dispatch Triggers
--
-- Creates PostgreSQL triggers that fire when notification-worthy events occur:
-- 1. task.assigned - When a requirement is assigned to a user
-- 2. user.welcome - When a new user is added to a tenant
--
-- These triggers use pg_net.http_post() to call the send-notification Edge Function
--
-- REQUIRED: Before running this migration, set the following database settings:
-- You can set these in Supabase Dashboard > SQL Editor, or via psql:
--
--   ALTER DATABASE postgres SET app.app_url = 'https://your-app.vercel.app';
--   ALTER DATABASE postgres SET app.supabase_url = 'https://your-project-ref.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';

-- ============================================================================
-- 0. ENABLE PG_NET EXTENSION
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA net;

-- ============================================================================
-- 1. DATABASE CONFIGURATION (REQUIRED - REPLACE THESE VALUES)
-- ============================================================================
-- REQUIRED: Replace these values before running this migration.
-- These settings are used by the trigger functions to call the Edge Function.

-- Uncomment and modify these lines with your actual values:
-- ALTER DATABASE postgres SET app.app_url = 'https://your-app.vercel.app';
-- ALTER DATABASE postgres SET app.supabase_url = 'https://your-project-ref.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';

-- ============================================================================
-- 2. TRIGGER FUNCTION: task.assigned
-- ============================================================================
-- Fires when a requirement is assigned to a user (INSERT or UPDATE with new assigned_to_id)

CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_app_url TEXT;
    v_supabase_url TEXT;
    v_service_role_key TEXT;
    v_edge_function_url TEXT;
    v_recipient_email TEXT;
    v_recipient_first_name TEXT;
    v_recipient_user_id UUID;
    v_assigner_name TEXT;
    v_project_name TEXT;
    v_tenant_name TEXT;
    v_due_date TEXT;
    v_task_url TEXT;
    v_payload JSONB;
BEGIN
    -- Get configuration from database settings
    v_app_url := current_setting('app.app_url', true);
    v_supabase_url := current_setting('app.supabase_url', true);
    v_service_role_key := current_setting('app.service_role_key', true);

    -- Skip if configuration is missing
    IF v_app_url IS NULL OR v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
        RAISE WARNING 'Notification trigger skipped: app configuration not set. Run ALTER DATABASE postgres SET app.app_url/supabase_url/service_role_key';
        RETURN NEW;
    END IF;

    v_edge_function_url := v_supabase_url || '/functions/v1/send-notification';

    -- Get the assigned user's info (assigned_to_id references user_profiles.id)
    SELECT
        up.user_id,
        up.first_name,
        au.email
    INTO
        v_recipient_user_id,
        v_recipient_first_name,
        v_recipient_email
    FROM user_profiles up
    JOIN auth.users au ON au.id = up.user_id
    WHERE up.id = NEW.assigned_to_id;

    -- Skip if no email found
    IF v_recipient_email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the assigner's name (updated_by references auth.users.id)
    SELECT COALESCE(up.first_name || ' ' || COALESCE(up.last_name, ''), up.full_name, 'Someone')
    INTO v_assigner_name
    FROM user_profiles up
    WHERE up.user_id = NEW.updated_by;

    IF v_assigner_name IS NULL THEN
        v_assigner_name := 'A team member';
    END IF;

    -- Get project name if project_id exists
    IF NEW.project_id IS NOT NULL THEN
        SELECT name INTO v_project_name
        FROM projects
        WHERE id = NEW.project_id;
    END IF;

    IF v_project_name IS NULL THEN
        v_project_name := 'Unassigned Project';
    END IF;

    -- Get tenant name
    SELECT name INTO v_tenant_name
    FROM tenants
    WHERE id = NEW.tenant_id;

    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'Your Organization';
    END IF;

    -- Format due date
    IF NEW.expected_end_date IS NOT NULL THEN
        v_due_date := to_char(NEW.expected_end_date, 'Month DD, YYYY');
    ELSE
        v_due_date := 'Not set';
    END IF;

    -- Build task URL
    v_task_url := v_app_url || '/requirements/' || NEW.id::TEXT;

    -- Build payload
    v_payload := jsonb_build_object(
        'trigger_key', 'task.assigned',
        'tenant_id', NEW.tenant_id,
        'recipient_email', v_recipient_email,
        'variables', jsonb_build_object(
            'user_first_name', COALESCE(v_recipient_first_name, 'there'),
            'requirement_title', COALESCE(NEW.name, 'Untitled Task'),
            'project_name', v_project_name,
            'assigned_by', v_assigner_name,
            'due_date', v_due_date,
            'task_url', v_task_url,
            'tenant_name', v_tenant_name
        )
    );

    -- Fire and forget HTTP request to Edge Function
    -- pg_net queues the request asynchronously - won't block the transaction
    PERFORM net.http_post(
        url := v_edge_function_url,
        body := v_payload,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
        )
    );

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE WARNING 'notify_task_assigned error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on requirements table
-- Note: WHEN clause cannot reference TG_OP, so we use separate triggers
DROP TRIGGER IF EXISTS trigger_notify_task_assigned_insert ON requirements;
CREATE TRIGGER trigger_notify_task_assigned_insert
    AFTER INSERT ON requirements
    FOR EACH ROW
    WHEN (NEW.assigned_to_id IS NOT NULL AND NEW.deleted_at IS NULL)
    EXECUTE FUNCTION notify_task_assigned();

DROP TRIGGER IF EXISTS trigger_notify_task_assigned_update ON requirements;
CREATE TRIGGER trigger_notify_task_assigned_update
    AFTER UPDATE ON requirements
    FOR EACH ROW
    WHEN (
        NEW.assigned_to_id IS NOT NULL
        AND NEW.deleted_at IS NULL
        AND OLD.assigned_to_id IS DISTINCT FROM NEW.assigned_to_id
    )
    EXECUTE FUNCTION notify_task_assigned();

-- ============================================================================
-- 3. TRIGGER FUNCTION: user.welcome
-- ============================================================================
-- Fires when a new user is added to a tenant (INSERT into tenant_users)

CREATE OR REPLACE FUNCTION notify_user_welcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_app_url TEXT;
    v_supabase_url TEXT;
    v_service_role_key TEXT;
    v_edge_function_url TEXT;
    v_recipient_email TEXT;
    v_recipient_first_name TEXT;
    v_inviter_name TEXT;
    v_tenant_name TEXT;
    v_login_url TEXT;
    v_payload JSONB;
BEGIN
    -- Get configuration from database settings
    v_app_url := current_setting('app.app_url', true);
    v_supabase_url := current_setting('app.supabase_url', true);
    v_service_role_key := current_setting('app.service_role_key', true);

    -- Skip if configuration is missing
    IF v_app_url IS NULL OR v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
        RAISE WARNING 'Notification trigger skipped: app configuration not set. Run ALTER DATABASE postgres SET app.app_url/supabase_url/service_role_key';
        RETURN NEW;
    END IF;

    v_edge_function_url := v_supabase_url || '/functions/v1/send-notification';

    -- Get the new user's email and name
    SELECT
        au.email,
        COALESCE(up.first_name, split_part(up.full_name, ' ', 1), 'there')
    INTO
        v_recipient_email,
        v_recipient_first_name
    FROM auth.users au
    LEFT JOIN user_profiles up ON up.user_id = au.id
    WHERE au.id = NEW.user_id;

    -- Skip if no email found
    IF v_recipient_email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the inviter's name
    IF NEW.created_by IS NOT NULL THEN
        SELECT COALESCE(up.first_name || ' ' || COALESCE(up.last_name, ''), up.full_name, 'A team member')
        INTO v_inviter_name
        FROM user_profiles up
        WHERE up.user_id = NEW.created_by;
    END IF;

    IF v_inviter_name IS NULL THEN
        v_inviter_name := 'Your organization';
    END IF;

    -- Get tenant name
    SELECT name INTO v_tenant_name
    FROM tenants
    WHERE id = NEW.tenant_id;

    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'Your Organization';
    END IF;

    -- Build login URL
    v_login_url := v_app_url || '/login';

    -- Build payload
    v_payload := jsonb_build_object(
        'trigger_key', 'user.welcome',
        'tenant_id', NEW.tenant_id,
        'recipient_email', v_recipient_email,
        'variables', jsonb_build_object(
            'user_first_name', v_recipient_first_name,
            'tenant_name', v_tenant_name,
            'login_url', v_login_url,
            'inviter_name', v_inviter_name
        )
    );

    -- Fire and forget HTTP request to Edge Function
    -- pg_net queues the request asynchronously - won't block the transaction
    PERFORM net.http_post(
        url := v_edge_function_url,
        body := v_payload,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
        )
    );

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE WARNING 'notify_user_welcome error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on tenant_users table
DROP TRIGGER IF EXISTS trigger_notify_user_welcome ON tenant_users;
CREATE TRIGGER trigger_notify_user_welcome
    AFTER INSERT ON tenant_users
    FOR EACH ROW
    EXECUTE FUNCTION notify_user_welcome();

-- ============================================================================
-- 4. HELPER FUNCTION TO SET APP CONFIGURATION
-- ============================================================================
-- Convenience function for setting app configuration
-- Usage: SELECT set_notification_config('https://myapp.vercel.app', 'https://xxx.supabase.co', 'service_role_key');

CREATE OR REPLACE FUNCTION set_notification_config(
    p_app_url TEXT,
    p_supabase_url TEXT,
    p_service_role_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only sys_admin can set these
    IF NOT public.is_sys_admin() THEN
        RAISE EXCEPTION 'Only system administrators can configure notifications';
    END IF;

    EXECUTE format('ALTER DATABASE postgres SET app.app_url = %L', p_app_url);
    EXECUTE format('ALTER DATABASE postgres SET app.supabase_url = %L', p_supabase_url);
    EXECUTE format('ALTER DATABASE postgres SET app.service_role_key = %L', p_service_role_key);

    RETURN 'Configuration updated. Reconnect to database for changes to take effect.';
END;
$$;

GRANT EXECUTE ON FUNCTION set_notification_config(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================
COMMENT ON FUNCTION notify_task_assigned() IS 'Trigger function that sends task.assigned notification when a requirement is assigned';
COMMENT ON FUNCTION notify_user_welcome() IS 'Trigger function that sends user.welcome notification when a user is added to a tenant';
COMMENT ON FUNCTION set_notification_config(TEXT, TEXT, TEXT) IS 'Helper function to set notification configuration (SysAdmin only)';

-- ============================================================================
-- VERIFICATION QUERIES (run manually)
-- ============================================================================
-- Check if pg_net is enabled:
-- SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- Check current configuration:
-- SELECT current_setting('app.app_url', true), current_setting('app.supabase_url', true);

-- Test the trigger (dry run - check for warnings in logs):
-- INSERT INTO requirements (tenant_id, name, assigned_to_id, created_by, updated_by)
-- VALUES ('your-tenant-id', 'Test Task', 'user-profile-id', 'your-user-id', 'your-user-id');
