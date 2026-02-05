# Architecture

**Analysis Date:** 2026-02-05

## Pattern Overview

**Overall:** Multi-tenant SaaS with React frontend + Supabase backend. Frontend uses client-side state management (Zustand for UI/auth) + server state management (TanStack Query v5 for data). Implements hierarchical data model: Client → Project → Phase → Set → Requirement, with role-based access control (RBAC).

**Key Characteristics:**
- Layered separation: UI (pages/components) → Hooks (data logic) → API services (Supabase calls) → Zustand stores (client state)
- Single source of truth for authentication state via `useUserRole()` hook (fetches from Supabase RPC)
- Role-based routing with four roles: `sys_admin` (system), `org_admin` (tenant owner), `org_user` (team member), `client_user` (client portal)
- Soft deletes on all data entities (filter by `deleted_at IS NULL`)
- Multi-tenant isolation via `tenant_id` on all tables and RLS policies in database

## Layers

**Page Layer (Presentation):**
- Purpose: Route-mounted full-page views for major records (Clients, Projects, Sets, Requirements)
- Location: `src/pages/`
- Contains: Full-page components with View Mode and Edit Mode toggles, tab-based child navigation
- Depends on: Hooks (useClients, useProjects, etc.), UI components, Form components
- Used by: React Router (App.tsx routing)
- Pattern: Each detail page imports hooks, renders conditional UI based on `isEditing` state, handles form validation with React Hook Form + Zod

**Component Layer:**
- Purpose: Reusable UI elements and domain-specific components
- Location: `src/components/`
- Subdivisions:
  - `ui/`: shadcn/ui primitives (Button, Card, Dialog, Table, Form, etc.)
  - `layouts/`: Page layouts (MainLayout with Sidebar+TopNav, AuthLayout, PortalLayout, AdminLayout)
  - `forms/`: Domain forms (ClientForm, ProjectForm, SetForm, RequirementForm) - typically used in Create/Edit modes
  - `details/`: Summary cards for quick viewing (ClientDetail, ProjectDetail, SetDetail, RequirementDetail)
  - `guards/`: Route protection (AuthGuard, TenantGuard, AdminGuard)
  - `providers/`: Context providers (AuthProvider wraps Supabase session state)
  - `navigation/`: Sidebar, TopNav, breadcrumbs
  - `shared/`: Reusable business components (AuditTrail, DetailPanel, CreateModal)

**Hook Layer (Data & Business Logic):**
- Purpose: Encapsulate React Query queries, mutations, and Zustand store access
- Location: `src/hooks/`
- Contains: Custom hooks (useClients, useProjects, useAuth, useTenant, useUserRole, etc.)
- Pattern:
  - Read hooks: `useClients()`, `useProjects()` wrap TanStack Query with auto-fetching based on tenant/user context
  - Mutation hooks: `useClientMutations()` export create/update/delete mutations with toast notifications and cache invalidation
  - Auth hooks: `useUserRole()` is source of truth for role-based decisions
  - Hooks automatically inject context (tenantId, userId) from stores
- Depends on: API services, Zustand stores, TanStack Query

**API Service Layer:**
- Purpose: Supabase database queries and mutations
- Location: `src/services/api/`
- Contains: One module per entity (clients.ts, projects.ts, sets.ts, requirements.ts, etc.)
- Pattern: Each API module exports an object with CRUD methods:
  ```typescript
  export const clientsApi = {
    getAll: async (tenantId: string) => { ... },
    getById: async (id: string) => { ... },
    create: async (tenantId: string, userId: string, input) => { ... },
    update: async (id: string, userId: string, input) => { ... },
    delete: async (id: string) => { ... },
    restore: async (id: string) => { ... }
  }
  ```
- Features:
  - All queries filter by `tenant_id` and `deleted_at IS NULL`
  - Create/update operations set `created_by`, `updated_by` automatically
  - Soft delete via `deleted_at` timestamp
  - Fallback error handling for optional features (e.g., contacts table)

**State Management Layer:**
- Purpose: Client-side transient state (Zustand) + server state (TanStack Query)
- Location: `src/stores/`
- Zustand stores:
  - `authStore.ts`: User session, profile, role (populated by AuthProvider)
  - `tenantStore.ts`: currentTenant, tenants list, tenantUsers (switching tenants)
  - `uiStore.ts`: sidebarCollapsed, detailPanel state, createModal state
- Pattern: Stores use `persist` middleware to retain essential state (auth, tenant) in localStorage
- TanStack Query handles:
  - All server data fetching (clients, projects, requirements, etc.)
  - Automatic cache management and invalidation
  - Stale time: 5 minutes for auth checks, 1 minute for entity lists

**Supabase Layer:**
- Purpose: Database + Auth backend
- Location: `src/services/supabase.ts`
- Handles: Supabase auth session, RLS enforcement, SECURITY DEFINER functions
- Key RPC: `get_user_highest_role(p_user_id)` - fetches highest role across all tenants (SECURITY DEFINER)

## Data Flow

**Authentication & Route Protection Flow:**

1. **App Mount → AuthProvider:**
   - AuthProvider calls `supabase.auth.getSession()` on mount
   - Sets `useAuthStore` with authenticated user (if any)
   - Listens for auth state changes via `supabase.auth.onAuthStateChange()`

2. **Protected Route Access (AuthGuard):**
   - AuthGuard checks `useAuthStore.isAuthenticated` and `useUserRole()` hook
   - `useUserRole()` calls RPC `get_user_highest_role()` to fetch current highest role
   - Routing logic:
     - No user → redirect to `/login`
     - `sys_admin` → redirect to `/admin`
     - No role + no tenants → redirect to `/onboarding`
     - Role mismatch with `requiredRole` → redirect to appropriate space

3. **TenantGuard (wraps main app routes):**
   - Ensures user has `currentTenant` set in `useTenantStore`
   - If no tenant, redirects to `/onboarding`

**Data Fetch & Display Flow:**

1. **Page Component Loads:**
   - Page imports hooks (e.g., `useClients()`, `useClient(id)`)
   - Hooks auto-fetch from Supabase via TanStack Query using tenant/user context

2. **Edit Mode Activation:**
   - User clicks "Edit" button, sets `isEditing = true`
   - Form (React Hook Form) populates with current data via `useForm().reset(data)`
   - Form validates via Zod schema

3. **Save/Submit:**
   - Form calls `updateClient.mutateAsync(data)` (from `useClientMutations`)
   - Mutation calls API service: `clientsApi.update(id, userId, data)`
   - API service sends to Supabase
   - On success: cache invalidated, query refetched, toast shown, edit mode disabled

**Multi-Tenant Data Isolation:**

- All table queries: `select().eq('tenant_id', currentTenantId).is('deleted_at', null)`
- Create operations: `insert({ tenant_id: currentTenantId, created_by: userId, ... })`
- RLS policies enforce row-level access (source of truth in Supabase)

## Key Abstractions

**View Mode + Edit Mode Toggle:**
- Purpose: Single page for viewing and editing details
- Pattern: Page component tracks `isEditing` state, conditionally renders:
  - View: Display-only layout with "Edit" button
  - Edit: Form with "Save" and "Cancel" buttons
- Example: `src/pages/clients/ClientDetailPage.tsx`
- Benefits: Unified UX, no separate edit pages, context preserved

**Tabbed Child Navigation:**
- Purpose: Display details and child entities on same page
- Pattern: Page uses `<Tabs>` from shadcn/ui:
  - Tab 1 "Details": Main attributes + parent info
  - Tab 2 "Children": List of related entities (Projects under Client, etc.)
- Example: ClientDetailPage has tabs for Details and Projects

**Custom Hooks as Data Gateways:**
- Purpose: Encapsulate query logic, cache, and context injection
- Pattern: Hook wraps TanStack Query and returns `{ data, isLoading, error, refetch }`
- Example: `useClients()` automatically uses `currentTenant` from store, no parameters needed

**API Service Objects as Query Wrappers:**
- Purpose: Separate database logic from React concerns
- Pattern: Each service is a namespace object with CRUD methods
- Example: `clientsApi.create(tenantId, userId, input)` is pure async function, unaware of React

## Entry Points

**Main React Entry:**
- Location: `src/main.tsx`
- Mounts React app to `#root` div

**App Component:**
- Location: `src/App.tsx`
- Responsibilities:
  - Initializes TanStack QueryClient
  - Wraps app in QueryClientProvider
  - Defines all routes with nested guards
  - Imports all layouts and pages

**Authentication Entry:**
- Public routes: `/login`, `/signup`, `/forgot-password` (no guards)
- Protected auth route: `/onboarding` (requires AuthGuard but no tenant)
- Main app routes: `/dashboard`, `/clients`, `/projects`, etc. (require AuthGuard + TenantGuard)
- Portal routes: `/portal`, `/portal/projects/:projectId` (require AuthGuard + `requiredRole="client_user"`)
- Admin routes: `/admin`, `/admin/tenants/:tenantId` (require AdminGuard)

## Error Handling

**Strategy:** Optimistic errors with toast notifications, catch-all error boundaries at layout level.

**Patterns:**

- **API Errors:** API services throw errors, hooks' mutations catch and show toast
  ```typescript
  onError: (error: Error) => {
    toast({ title: 'Failed', description: error.message, variant: 'destructive' })
  }
  ```

- **Permission Errors:** Caught by guards (AuthGuard, AdminGuard) which redirect to appropriate space

- **Soft Delete Errors:** Handled as CRUD, not as permission errors (operations succeed but records hidden via `deleted_at`)

## Cross-Cutting Concerns

**Logging:** Console only (no external service). Development tool for debugging data flow.

**Validation:** React Hook Form + Zod for client-side, Supabase RLS policies for server-side.

**Authentication:** Supabase Auth for sessions, `useUserRole()` hook for RBAC decisions (single source of truth).

**Multi-Tenancy:** `tenant_id` on all tables, filtered in every query, RLS policies at database layer.

**Audit Trail:** `created_by`, `updated_by`, `created_at`, `updated_at` on all records (viewed via AuditTrail component).

---

*Architecture analysis: 2026-02-05*
