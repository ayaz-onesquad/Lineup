-- Migration 065: Discussion Notification Triggers
--
-- Creates PostgreSQL triggers that fire when discussion-worthy events occur:
-- 1. discussion.created - When a new discussion is started
-- 2. discussion.reply - When a reply is added to a discussion
--
-- IMPORTANT: These triggers only notify users in the participants array,
-- NOT all tenant users. This ensures targeted notifications.

-- ============================================================================
-- 1. TRIGGER FUNCTION: discussion.created
-- ============================================================================
-- Fires when a new top-level discussion is created (INSERT without parent_discussion_id)
-- Notifies all participants except the author

CREATE OR REPLACE FUNCTION notify_discussion_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_app_url TEXT;
    v_supabase_url TEXT;
    v_service_role_key TEXT;
    v_edge_function_url TEXT;
    v_author_name TEXT;
    v_tenant_name TEXT;
    v_discussion_url TEXT;
    v_entity_name TEXT;
    v_participant_id UUID;
    v_recipient_email TEXT;
    v_recipient_first_name TEXT;
    v_payload JSONB;
BEGIN
    -- Get configuration from database settings
    v_app_url := current_setting('app.app_url', true);
    v_supabase_url := current_setting('app.supabase_url', true);
    v_service_role_key := current_setting('app.service_role_key', true);

    -- Skip if configuration is missing
    IF v_app_url IS NULL OR v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
        RAISE WARNING 'Discussion notification skipped: app configuration not set';
        RETURN NEW;
    END IF;

    -- Skip if no participants (shouldn't happen, but be safe)
    IF NEW.participants IS NULL OR array_length(NEW.participants, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    v_edge_function_url := v_supabase_url || '/functions/v1/send-notification';

    -- Get the author's name
    SELECT COALESCE(up.first_name || ' ' || COALESCE(up.last_name, ''), up.full_name, 'Someone')
    INTO v_author_name
    FROM user_profiles up
    WHERE up.user_id = NEW.author_id;

    IF v_author_name IS NULL THEN
        v_author_name := 'A team member';
    END IF;

    -- Get tenant name
    SELECT name INTO v_tenant_name
    FROM tenants
    WHERE id = NEW.tenant_id;

    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'Your Organization';
    END IF;

    -- Get entity name based on entity_type
    IF NEW.entity_type = 'project' AND NEW.entity_id IS NOT NULL THEN
        SELECT name INTO v_entity_name FROM projects WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'phase' AND NEW.entity_id IS NOT NULL THEN
        SELECT name INTO v_entity_name FROM project_phases WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'set' AND NEW.entity_id IS NOT NULL THEN
        SELECT name INTO v_entity_name FROM sets WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'requirement' AND NEW.entity_id IS NOT NULL THEN
        SELECT name INTO v_entity_name FROM requirements WHERE id = NEW.entity_id;
    ELSIF NEW.entity_type = 'client' AND NEW.entity_id IS NOT NULL THEN
        SELECT name INTO v_entity_name FROM clients WHERE id = NEW.entity_id;
    END IF;

    IF v_entity_name IS NULL THEN
        v_entity_name := COALESCE(NEW.entity_type, 'Item');
    END IF;

    -- Build discussion URL
    v_discussion_url := v_app_url || '/discussions/' || NEW.id::TEXT;

    -- Loop through participants and send notifications (except the author)
    FOREACH v_participant_id IN ARRAY NEW.participants
    LOOP
        -- Skip the author - they don't need a notification for their own discussion
        IF v_participant_id = NEW.author_id THEN
            CONTINUE;
        END IF;

        -- Get participant's email and name
        SELECT
            au.email,
            COALESCE(up.first_name, split_part(up.full_name, ' ', 1), 'there')
        INTO
            v_recipient_email,
            v_recipient_first_name
        FROM auth.users au
        LEFT JOIN user_profiles up ON up.user_id = au.id
        WHERE au.id = v_participant_id;

        -- Skip if no email found
        IF v_recipient_email IS NULL THEN
            CONTINUE;
        END IF;

        -- Build payload (using variable names that match notification_templates for discussion.post)
        v_payload := jsonb_build_object(
            'trigger_key', 'discussion.post',
            'tenant_id', NEW.tenant_id,
            'recipient_email', v_recipient_email,
            'variables', jsonb_build_object(
                'user_first_name', v_recipient_first_name,
                'poster_name', v_author_name,
                'record_title', v_entity_name,
                'record_type', COALESCE(NEW.entity_type, 'item'),
                'post_excerpt', LEFT(NEW.content, 200) || CASE WHEN LENGTH(NEW.content) > 200 THEN '...' ELSE '' END,
                'discussion_url', v_discussion_url,
                'tenant_name', v_tenant_name
            )
        );

        -- Fire HTTP request to Edge Function
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
    END LOOP;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE WARNING 'notify_discussion_created error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on discussions table for new discussions (no parent)
DROP TRIGGER IF EXISTS trigger_notify_discussion_created ON discussions;
CREATE TRIGGER trigger_notify_discussion_created
    AFTER INSERT ON discussions
    FOR EACH ROW
    WHEN (NEW.parent_discussion_id IS NULL AND NEW.deleted_at IS NULL)
    EXECUTE FUNCTION notify_discussion_created();

-- ============================================================================
-- 2. TRIGGER FUNCTION: discussion.reply
-- ============================================================================
-- Fires when a reply is added to a discussion (INSERT with parent_discussion_id)
-- Notifies all participants of the parent discussion except the replier

CREATE OR REPLACE FUNCTION notify_discussion_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_app_url TEXT;
    v_supabase_url TEXT;
    v_service_role_key TEXT;
    v_edge_function_url TEXT;
    v_author_name TEXT;
    v_tenant_name TEXT;
    v_discussion_url TEXT;
    v_parent_title TEXT;
    v_parent_participants UUID[];
    v_participant_id UUID;
    v_recipient_email TEXT;
    v_recipient_first_name TEXT;
    v_payload JSONB;
BEGIN
    -- Get configuration from database settings
    v_app_url := current_setting('app.app_url', true);
    v_supabase_url := current_setting('app.supabase_url', true);
    v_service_role_key := current_setting('app.service_role_key', true);

    -- Skip if configuration is missing
    IF v_app_url IS NULL OR v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
        RAISE WARNING 'Discussion reply notification skipped: app configuration not set';
        RETURN NEW;
    END IF;

    v_edge_function_url := v_supabase_url || '/functions/v1/send-notification';

    -- Get parent discussion info (title and participants)
    SELECT title, participants
    INTO v_parent_title, v_parent_participants
    FROM discussions
    WHERE id = NEW.parent_discussion_id;

    -- Skip if parent not found or no participants
    IF v_parent_participants IS NULL OR array_length(v_parent_participants, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the replier's name
    SELECT COALESCE(up.first_name || ' ' || COALESCE(up.last_name, ''), up.full_name, 'Someone')
    INTO v_author_name
    FROM user_profiles up
    WHERE up.user_id = NEW.author_id;

    IF v_author_name IS NULL THEN
        v_author_name := 'A team member';
    END IF;

    -- Get tenant name
    SELECT name INTO v_tenant_name
    FROM tenants
    WHERE id = NEW.tenant_id;

    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'Your Organization';
    END IF;

    -- Build discussion URL (link to parent discussion)
    v_discussion_url := v_app_url || '/discussions/' || NEW.parent_discussion_id::TEXT;

    -- Loop through parent's participants and send notifications (except the replier)
    FOREACH v_participant_id IN ARRAY v_parent_participants
    LOOP
        -- Skip the replier - they don't need a notification for their own reply
        IF v_participant_id = NEW.author_id THEN
            CONTINUE;
        END IF;

        -- Get participant's email and name
        SELECT
            au.email,
            COALESCE(up.first_name, split_part(up.full_name, ' ', 1), 'there')
        INTO
            v_recipient_email,
            v_recipient_first_name
        FROM auth.users au
        LEFT JOIN user_profiles up ON up.user_id = au.id
        WHERE au.id = v_participant_id;

        -- Skip if no email found
        IF v_recipient_email IS NULL THEN
            CONTINUE;
        END IF;

        -- Build payload (using variable names that match notification_templates for discussion.reply)
        v_payload := jsonb_build_object(
            'trigger_key', 'discussion.reply',
            'tenant_id', NEW.tenant_id,
            'recipient_email', v_recipient_email,
            'variables', jsonb_build_object(
                'user_first_name', v_recipient_first_name,
                'replier_name', v_author_name,
                'record_title', COALESCE(v_parent_title, 'Discussion'),
                'reply_excerpt', LEFT(NEW.content, 200) || CASE WHEN LENGTH(NEW.content) > 200 THEN '...' ELSE '' END,
                'discussion_url', v_discussion_url,
                'tenant_name', v_tenant_name
            )
        );

        -- Fire HTTP request to Edge Function
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
    END LOOP;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE WARNING 'notify_discussion_reply error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on discussions table for replies (has parent)
DROP TRIGGER IF EXISTS trigger_notify_discussion_reply ON discussions;
CREATE TRIGGER trigger_notify_discussion_reply
    AFTER INSERT ON discussions
    FOR EACH ROW
    WHEN (NEW.parent_discussion_id IS NOT NULL AND NEW.deleted_at IS NULL)
    EXECUTE FUNCTION notify_discussion_reply();

-- ============================================================================
-- 3. COMMENTS
-- ============================================================================
COMMENT ON FUNCTION notify_discussion_created() IS 'Sends discussion.post notification ONLY to participants when a new discussion is started (not all tenant users)';
COMMENT ON FUNCTION notify_discussion_reply() IS 'Sends discussion.reply notification ONLY to participants when a reply is added (not all tenant users)';

-- ============================================================================
-- 4. RELOAD SCHEMA
-- ============================================================================
NOTIFY pgrst, 'reload schema';
