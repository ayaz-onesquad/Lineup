# LineUp

## What This Is

LineUp is a multi-tenant SaaS project management platform for product development agencies using the CORE methodology (Capture, Organize, Review, Execute). It provides a hierarchical structure (Client → Project → Phase → Set → Requirement) with built-in prioritization via Eisenhower matrix and a client portal for transparency. The platform targets agencies managing 5-30 active client projects with teams of 10-200 employees.

## Core Value

The hierarchical flow from Client through Requirement with automatic Eisenhower prioritization and built-in client portal — agencies can capture work, organize by priority, review with clients, and execute systematically without switching tools.

## Requirements

### Validated

These capabilities exist in the current codebase:

- ✓ User authentication (signup, login, logout, password reset) — existing
- ✓ Multi-tenant architecture with tenant creation and switching — existing
- ✓ User management (invite, assign roles, list, remove) — existing
- ✓ Role-based access control (sys_admin, org_admin, org_user, client_user) — existing
- ✓ Clients CRUD with soft delete — existing
- ✓ Projects CRUD with hierarchy view, status, health, completion % — existing
- ✓ Phases CRUD with reordering — existing
- ✓ Sets CRUD with Eisenhower matrix view — existing
- ✓ Requirements CRUD with Kanban view, assignment, types — existing
- ✓ Dashboard with project/set/requirement stats — existing
- ✓ Client portal structure (partial) — existing
- ✓ RLS policies for multi-tenant isolation — existing
- ✓ Soft delete pattern across all entities — existing
- ✓ React Hook Form + Zod validation — existing
- ✓ TanStack Query for server state — existing
- ✓ Zustand for client state (auth, tenant, UI) — existing

### Active

Current scope for MVP completion:

**Bug Fixes (Blocking)**
- [ ] Fix schema cache error: PostgREST doesn't see `location` column on `clients` table despite migration 002
- [ ] Fix tenant isolation on INSERTs: All mutations (especially useCreateClient) must explicitly include tenant_id from auth context

**Enhanced Client Experience**
- [ ] Update ClientForm with: Name, Status, Overview, Industry (searchable select), Location
- [ ] Create Contacts table/subsystem with: first_name, last_name, email, phone, role (dropdown), relationship, is_primary (one per client), display_id, audit fields
- [ ] Add Contacts tab to Client Detail page
- [ ] Enforce primary contact requirement per client

**Full-Page UI Transition**
- [ ] Replace popups/modals for Projects with full-page views
- [ ] Replace popups/modals for Sets with full-page views
- [ ] Replace popups/modals for Requirements with full-page views
- [ ] Implement View/Edit toggle pattern on all detail pages
- [ ] Make parent relationships editable via searchable dropdowns in Edit Mode

**CORE Methodology & Logic**
- [ ] Display Eisenhower Priority (1-6) on Sets and Requirements using existing calculate_priority_score SQL function
- [ ] Implement review workflow: when requires_review=true, expose review_assigned_to and handle status transitions

**Smart Hierarchy Navigation**
- [ ] Cascading filters: Selecting Client filters Projects list; selecting Project filters Sets list
- [ ] "Create New" buttons in child tabs auto-populate parent record ID from context

**Audit & Auto-Numbering**
- [ ] Display display_id (auto-number) on all record views
- [ ] Add AuditTrail component to footer of all major record pages (Created/Updated timestamps + user names)

### Out of Scope

- Email notifications — complexity, defer to post-MVP
- @mentions in comments — nice-to-have, not core
- Gantt chart / timeline view — significant effort, defer
- Mobile app — web-first, mobile later
- Real-time updates (Supabase Realtime) — can use polling for MVP
- File upload/document management — placeholder exists, full implementation post-MVP
- Advanced search — basic filtering sufficient for demo
- Project templates — not needed for demo
- OAuth login (Google, GitHub) — email/password sufficient for MVP

## Context

**Existing Codebase:**
- React 19 + TypeScript + Vite frontend
- Supabase backend (PostgreSQL + Auth + RLS)
- Tailwind CSS + shadcn/ui component library
- TanStack Query v5 for server state, Zustand for client state
- Established patterns: View/Edit toggle on pages, API service objects, custom hooks as data gateways

**Known Issues (from codebase analysis):**
- No test coverage — all changes must be careful
- Form complexity — large form components (400+ lines)
- Detail panel state loss on navigation
- Type safety issues (34 instances of `any`/`unknown`)
- Dashboard loads all data without pagination

**Architecture Rules (from CLAUDE.md):**
- 5-level hierarchy must be respected: Client → Project → Phase → Set → Requirement
- Every table (except users) must have tenant_id
- Every query must filter by currentTenantId
- Use useUserRole hook (not authStore) for role-based decisions
- Soft deletes: filter for deleted_at IS NULL on all selects
- All tables need display_id (auto-number) + uuid (primary key)
- Audit fields: created_at, created_by, updated_at, updated_by

**Priority Mapping (Eisenhower 1-6):**
- Priority 1: critical urgency + high importance
- Priority 2: high urgency + high importance
- Priority 3: (critical + medium) OR (high + medium)
- Priority 4: medium urgency + high importance
- Priority 5: low importance OR (low urgency + medium importance)
- Priority 6: everything else (low + low)

## Constraints

- **Tech stack**: Must use existing stack (React 19, Supabase, Tailwind, shadcn/ui) — no new frameworks
- **Type safety**: 100% type-safe changes, no new `any` types
- **Multi-tenant**: All new tables/queries must include tenant_id isolation
- **Soft deletes**: All new entities must support soft delete pattern
- **Demo target**: Must produce professional functional demo, not production deployment

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fix schema cache before features | Can't demo if can't create clients | — Pending |
| Contacts as separate table (not JSON) | Need proper relationships, querying, RLS | — Pending |
| Full-page views over modals | Better UX for complex forms, matches existing ClientDetailPage pattern | — Pending |
| Use existing calculate_priority_score SQL | Already implemented, just need UI display | — Pending |
| Skip real-time for MVP | Polling sufficient, reduces complexity | — Pending |

---
*Last updated: 2026-02-05 after initialization*
