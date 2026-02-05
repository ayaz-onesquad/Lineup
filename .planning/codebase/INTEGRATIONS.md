# External Integrations

**Analysis Date:** 2026-02-05

## APIs & External Services

**Supabase (Primary Backend):**
- Authentication & User Management
  - SDK/Client: `@supabase/supabase-js` v2.94.0
  - Auth: Environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  - Implementation in `src/services/supabase.ts`
  - Features:
    - Email/password authentication
    - Session management with auto-refresh
    - Password reset flow
    - User metadata for profile data

## Data Storage

**Database:**
- Supabase PostgreSQL
  - Connection: Via `@supabase/supabase-js` client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  - Client: Native Supabase JS SDK (no ORM - direct `.from()` queries)
  - Tables (inferred from API services):
    - `auth.users` - Supabase built-in auth
    - `public.user_profiles` - User profile data with `user_id` (UUID) foreign key
    - `public.tenants` - Multi-tenant organization data
    - `public.tenant_users` - User-tenant relationships with role assignments
    - `public.clients` - Client records with `tenant_id` isolation
    - `public.contacts` - Client contacts with `tenant_id` isolation
    - `public.projects` - Project records with `tenant_id` isolation
    - `public.project_phases` - Phase records with `tenant_id` isolation
    - `public.sets` - Set/requirement grouping with `tenant_id` isolation
    - `public.requirements` - Individual requirements with `tenant_id` isolation
    - `public.documents` - Document storage metadata with `tenant_id` isolation
    - `public.discussions` - Comments/discussions with `tenant_id` isolation
    - `public.status_updates` - Status update history with `tenant_id` isolation
  - Soft deletes: All tables filter for `deleted_at IS NULL`
  - Isolation: All tables (except `auth.users` and `user_profiles`) include `tenant_id` for row-level security
  - Query patterns: `src/services/api/*` files (`clients.ts`, `projects.ts`, `phases.ts`, `sets.ts`, `requirements.ts`, `contacts.ts`, `documents.ts`, `discussions.ts`, `statusUpdates.ts`, `tenants.ts`, `auth.ts`)

**Row-Level Security (RLS):**
- Implemented via Supabase RLS policies
- All multi-tenant tables enforce `tenant_id` filtering
- RPC function `get_user_highest_role` in `src/services/api/auth.ts` for role-based access (uses `SECURITY DEFINER`)
- Roles enforced: `sys_admin`, `org_admin`, `org_user`, `client_user`

**File Storage:**
- Not detected - likely using Supabase Storage (referenced in Document type but implementation not yet visible)
- Document records store metadata: `file_url`, `file_type`, `file_size_bytes`

**Caching:**
- TanStack React Query (client-side only)
  - Stale time: 5 minutes
  - Retry: 1 attempt on failure
  - Configured in `src/App.tsx` via `QueryClient`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built-in PostgreSQL auth)
  - Implementation: `src/services/api/auth.ts` and `src/components/providers/AuthProvider.tsx`
  - Session persistence: Enabled via browser storage
  - Auto-refresh: Enabled for token lifecycle management
  - Features:
    - `authApi.signUp()` - Create new user with email/password
    - `authApi.signIn()` - Authenticate with credentials
    - `authApi.signOut()` - Revoke session
    - `authApi.resetPassword()` - Trigger password reset email
    - `authApi.updatePassword()` - Change password
    - Session detection from URL (for reset/verify flows)

**Role-Based Access:**
- Source of truth: `useUserRole` hook calling RPC `get_user_highest_role`
- Alternative: Direct `tenant_users` table queries for per-tenant roles
- Four-tier hierarchy: `sys_admin` > `org_admin` > `org_user` > `client_user`
- Routing logic:
  - `sys_admin` → `/admin` portal (via `AdminGuard` in `src/components/guards/AdminGuard.tsx`)
  - `org_admin`/`org_user` → `/dashboard` main app (via `TenantGuard` in `src/components/guards/TenantGuard.tsx`)
  - New users → `/onboarding` tenant setup
  - `client_user` → `/portal` client-facing view

## Monitoring & Observability

**Error Tracking:**
- Not detected

**Logs:**
- Console logging only (console.error seen in `src/services/api/auth.ts`)
- No structured logging or third-party logging service

## CI/CD & Deployment

**Hosting:**
- Not detected (static SPA deployment expected)

**CI Pipeline:**
- Not detected

**Build Output:**
- Vite builds to `dist/` directory (configured in `eslint.config.js` globalIgnores)

## Environment Configuration

**Required env vars:**
- `VITE_SUPABASE_URL` - Supabase project URL (from `.env.example`)
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous public key (from `.env.example`)

**Secrets location:**
- `.env` file (local development, not committed)
- `.env.example` shows template (committed to repo)

## Webhooks & Callbacks

**Incoming:**
- Not detected

**Outgoing:**
- Supabase Auth password reset: Configured with redirect to `${window.location.origin}/reset-password` in `src/services/api/auth.ts`

## Multi-Tenant Architecture

**Tenant Isolation:**
- Every record (except system auth and user profiles) carries `tenant_id`
- Query filtering: All `src/services/api/*` queries filter by current `tenant_id`
- Enforcement: Row-Level Security policies in Supabase
- Tenant switching: Via `tenantStore` (Zustand) in `src/stores/tenantStore.ts`

**Current Tenant Access:**
- `useAuthStore().currentTenantId` for UI state
- Passed as parameter to all API calls
- Guards check tenant assignment before rendering protected routes

---

*Integration audit: 2026-02-05*
