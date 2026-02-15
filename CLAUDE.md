# CLAUDE.md — LineUp Project Memory

## 🚀 Vision & Methodology
**LineUp** is a multi-tenant SaaS for agencies using the **CORE methodology** (Capture, Organize, Review, Execute).

## 🏗 Essential Hierarchy
Always respect this 6-level data structure (Pitch is optional):
**Client ➔ Project ➔ Phase ➔ Set ➔ Pitch (optional) ➔ Requirement**.

Note: Since V2 (Migration 026), Pitches exist between Sets and Requirements as an optional grouping layer.

## 🔐 Multi-Tenant & Security Rules
- **Isolation:** Every table (except `users`) MUST have a `tenant_id`. Every query MUST filter by `currentTenantId`.
- **RLS:** Row Level Security is the source of truth. Use `SECURITY DEFINER` for role-based access.
- **Roles:** Handle four distinct roles: `sys_admin` (system), `org_admin` (tenant owner), `org_user` (team), and `client_user` (portal).

### Closed-Loop User Model (Migration 025)

**Public signup is DISABLED.** All users must be created by SysAdmin or OrgAdmin.

#### User Creation Paths
1. **SysAdmin Portal:** `/admin/tenants/:tenantId` → Users tab → "Create User" button
2. **OrgAdmin TeamPage:** `/settings/team` → "Create User" button
3. **Contact Conversion:** `/contacts/:contactId` → "Convert to Client User" button

#### User Creation Flow
```typescript
// Uses authApi.adminCreateUser which:
// 1. Saves current admin session
// 2. Creates auth user via supabase.auth.signUp
// 3. Restores admin session (prevents auto-login as new user)
// 4. Creates user_profile
// 5. Adds to tenant_users with specified role
```

#### client_users Table (Links Client Users to Specific Clients)
- **Purpose:** When a contact is converted to a client_user, they're linked to a specific client
- **Columns:** `id`, `tenant_id`, `user_id`, `client_id`, `contact_id`, audit fields
- **RLS:** Tenant-isolated via tenant_id

#### Convert Contact to Client User
1. Contact must be linked to at least one client
2. OrgAdmin/SysAdmin clicks "Convert to Client User" on ContactDetailPage
3. Enters email and temporary password
4. System creates auth user, adds to tenant_users as 'client_user', links in client_users table
5. Contact's portal access is scoped to the selected client

#### Test Users (supabase/seed.sql)
Run seed script to create test users for Playwright tests:
- `sysadmin@test.lineup.dev` / `TestPassword123!` → sys_admin
- `orgadmin@test.lineup.dev` / `TestPassword123!` → org_admin
- `orguser@test.lineup.dev` / `TestPassword123!` → org_user

### OWASP Security Standards (Added Phase 2.10)

#### Rate Limiting (Server-Side - Migration 016)
- **Auth Endpoints:** 5 requests per minute, 5 minute block after limit exceeded
- **Password Reset:** 3 requests per 15 minutes
- **Signup:** 3 requests per minute
- **API Mutations:** 30 requests per minute
- **API Queries:** 100 requests per minute

**Server-Side Implementation (Persists Across Page Refreshes):**
- **Database Tables:**
  - `login_attempts` - Tracks all login attempts (successful and failed)
  - `rate_limit_config` - Configurable rate limit settings per action type
- **RPC Functions:**
  - `check_rate_limit(p_email, p_action_type)` - Returns `{ allowed, remaining_attempts, retry_after_seconds }`
  - `record_login_attempt(p_email, p_success, p_ip_address, p_user_agent, p_error_message)` - Records attempt
  - `cleanup_login_attempts(p_older_than_hours)` - Cleans old records (run via cron)
- **Usage in auth.ts:**
  ```typescript
  // Check rate limit BEFORE auth attempt
  const { data } = await supabase.rpc('check_rate_limit', { p_email, p_action_type: 'login' })
  if (!data.allowed) throw new RateLimitError(...)

  // Record attempt AFTER auth (success or failure)
  await supabase.rpc('record_login_attempt', { p_email, p_success: !error })
  ```
- **Fallback:** Client-side rate limiting (`checkRateLimit()` from `@/lib/security`) if server-side fails
- **Error Response:** Return 429 Too Many Requests with `retryAfterMs` in error

#### Input Validation
- **Schema Validation:** All inputs validated via Zod schemas (React Hook Form + Zod)
- **UUID Validation:** Use `isValidUUID()` before database queries
- **Email Validation:** Use `isValidEmail()` for email inputs
- **Length Limits:** Enforce via `enforceMaxLength()` with `INPUT_LIMITS` constants
- **Mass Assignment Protection:** Use `pickAllowedFields()` to strip unexpected fields

#### Secret Management
- **NEVER hardcode secrets:** All API keys in `.env` files
- **Vite Exposure:** Only `VITE_*` prefixed variables are exposed to browser
- **Supabase Anon Key:** Acceptable to expose (RLS provides real security)
- **Service Role Key:** NEVER expose - server-side only
- **Rotation:** Rotate keys if repository is ever public

#### SysAdmin Exceptions
- Rate limiting does NOT apply to authenticated SysAdmin actions
- SysAdmin bypass is determined by checking role BEFORE rate limit check
- Pattern: `if (role !== 'sys_admin') checkRateLimit(...)`

### SysAdmin Portal Security (Migration 018)

#### RLS Policies for SysAdmin Operations
- **is_sys_admin() Function:** Helper function to check if current user is sys_admin
- **user_profiles Policies:** SysAdmin can INSERT/UPDATE any user profile (for admin user creation)
- **tenant_users Policies:** SysAdmin can SELECT/INSERT tenant_users for any tenant
- **tenants Policies:** SysAdmin can SELECT/UPDATE/DELETE/INSERT any tenant

#### SysAdmin Data Isolation
- **Tenant Users Tab:** Filter out users with `sys_admin` role - they are global, not tenant-specific
- **Pattern:** `users?.filter(u => u.role !== 'sys_admin')`
- **Reasoning:** SysAdmins access all tenants via their global role, not tenant membership

#### Tenant Deletion Safety Workflow (High-Security)

**Step 1: Deactivation (Soft Block)**
- Button: "Deactivate Tenant" (yellow/warning style)
- Action: Sets `status = 'inactive'` via `deactivate_tenant(p_tenant_id)` RPC
- Effect: Blocks ALL users from logging into this tenant
- Reversible: Can reactivate at any time

**Step 2: Permanent Deletion (Hard Delete)**
- Only visible AFTER tenant is deactivated (status = 'inactive')
- Requires signature confirmation: User must type exact tenant name
- Uses: `permanently_delete_tenant(p_tenant_id, p_confirmation_name)` RPC
- Validation: RPC checks that tenant is inactive AND name matches
- IRREVERSIBLE: Permanently removes all tenant data

**UI Implementation:**
```tsx
// Active tenant → Show Deactivate button
// Inactive tenant → Show Reactivate + Permanently Delete buttons
// Deleted tenant → Show Restore button (soft delete recovery)

{tenant.status === 'inactive' ? (
  <>
    <Button onClick={handleRestore}>Reactivate</Button>
    <Button variant="destructive" onClick={openDeleteDialog}>
      Permanently Delete
    </Button>
  </>
) : (
  <Button onClick={handleDeactivate}>Deactivate Tenant</Button>
)}
```

**Database Functions (Migration 018):**
- `is_sys_admin()` - Returns boolean if current user is sys_admin
- `deactivate_tenant(p_tenant_id)` - Sets status to 'inactive'
- `permanently_delete_tenant(p_tenant_id, p_confirmation_name)` - Hard delete with validation
- `check_tenant_access(p_tenant_id)` - Checks if tenant is accessible for login

#### SysAdmin Logout Behavior
- SysAdmin logout redirects to `/login`, NOT `/admin/login`
- Same login flow for all users - role detected post-authentication

#### SysAdmin Tenant Creation
- Use `tenantsApi.createTenantOnly()` - creates tenant without adding SysAdmin as org_admin
- SysAdmins access all tenants via their global role
- Regular user onboarding uses `tenantsApi.create()` which adds creator as org_admin

#### Security Utilities Location
All security utilities are in `/src/lib/security.ts`:
- `checkRateLimit(key, config)` - Rate limit check
- `RATE_LIMITS` - Predefined rate limit configurations
- `RateLimitError` - Custom error class with retry info
- `isValidEmail(email)` - Email format validation
- `isValidUUID(str)` - UUID format validation
- `validatePasswordStrength(password)` - Password strength check
- `enforceMaxLength(input, maxLength)` - Input truncation
- `pickAllowedFields(input, allowedFields)` - Mass assignment protection
- `debounce(fn, key, delayMs)` - Request debouncing
- `retryWithBackoff(fn, maxAttempts, baseDelayMs)` - Exponential backoff

## 🚦 Authorization & Routing (The "No-Loop" Logic)
- **Source of Truth:** Use the `useUserRole` hook (calling the `get_user_highest_role` RPC). Do NOT rely on potentially stale Zustand `authStore` roles.
- **sys_admin Branch:** If role is `sys_admin`, redirect to `/admin`. Bypass `/onboarding` entirely.
- **Tenant Branch:** If role is `org_admin/user`, redirect to `/dashboard`.
- **New User:** If authenticated but NO tenant/role exists, redirect to `/onboarding`.
- **Loading States:** Use `isPending && fetchStatus !== 'idle'` for TanStack Query loading checks to prevent infinite spinners.

## 💻 Technical Standards
- **Stack:** React 19, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query v5, Zustand.
- **State:** Zustand for UI/Auth; React Query for all server data.
- **Forms:** React Hook Form + Zod for all validation.
- **Soft Deletes:** Filter for `deleted_at IS NULL` on all Select queries.

## 🛠 Database & Logic Rules (Updated)
- **ID System:** Every table MUST have a `display_id` (auto-incrementing integer/auto-number) and a `uuid` (primary key).
- **Audit Logs:** Every table MUST include: `created_at`, `created_by`, `updated_at`, `updated_by` (UUIDs referencing `profiles.id`).
- **Persistence:** On object creation, automatically link `tenant_id` from the current active session.
- **Priority Logic:** Use Eisenhower Matrix (Urgency/Importance) to auto-calculate `priority` (1-6).
- **Relationships:** All parent-child linkages must be editable via searchable dropdowns in Edit Mode.

### Eisenhower Matrix Priority Mapping (Migration 020)

The `priority` field on `sets` and `requirements` tables is auto-calculated via database trigger:

| Priority | Importance | Urgency | Quadrant | Action |
|----------|-----------|---------|----------|--------|
| 1 | Critical | High | Do First | Crisis/Fire |
| 2 | High | High | Do First | Important & Urgent |
| 3 | High | Medium | Schedule | Important, Plan |
| 4 | Medium | Medium | Plan | Routine |
| 5 | Medium | Low | Delegate | Low Priority |
| 6 | Low | Low | Eliminate | Defer/Drop |

**Implementation:**
- **Database:** Trigger `calculate_*_priority_trigger` auto-sets `priority` on INSERT/UPDATE of urgency or importance
- **Frontend:** Use `calculateEisenhowerPriority(importance, urgency)` from `@/lib/utils` for immediate UI feedback
- **Backfill:** Migration 020 backfills all existing sets/requirements

**Usage Pattern:**
```typescript
import { calculateEisenhowerPriority } from '@/lib/utils'

// Frontend preview (database trigger sets final value)
const priority = calculateEisenhowerPriority(importance, urgency)
```

### Task Indexing (Migration 021)

Requirements can be marked as "Tasks" for Global Task view indexing:

- **Field:** `is_task` BOOLEAN on `requirements` table (default: false)
- **UI:** "Mark as Task" toggle next to Type dropdown on RequirementDetailPage
- **Query:** Use `global_tasks` view for efficient task queries
- **Index:** `idx_requirements_is_task` optimizes `is_task = true AND assigned_to_id` queries

**Global Tasks View:**
```sql
SELECT * FROM global_tasks WHERE assigned_to_id = :userId
```

### ENUM Types
- **client_status:** `onboarding`, `active`, `inactive`, `prospective` (default: onboarding for new clients).
- **referral_source:** `referral`, `website`, `social_media`, `advertising`, `event`, `partner`, `cold_outreach`, `other`.
- **contact_role:** `owner`, `executive`, `manager`, `coordinator`, `technical`, `billing`, `other`.

### Entity Rules
- **Clients:** Use `create_client_with_contact` RPC for atomic client + primary contact creation.
- **Contacts:** Linked to clients via `client_contacts` join table (many-to-many). Email is optional.
- **Primary Contact:** The `is_primary` field lives on `client_contacts`, not `contacts`. A contact can be primary for Client A but not Client B.
- **Query Invalidation:** After mutations, invalidate both specific entity queries AND parent entity queries.

### RLS Requirements for Join Tables

When creating join tables (like `client_contacts`), you MUST implement RLS policies:

```sql
-- Enable RLS
ALTER TABLE join_table_name ENABLE ROW LEVEL SECURITY;

-- SELECT: Access via parent entity's tenant
CREATE POLICY "select_policy" ON join_table_name
    FOR SELECT USING (
        parent_id IN (
            SELECT id FROM parent_table
            WHERE tenant_id IN (
                SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
    );

-- INSERT/UPDATE/DELETE: Restrict to org_admin/org_user roles
CREATE POLICY "insert_policy" ON join_table_name
    FOR INSERT WITH CHECK (
        parent_id IN (
            SELECT id FROM parent_table
            WHERE tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
            )
        )
    );
```

**Join Table Checklist:**
1. Enable RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
2. Add SELECT policy (tenant access via parent)
3. Add INSERT policy (role-restricted)
4. Add UPDATE policy (role-restricted)
5. Add DELETE policy (role-restricted)
6. Include audit columns: `created_by`, `updated_by`, `created_at`, `updated_at`

**Current Join Tables:**
- `client_contacts` - links clients and contacts (has own tenant_id + RLS via client_id → clients.tenant_id)
- `tenant_users` - links tenants and users (special case - used for RLS itself)

**client_contacts Mandatory Fields:**
- `client_id` - Required, references clients(id)
- `contact_id` - Required, references contacts(id)
- `tenant_id` - Auto-populated via trigger from parent client (migration 011)
- `is_primary` - Boolean, determines primary contact for that client-contact relationship

## 🎨 UI/UX Standards

### Design System
- **IBM Carbon Aesthetic:** Use `page-carbon` class for #f4f4f4 backgrounds, `card-carbon` for cards.
- **Mendix-Style View/Edit:** Use `ViewEditField` component for inline field editing without layout shift.
- **Required Fields:** Mark with red asterisks (*) using the `required` prop on ViewEditField.
- **Edit Mode Scope:** In Edit Mode, only allow editing of fields that belong strictly to the current table. Related entity fields (e.g., Primary Contact on Client page) should be read-only or displayed as navigation links, since they belong to a different table (contacts, not clients).

### Page Patterns
- **DetailPages:** Full-page views with View/Edit toggle. URL param `?edit=true` auto-enters edit mode.
- **Tab Order:** Always 1. Details (with Primary Contact/Parent info), 2. Child entities (Contacts, Projects, Phases, Sets).
- **Child Tabs:** Use Data Grid (Table) format for all child entity lists, not cards.

### Navigation & Interaction
- **Single-Click:** Opens QuickView sidebar (openDetailPanel).
- **Double-Click:** Navigates to full DetailPage (onDoubleClick on TableRow).
- **Back Arrows:** Pop history stack via `navigate(-1)`.
- **Contextual Creation:** "Create New" buttons auto-populate parent ID from context.

### Components
- **ViewEditField:** For Mendix-style fields (`type: text|select|badge|switch|textarea|date|custom`).
  - Add `searchable` prop to `type="select"` for searchable dropdown behavior
  - Add `clearable` prop to allow clearing the selection
- **SearchableSelect:** For searchable dropdown fields with cascading filter support.
- **AuditTrail:** Display created_at/updated_at with creator/updater names.

## ⌨️ Common Commands
- `npm run dev`: Start dev server
- `npm run build`: Production check
- `npx remotion preview`: Preview video skills
- Schema cache refresh: After DB migrations, run `supabase/refresh-schema-cache.sql` in Supabase SQL Editor

## 📋 Phase 2 Retrospective: 400 Bad Request Errors

### Root Cause
The 400 errors occurred because API services used **incorrect PostgREST foreign key hints** to join tables. The pattern `user_profiles!table_column_fkey` was used, but:

1. **Wrong FK Target:** Columns like `owner_id`, `lead_id`, `created_by` reference `auth.users(id)`, NOT `user_profiles.id`
2. **Different Primary Keys:** `user_profiles` has its own `id` column, plus a `user_id` column that references `auth.users.id`
3. **No Direct FK Path:** PostgREST requires a direct foreign key relationship; multi-hop joins (sets → auth.users → user_profiles) are not supported via FK hints

### Affected Services
All services using the broken FK hint pattern:
- `sets.ts` - owner, lead, secondary_lead, pm, creator, updater
- `requirements.ts` - assigned_to, lead, secondary_lead, pm, reviewer, creator, updater
- `phases.ts` - owner
- `discussions.ts` - author
- `statusUpdates.ts` - author
- `documents.ts` - uploader
- `tenants.ts` - user_profiles

### Fix Applied
1. **Removed broken FK hints** from all `.select()` queries
2. **Separate profile fetches** where needed (e.g., `tenants.getUsers` now queries user_profiles separately and maps them)
3. **Protected parent IDs in updates** - Removed `client_id`, `project_id`, `set_id` from cleanUUIDFields in update functions to prevent accidental nullification

### Prevention for Phase 3
1. **Verify FK relationships before using hints:** Check the actual FK constraint target in migrations before using `table!fk_name` syntax
2. **Use separate queries for cross-table joins:** When FK doesn't point directly to the desired table, query separately and join in application code
3. **Test API calls in dev:** Use browser DevTools Network tab to verify 200 responses before committing
4. **Parent ID protection:** Never include parent foreign keys (client_id, project_id, set_id) in update mutations - these should be immutable after creation

### FK Reference Guide
| Column | References | Use in Select/Dropdown |
|--------|------------|------------------------|
| `clients.relationship_manager_id` | `user_profiles(id)` | Use `user_profiles.id`, NOT `user_id` |
| `*.created_by`, `*.updated_by` | `auth.users(id)` | Cannot directly join to user_profiles; use separate query |
| `*.owner_id`, `*.lead_id`, `*.pm_id` | `auth.users(id)` | Cannot directly join to user_profiles; use separate query |
| `contacts.client_id` | `clients(id)` | Can use PostgREST join: `clients (id, name)` |
| `projects.client_id` | `clients(id)` | Can use PostgREST join: `clients (*)` |

## 📐 Phase 2 Patterns Established

### Detail Page Layout Pattern
- **Header Card:** Keep minimal - only the 3-4 most important identifying fields (Name, Status, Primary Parent)
- **Details Tab:** Organize into logical sections (e.g., "Client Information", "Contact Information", "Schedule")
- **Child Tabs:** Each child entity type gets its own tab with Data Grid (Table) format

### Requirements Cross-Entity Access
Requirements can be viewed at multiple levels using cascade queries:
- **Client Level:** `useRequirementsByClient(clientId)` - fetches all requirements across all client projects
- **Project Level:** `useRequirementsByProject(projectId)` - fetches requirements for all project sets
- **Set Level:** `useRequirementsBySet(setId)` - fetches requirements for a specific set

### Many-to-Many Relationships
- **client_contacts:** Join table linking clients and contacts (allows one contact to serve multiple clients)
- **Pattern:** Use separate API endpoints for link/unlink operations, not direct foreign keys

### Constants Location
Shared option arrays (for dropdowns) should be defined in `/src/lib/utils.ts`:
- `REFERRAL_SOURCE_OPTIONS` - Client referral source values
- `STATUS_OPTIONS` - Various entity status values

## 🧭 Navigation Standards

### Breadcrumb Pattern
Use simplified breadcrumbs showing only entity names, not category labels:
- **Project Page:** `[Client Name] > [Project Name]`
- **Set Page:** `[Client Name] > [Project Name] > [Set Name]`
- **Requirement Page:** `[Client Name] > [Project Name] > [Set Name]` (title shown separately in header)
- **Contact Page:** `Contacts > [Contact Name]` (contacts can belong to multiple clients)

Do NOT include labels like "Clients", "Projects", "Sets" in the middle of breadcrumbs.

### Data Grid Column Standards
Overview pages MUST use Table format with these columns:

**Sets Overview Grid:**
- Client, Project, Set Name, Status, Assigned To

**Requirements Overview Grid:**
- Client, Project, Set, Title, Assigned To, Status

### Requirement Detail Page Layout
- **Header Row 1 (Breadcrumbs):** Client > Project > Set
- **Header Row 2 (Card):** Title, Type, Status (editable)
- **Details Tab:** Contains Urgency/Importance (Priority section), Description, Schedule, Assignment

### Tab Actions
All child entity tabs inside detail pages MUST have a "Create New" button at the top:
- ClientDetailPage: Sets tab has "Create Set" button
- ClientDetailPage: Requirements tab has "Create Requirement" button
- ProjectDetailPage: Sets tab has "Create Set" button
- SetDetailPage: Requirements tab has "Add Requirement" button

### Contextual Filtering (Derrick Rose Rule)
When showing related entities in tabs, ALWAYS filter by the parent entity ID:
- On ContactDetailPage: Show clients linked TO THIS CONTACT (via client_contacts), not other contacts
- On ClientDetailPage: Show contacts linked TO THIS CLIENT
- Prevent showing unrelated data from the same table

## 📋 Phase 2.5 Critical Fixes (Punch List)

### Database Schema Changes (Migration 009)

1. **client_status ENUM:** Added `prospective` value (now: `onboarding`, `active`, `inactive`, `prospective`)
2. **is_primary column:** Moved from `contacts` table to `client_contacts` join table (migration 008)
3. **sets.client_id:** Added direct client reference - Sets now only require Client ID, Project ID is optional
4. **client_contacts audit:** Added `created_by`, `updated_by`, `updated_at` columns

### FK Reference Updates (Critical)

**User profile references in forms:**
- All team member dropdowns (owner_id, lead_id, pm_id, etc.) MUST use `user_profiles.id`, NOT `user_id`
- The FK constraints in sets/requirements tables now point to `user_profiles(id)`
- Form options should filter: `users?.filter(u => u.user_profiles?.id).map(u => ({ value: u.user_profiles!.id, ... }))`

### UI/UX Changes

1. **All dropdowns use SearchableSelect:** Status, Industry, Referral Source, Contact Role, etc.
2. **ClientForm contact selection:** Option to select existing contact OR create new
3. **ProjectDetailPage layout:**
   - Header: Client (1st), Project Name, Status, Health
   - Progress section moved to Details tab
   - Project Code removed from UI
4. **Sets tab double-click:** Now navigates to SetDetailPage

### New Features

1. **SysAdmin Create User:** AdminTenantDetailPage → Users tab → Create User button
   - Fields: First Name*, Last Name*, Email*, Password*, Role*, Phone, Timezone, Send Welcome Email toggle
   - Creates auth user + user_profile + tenant_users entry

### Sets Model Change

Sets can now exist without a Project:
- **Required:** `client_id` - direct link to client
- **Optional:** `project_id`, `phase_id`
- Schema constraint: `client_id IS NOT NULL OR project_id IS NOT NULL`

### Constants Added to utils.ts

- `CLIENT_STATUS_OPTIONS` - with descriptions
- `REFERRAL_SOURCE_OPTIONS`
- `CONTACT_ROLE_OPTIONS`
- `URGENCY_OPTIONS`
- `IMPORTANCE_OPTIONS`

### Hooks Added

- `useCreateClient()` - standalone client creation
- `useLinkContactToClient()` - link existing contact to client
- `useCreateContact()` - standalone contact creation
- `useAllContacts()` - fetch all contacts for tenant

## 📋 Phase 2.6 Critical Fixes: client_contacts and is_primary

### Problem Summary
Three critical errors were occurring during client creation:
1. `null value in column "tenant_id" of relation "client_contacts"` - tenant isolation
2. `column "is_primary" of relation "contacts" does not exist` - schema mismatch
3. RPC function `create_client_with_contact` was outdated

### Root Causes

**is_primary Location:**
- Migration 008 removed `is_primary` from `contacts` table
- `is_primary` now lives ONLY in `client_contacts` join table
- The RPC function and contacts.ts service were still trying to set `is_primary` on contacts

**tenant_id in Join Tables:**
- `client_contacts` was created without `tenant_id` column
- RLS worked via client_id → clients.tenant_id but direct tenant queries failed
- Added `tenant_id` column with auto-populate trigger for consistency

### Fixes Applied (Migration 011)

1. **Added tenant_id to client_contacts:**
   - New column `tenant_id UUID REFERENCES tenants(id)`
   - Backfill existing records from parent client
   - Trigger `set_client_contacts_tenant_id` auto-populates on INSERT

2. **Updated create_client_with_contact RPC:**
   - Removed `is_primary` from contacts INSERT
   - Added client_contacts INSERT with `is_primary = true`
   - Passes tenant_id to client_contacts

3. **Fixed contacts.ts service:**
   - `create()`: Destructures `is_primary` out before contacts INSERT
   - `linkToClient()`: Trigger auto-populates tenant_id

### Verification Checklist
After running migration 011:
- [ ] Can create new client with "Create New Contact" option
- [ ] Can create new client with "Select Existing Contact" option
- [ ] Primary contact displays correctly on ClientDetailPage
- [ ] No 400 errors in Network tab
- [ ] No NOT NULL constraint errors in console

### Schema Reference (client_contacts)
```sql
CREATE TABLE client_contacts (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),  -- Auto-populated via trigger
    client_id UUID NOT NULL REFERENCES clients(id),
    contact_id UUID NOT NULL REFERENCES contacts(id),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ,
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    UNIQUE(client_id, contact_id)
);
```

### Prevention Rules
1. **is_primary:** NEVER put on contacts table - only in client_contacts
2. **tenant_id for join tables:** Either add column with trigger OR ensure RLS handles via parent
3. **RPC functions:** Update when schema changes (they don't auto-update with migrations)

## 📋 Phase 2.7 Relational Refinement Fixes

### Issues Addressed (Migration 012)

1. **Fix Referral Source ENUM Type Mismatch**
   - **Problem:** `create_client_with_contact` RPC was sending `referral_source` as TEXT, but the column is `referral_source` ENUM type
   - **Fix:** Added explicit `::referral_source` type cast in the RPC function
   - **Location:** `supabase/migrations/012_fix_referral_source_enum.sql`

2. **Dual-Mode Contact Editing on ClientDetailPage**
   - **Edit Global Info:** Updates `contacts` table fields (first_name, last_name, email, phone, relationship)
   - **Edit Relationship:** Updates client-specific relationship (role, is_primary via client_contacts)
   - **Pattern:** Separate dialogs for each mode with clear descriptions

3. **Set Form Date Fields Added**
   - Added `expected_start_date` and `expected_end_date` to SetForm.tsx
   - Schema already had these columns; now exposed in the creation form
   - Organized in a 3-column grid with Due Date

4. **Requirements Grid "Assigned To" Fix**
   - **Problem:** Assigned To column was empty because API queries didn't join user_profiles
   - **Fix:** Added `assigned_to:assigned_to_id (id, full_name, avatar_url)` to all requirement query methods
   - **Affected methods:** `getAll`, `getBySetId`, `getByProjectId`, `getByClientId`, `getByAssignedTo`, `getById`

5. **Sets Team Member Display Fix**
   - Added team member profile joins to sets API: `owner`, `lead`, `secondary_lead`, `pm`
   - Both `getAll` and `getById` now include these relations for proper display

### Date Format Standard
All dates use "Month Day, Year" format (e.g., "Jan 15, 2024") via:
```typescript
d.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})
```

### PostgREST Join Pattern for user_profiles
When FK references `user_profiles(id)`, use this join syntax:
```typescript
.select(`
  *,
  assigned_to:assigned_to_id (id, full_name, avatar_url),
  lead:lead_id (id, full_name, avatar_url)
`)
```

The pattern `field_alias:foreign_key_column (columns)` creates a proper join.

### Verification Checklist
After running migration 012:
- [ ] Can create client with `prospective` status and any referral source
- [ ] No PostgreSQL type error for referral_source
- [ ] "Edit Global Info" updates contact name/email across all client links
- [ ] "Edit Relationship" updates role/is_primary for specific client only
- [ ] SetForm shows Expected Start, Expected End, and Due Date fields
- [ ] RequirementsPage grid shows Assigned To with name and avatar
- [ ] SetsPage grid shows Assigned To (owner or lead)

## 📋 Phase 2.8 Critical Fixes: Triggers, Sets, and Many-to-Many

### Issues Addressed (Migration 013)

1. **Fixed Contacts Trigger Bug**
   - **Problem:** `ensure_single_primary_contact_trigger` on `contacts` table still referenced `NEW.is_primary` which was removed in migration 008
   - **Error:** `record "new" has no field "is_primary"`
   - **Fix:** Dropped obsolete trigger and function from contacts table (migration 013)
   - **Note:** The correct trigger `ensure_single_primary_client_contact_trigger` lives on `client_contacts` table

2. **Set Detail Page Editable Relationships**
   - **Problem:** Client and Project fields were read-only in edit mode
   - **Fix:** Added SearchableSelect dropdowns for Client and Project in SetDetailPage
   - **Cascade:** When client changes, project resets if it doesn't belong to new client

3. **Set Form Cleanup**
   - **Removed:** `due_date` field from SetForm (per user request)
   - **Kept:** `expected_start_date` and `expected_end_date` in 2-column layout

4. **Sets API client_id Persistence Fix**
   - **Problem:** client_id was being cleared on save when no project selected
   - **Fix:** Added `client_id` to cleanUUIDFields in sets.ts update function

### 3-Step Client + Contact Creation Standard

When creating a client with a contact, the RPC must execute three distinct steps in a single transaction:

```sql
-- Step 1: Insert Client → return client_id
INSERT INTO clients (...) VALUES (...) RETURNING * INTO v_client;

-- Step 2: Insert Contact (WITHOUT is_primary) → return contact_id
INSERT INTO contacts (...) VALUES (...) RETURNING * INTO v_contact;

-- Step 3: Insert ClientContact → link with is_primary = true
INSERT INTO client_contacts (client_id, contact_id, is_primary, tenant_id, created_by)
VALUES (v_client.id, v_contact.id, true, p_tenant_id, p_user_id);
```

**CRITICAL:** Never set `is_primary` on the `contacts` table - it ONLY exists in `client_contacts`.

### Trigger Reference

| Table | Trigger | Purpose |
|-------|---------|---------|
| `contacts` | ~~ensure_single_primary_contact_trigger~~ | **REMOVED** - was obsolete |
| `client_contacts` | `ensure_single_primary_client_contact_trigger` | Enforces single primary per client |
| `client_contacts` | `client_contacts_set_tenant_id_trigger` | Auto-populates tenant_id from parent |
| `client_contacts` | `client_contacts_updated_at_trigger` | Updates timestamp on change |

### Breadcrumb Pattern Update

SetDetailPage now handles two breadcrumb patterns:
- **With Project:** `Client > Project > Set`
- **Without Project (client-only):** `Client > Set`

The breadcrumb logic dynamically adjusts based on `set.project_id` presence.

### Verification Checklist
After running migration 013:
- [ ] Can create client with contact (no "is_primary" error)
- [ ] SetDetailPage Client dropdown is editable in edit mode
- [ ] SetDetailPage Project dropdown is editable in edit mode
- [ ] SetForm no longer shows Due Date field
- [ ] Client-only sets (no project) show correct 2-level breadcrumb
- [ ] Changing client resets project if incompatible
- [ ] client_id persists correctly on Set save

## 📋 Phase 2.9 Data Accuracy & UX Refinement (Migration 014)

### Schema Changes

1. **client_contacts.role** - Added client-specific role column
   - Role is now stored in `client_contacts` join table (client-specific)
   - Role in `contacts` table is now for global/default role only
   - "Edit Relationship" modal updates `client_contacts.role`, NOT `contacts.role`

2. **sets.due_date** - Removed
   - Sets use `expected_start_date` and `expected_end_date` for scheduling
   - `due_date` was redundant and has been dropped

3. **requirements date columns** - Renamed and simplified
   - `expected_end_date` → `expected_due_date`
   - `actual_end_date` → `actual_due_date`
   - `due_date` → Removed (redundant)
   - Added `completed_date` (DATE, separate from `completed_at` TIMESTAMPTZ)

### Table-Column Mappings

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `client_contacts` | `role` | TEXT | Client-specific contact role |
| `client_contacts` | `is_primary` | BOOLEAN | Client-specific primary contact |
| `requirements` | `expected_due_date` | DATE | When task is expected to be due |
| `requirements` | `actual_due_date` | DATE | When task was actually due |
| `requirements` | `completed_date` | DATE | User-specified completion date |
| `requirements` | `completed_at` | TIMESTAMPTZ | Auto-set when status → completed |

### API Updates

1. **contacts.ts**
   - `update()` now writes `role` to `client_contacts` when `clientId` is provided
   - Added `updateRelationship()` for updating only client_contacts fields

2. **projects.ts**
   - `getAll()`, `getById()`, `getWithHierarchy()` now include team member joins
   - Pattern: `lead:lead_id (id, full_name, avatar_url)`

3. **requirements.ts**
   - Updated ordering to use `expected_due_date` instead of `due_date`

### UI Changes

1. **SetForm (Quick Create)**
   - Removed `owner_id` field
   - Team fields: Lead, Secondary Lead, PM only

2. **SetDetailPage**
   - Removed Due Date from Schedule section and progress display
   - Team section now editable with SearchableSelect dropdowns
   - Label Above / Value Below pattern for team fields

3. **RequirementForm (Create)**
   - Removed `due_date` field
   - Added `expected_due_date`, `actual_due_date`, `completed_date`

4. **RequirementDetailPage**
   - Schedule section shows only 3 dates: Expected Due, Actual Due, Completed

5. **ClientDetailPage**
   - "Edit Relationship" modal now uses `updateRelationship()` mutation
   - Role updates go to `client_contacts` table (client-specific)

### Hooks Added/Updated

- `useContactMutations().updateRelationship` - Updates client_contacts only (role, is_primary)

### Verification Checklist
After running migration 014:
- [ ] Editing Role in "Edit Relationship" modal updates client_contacts.role (not contacts.role)
- [ ] ProjectDetailPage Team section shows Lead, Secondary Lead, PM names
- [ ] SetForm no longer has Owner field
- [ ] SetDetailPage no longer shows Due Date
- [ ] SetDetailPage Team fields are editable dropdowns in edit mode
- [ ] RequirementForm shows Expected Due Date, Actual Due Date, Completed Date
- [ ] RequirementDetailPage Schedule section shows only 3 date fields
- [ ] Assigned To column in grids shows correct user names

## 📋 Phase 2.11 Critical System Fixes (Migrations 016-017)

### Issue 1: Server-Side Rate Limiting (Migration 016)

**Problem:** Client-side rate limiting was bypassed by page refresh (in-memory Map resets)

**Solution:** Implemented server-side rate limiting with PostgreSQL:

**Tables Created:**
- `login_attempts` - Tracks all login attempts by email/IP
- `rate_limit_config` - Configurable rate limits per action type

**RPC Functions:**
```sql
-- Check if action is rate-limited (call BEFORE auth)
check_rate_limit(p_email TEXT, p_action_type TEXT DEFAULT 'login')
-- Returns: { allowed: bool, remaining_attempts: int, retry_after_seconds: int }

-- Record login attempt (call AFTER auth, success or failure)
record_login_attempt(p_email, p_success, p_ip_address, p_user_agent, p_error_message)

-- Cleanup old records (run daily via cron)
cleanup_login_attempts(p_older_than_hours INTEGER DEFAULT 24)
```

**Auth Flow:**
1. Call `check_rate_limit` before attempting login
2. If blocked, throw `RateLimitError` with retry time
3. Attempt authentication
4. Call `record_login_attempt` with success/failure
5. Successful login clears previous failed attempts

### Issue 2: SQL Migration Column Fixes (Migration 017)

**Problem:** `ERROR: 42703: column "expected_end_date" does not exist` - column renames without IF EXISTS

**Solution:** Idempotent migration that:
1. Adds missing columns if they don't exist
2. Safely renames using `IF EXISTS` pattern in DO blocks
3. Creates database views for complex joins

**Views Created:**
- `projects_with_profiles` - Projects joined with user_profiles for team members
- `sets_with_profiles` - Sets joined with user_profiles
- `requirements_with_profiles` - Requirements joined with user_profiles

### Issue 3: SysAdmin User Creation Fix

**Problem:** Creating user via admin panel redirected admin to /onboarding

**Root Cause:** `supabase.auth.signUp()` auto-logs in as the new user, replacing admin session

**Solution:** Session preservation pattern in `auth.ts`:
```typescript
// 1. Save admin session BEFORE signUp
const adminSession = (await supabase.auth.getSession()).data.session

// 2. Create new user (this may swap sessions)
await supabase.auth.signUp({ email, password, ... })

// 3. Immediately restore admin session
await supabase.auth.setSession({
  access_token: adminSession.access_token,
  refresh_token: adminSession.refresh_token,
})

// 4. Create user profile for new user
await supabase.from('user_profiles').upsert({ user_id: newUserId, ... })
```

### Issue 4: Projects Grid Empty Fix

**Problem:** Projects overview grid showed no data due to broken FK joins

**Root Cause:** `lead_id`, `pm_id`, etc. reference `auth.users(id)` not `user_profiles(id)`, so PostgREST joins fail

**Solution:** Separate profile fetches pattern in `projects.ts`:
```typescript
// 1. Fetch projects without FK joins
const { data: projects } = await supabase.from('projects').select('*, clients (*)')

// 2. Collect all user IDs
const userIds = new Set([...projects.map(p => p.lead_id), ...])

// 3. Fetch profiles separately
const { data: profiles } = await supabase.from('user_profiles')
  .select('id, user_id, full_name, avatar_url')
  .in('user_id', Array.from(userIds))

// 4. Map profiles to projects
return projects.map(p => ({
  ...p,
  lead: profileMap.get(p.lead_id) || null,
}))
```

### Verification Checklist
After running migrations 016-017:
- [ ] Page refresh does NOT reset login lockout (wait 5 minutes to verify)
- [ ] `login_attempts` table records failed and successful logins
- [ ] Creating user as SysAdmin does NOT redirect to /onboarding
- [ ] Admin stays logged in after creating a new tenant user
- [ ] Projects overview grid shows projects with correct team member names
- [ ] No 400/500 errors in Network tab on Projects page

## 📋 V2 Features (Migration 026)

### New Hierarchy: 6-Level with Pitches

The hierarchy now includes **Pitches** between Sets and Requirements:

**Client -> Project -> Phase -> Set -> Pitch -> Requirement**

- **Pitch:** A grouping of requirements within a set, with approval workflow
- **Parent-child enforcement:** Pitches MUST have a `set_id`
- **Requirements:** Can optionally link to a pitch via `pitch_id`

### New Entities

#### 1. Document Catalog (`document_catalog`)
Tenant-wide document type standards:
- Categories: `deliverable`, `legal`, `internal`, `reference`
- Fields: `name`, `category`, `is_client_deliverable`, `file_type_hint`, `usage_count`
- Usage tracking via trigger (auto-increments/decrements on document creation/deletion)
- Default types seeded via `seed_document_catalog_for_tenant(tenant_id)` RPC

**API:** `documentCatalogApi` | **Hooks:** `useDocumentCatalog`, `useDocumentCatalogMutations`

#### 2. Pitches (`pitches`)
Groups requirements within a set with approval workflow:
- **Required:** `set_id` (parent-child enforced)
- **Team:** `lead_id`, `secondary_lead_id`
- **Ordering:** `order_key`, `order_manual`, `predecessor_pitch_id`, `successor_pitch_id`
- **Approval:** `is_approved`, `approved_by_id`, `approved_at`
- **Priority:** Eisenhower matrix via `urgency`, `importance` -> auto-calculated `priority`

**API:** `pitchesApi` | **Hooks:** `usePitches`, `usePitchesBySet`, `usePitchMutations`

#### 3. Leads (`leads`)
Sales pipeline tracking:
- **Status Pipeline:** `new` -> `contacted` -> `qualified` -> `proposal` -> `negotiation` -> `won`/`lost`
- **Fields:** `lead_name`, `estimated_value`, `estimated_close_date`, `company_size`, `source`
- **Owner:** `lead_owner_id` references `user_profiles(id)`
- **Conversion:** `convert_lead_to_client(lead_id, options)` RPC creates client and copies contacts/documents

**API:** `leadsApi` | **Hooks:** `useLeads`, `useLeadsByStatus`, `useLeadPipelineStats`, `useLeadMutations`

#### 4. Lead Contacts (`lead_contacts`)
Many-to-many linking leads to contacts:
- `is_primary`, `is_decision_maker`, `role_at_lead`
- Trigger ensures single primary per lead

### Template System

All major entities now support `is_template: boolean`:
- **Projects, Phases, Sets, Pitches, Requirements**
- Default queries filter `is_template = false` (operational view)
- Use `includeTemplates = true` parameter to fetch all

**Operational Views:**
- `operational_projects`, `operational_phases`, `operational_sets`, `operational_pitches`, `operational_requirements`

**Template Duplication:**
```typescript
// Duplicate project with all children
projectsApi.duplicate(projectId, {
  new_client_id: '...',      // Optional: assign to different client
  new_name: 'Copy Name',     // Optional: rename
  include_children: true,    // Copy phases, sets, pitches, requirements
  clear_dates: true,         // Remove date assignments
  clear_assignments: true,   // Remove team assignments
  as_template: false,        // Create as operational project
})

// Save as template
projectsApi.saveAsTemplate(projectId, 'Template Name')

// Create from template
projectsApi.createFromTemplate(templateId, clientId, 'New Project Name')
```

### Enhanced Documents

Documents now link to more entities:
- `document_catalog_id` - Links to document type catalog
- `phase_id` - Direct link to phase
- `pitch_id` - Direct link to pitch
- `has_file` - GENERATED column (true if file_url is not null)
- `entity_type` now includes `'lead'` and `'pitch'`

### Enhanced Phases

New fields on `project_phases`:
- `phase_id_display` - Auto-generated "PH-XXXX"
- `lead_id`, `secondary_lead_id` - Team assignments
- `order_key`, `order_manual` - Ordering with predecessor/successor support
- `urgency`, `importance`, `priority` - Eisenhower matrix
- `is_template` - Template flag
- `notes` - Free text notes

**Circular Dependency Prevention:** Trigger checks predecessor/successor chains

### Display ID Formats

Auto-generated display IDs:
- **Phases:** `PH-0001`, `PH-0002`, ...
- **Pitches:** `PI-0001`, `PI-0002`, ...
- **Leads:** `LD-0001`, `LD-0002`, ...

### V2 API Usage Examples

```typescript
// Document Catalog
const { data: catalogTypes } = useDocumentCatalog()
const { createCatalogEntry, deactivateCatalogEntry } = useDocumentCatalogMutations()

// Pitches
const { data: pitches } = usePitchesBySet(setId)
const { createPitch, approvePitch, rejectPitch } = usePitchMutations()

// Leads
const { data: leads } = useLeads()
const { data: stats } = useLeadPipelineStats()
const { createLead, updateLeadStatus, convertToClient } = useLeadMutations()

// Templates
const { data: templates } = useProjectTemplates()
const { saveAsTemplate, createFromTemplate } = useProjectMutations()
```

### V2 Migration Checklist
After running migration 026:
- [ ] `document_catalog` table exists with RLS policies
- [ ] `pitches` table exists with RLS policies
- [ ] `leads` and `lead_contacts` tables exist with RLS policies
- [ ] `is_template` column exists on projects, phases, sets, requirements
- [ ] `duplicate_project` RPC function exists
- [ ] `convert_lead_to_client` RPC function exists
- [ ] Operational views filter templates correctly

## 📋 Intelligent Workflow Phase (Migration 027)

### Lead Conversion Tracking

Clients now track their source lead via `source_lead_id`:

**Schema Change:**
```sql
ALTER TABLE clients ADD COLUMN source_lead_id UUID REFERENCES leads(id);
```

**Bidirectional Tracking:**
- `leads.converted_to_client_id` → Points to converted client
- `clients.source_lead_id` → Points back to source lead

**Client Interface Update:**
```typescript
export interface Client {
  // ... existing fields
  source_lead_id?: string // Reference to lead that was converted to create this client
}

export interface ClientWithRelations extends Client {
  source_lead?: Lead // Populated when fetched with relations
}
```

### Kanban Drag-Drop Fix

**Bug Fixed:** `LeadsPage.tsx` handleDragEnd assumed `over.id` was always a column status.

**Fix:** Added check for valid pipeline status:
```typescript
const isValidStatus = PIPELINE_STAGES.some((s) => s.status === over.id)
if (isValidStatus) {
  targetStatus = over.id as LeadStatus
} else {
  // Dropped on a card - find the card's column status
  const targetLead = leads?.find((l) => l.id === over.id)
  targetStatus = targetLead.status
}
```

### Lead Contact Creation

**LeadDetailPage** now supports creating contacts directly from leads:
- Dropdown menu: "Create New Contact" / "Link Existing Contact"
- New contact dialog with fields: first_name, last_name, email, phone, role_at_lead, is_decision_maker
- Auto-links to lead after creation
- Sets `is_primary = true` if first contact

### Pitch Detail Page Refinements

**Removed:** Approval workflow UI (badges, buttons, banner, dialogs)

**Added:**
- Clickable parent links in header (Client > Project > Set)
- Editable parent dropdowns in edit mode (cascading Client → Project → Set)
- Inline requirement creation dialog (no navigation required)

**Inline Requirement Creation:**
```typescript
// Opens dialog with fields: Title, Type, Description
// Auto-populates: set_id, pitch_id, client_id
<Button onClick={() => setCreateRequirementDialogOpen(true)}>
  Add Requirement
</Button>
```

### Dashboard 2.0 Widgets

Three new widgets showing user-specific active work:

**My Active Sets:**
- Sets where user is `lead_id`, `secondary_lead_id`, or `pm_id`
- Shows progress bar and status
- API: `setsApi.getMyActive(tenantId, userProfileId)`

**My Active Pitches:**
- Pitches where user is `lead_id` or `secondary_lead_id`
- Shows status badge
- API: `pitchesApi.getMyActive(tenantId, userProfileId)`

**My Active Tasks:**
- Requirements where `is_task = true` and `assigned_to_id = userProfileId`
- Checklist style with due dates
- API: `requirementsApi.getMyTasks(tenantId, userProfileId)`

**Hooks:**
```typescript
import { useMyActiveSets, useMyActivePitches, useMyActiveTasks } from '@/hooks'

const { data: myActiveSets } = useMyActiveSets()
const { data: myActivePitches } = useMyActivePitches()
const { data: myActiveTasks } = useMyActiveTasks()
```

### Migration 027 Checklist
After running migration 027:
- [ ] `clients.source_lead_id` column exists
- [ ] `convert_lead_to_client` RPC sets `source_lead_id`
- [ ] Kanban drag-drop works when dropping on cards
- [ ] Can create contacts from LeadDetailPage
- [ ] Pitch parent links are clickable
- [ ] Dashboard shows 3 new "My Active" widgets