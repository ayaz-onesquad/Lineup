-- Migration 062: Fix Notification Trigger Functions
--
-- Fixes net.http_post calls to use the correct function signature:
--   net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
--
-- The previous migration used named parameters and was missing the params argument.
-- This migration replaces the functions with the correct positional argument syntax.

-- ============================================================================
-- 1. FIX TRIGGER FUNCTION: notify_task_assigned
-- ============================================================================

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
    -- Using correct positional arguments: url, body, params, headers, timeout_milliseconds
    PERFORM net.http_post(
        v_edge_function_url::text,
        v_payload,
        '{}'::jsonb,
        jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
        ),
        5000
    );

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE WARNING 'notify_task_assigned error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. FIX TRIGGER FUNCTION: notify_user_welcome
-- ============================================================================

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
    -- Using correct positional arguments: url, body, params, headers, timeout_milliseconds
    PERFORM net.http_post(
        v_edge_function_url::text,
        v_payload,
        '{}'::jsonb,
        jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
        ),
        5000
    );

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE WARNING 'notify_user_welcome error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. RELOAD SCHEMA
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================
COMMENT ON FUNCTION notify_task_assigned() IS 'Trigger function that sends task.assigned notification when a requirement is assigned (fixed net.http_post signature)';
COMMENT ON FUNCTION notify_user_welcome() IS 'Trigger function that sends user.welcome notification when a user is added to a tenant (fixed net.http_post signature)';
