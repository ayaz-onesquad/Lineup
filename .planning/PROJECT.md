# LineUp

## What This Is

LineUp is a multi-tenant SaaS project management platform for product development agencies using the CORE methodology (Capture, Organize, Review, Execute). It provides a hierarchical structure (Client → Project → Phase → Set → Requirement) with built-in prioritization via Eisenhower matrix, IBM Carbon Design aesthetic, View/Edit toggle UX pattern, and a client portal for transparency. The platform targets agencies managing 5-30 active client projects with teams of 10-200 employees.

## Core Value

The hierarchical flow from Client through Requirement with automatic Eisenhower prioritization and built-in client portal — agencies can capture work, organize by priority, review with clients, and execute systematically without switching tools.

## Requirements

### Validated

v1.0 MVP shipped capabilities:

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
- ✓ PostgREST schema cache fix — v1.0
- ✓ Tenant isolation on all INSERT mutations — v1.0
- ✓ ClientForm with Name, Status, Industry, Location — v1.0
- ✓ Contacts table and subsystem — v1.0
- ✓ Atomic client + contact creation (PostgreSQL function) — v1.0
- ✓ Primary contact enforcement per client — v1.0
- ✓ ViewEditToggle component with IBM Carbon Design — v1.0
- ✓ Full-page views for Projects, Sets, Requirements — v1.0
- ✓ Parent relationships editable via searchable dropdowns — v1.0
- ✓ Projects with date pickers and team dropdowns — v1.0
- ✓ Sets with budget_days and budget_hours — v1.0
- ✓ Eisenhower Priority (1-6) display on Sets and Requirements — v1.0
- ✓ Cascading filters in forms (Client → Project → Set) — v1.0
- ✓ Parent ID auto-population in child create forms — v1.0
- ✓ display_id visible on all record views — v1.0
- ✓ AuditTrail component with user names — v1.0

### Active

v2.0 Features (239 requirements defined):

**Sprint 1: Foundation (Week 1-2)**
- [ ] Document Catalog (tenant-wide document type standards)
- [ ] Enhanced Documents (catalog_id, phase_id, pitch_id, has_file)
- [ ] Project Phases database and API
- [ ] Pitches database and API
- [ ] Templates system (is_template flag, duplicate functions)

**Sprint 2: Hierarchy UI (Week 3-4)**
- [ ] Phases UI (drag-drop, detail pages, tabs)
- [ ] Pitches UI (approval workflow)
- [ ] Templates library UI

**Sprint 3: Advanced Features (Week 5-6)**
- [ ] Leads CRM (pipeline, contacts, conversion)
- [ ] Dashboard integration
- [ ] Reporting

### Out of Scope

- Email notifications — complexity, defer to v3
- @mentions in comments — nice-to-have, not core
- Gantt chart / timeline view — significant effort, defer to v3
- Mobile native app — web-first, responsive web sufficient
- Real-time updates (Supabase Realtime) — can use polling
- Advanced search — basic filtering sufficient
- OAuth login (Google, GitHub) — email/password sufficient
- Custom forms builder — beyond current scope
- Time tracking detail (timesheets) — beyond MVP scope
- Workflow automation — deferred to v3

## Context

**Current Codebase (after v1.0):**
- ~31,000 lines TypeScript (React 19 + Vite frontend)
- Supabase backend (PostgreSQL + Auth + RLS)
- Tailwind CSS + shadcn/ui component library
- TanStack Query v5 for server state, Zustand for client state
- IBM Carbon Design aesthetic established
- View/Edit toggle pattern on all detail pages
- Atomic client+contact creation via PostgreSQL function

**Known Issues:**
- No test coverage — all changes must be careful
- Form complexity — large form components (400+ lines)
- Type safety issues (some instances of `any`/`unknown`)

**Architecture Rules (from CLAUDE.md):**
- 5-level hierarchy: Client → Project → Phase → Set → Requirement (Pitch added in v2)
- Every table (except users) must have tenant_id
- Every query must filter by currentTenantId
- Soft deletes: filter for deleted_at IS NULL
- All tables need display_id (auto-number) + uuid (primary key)
- Audit fields: created_at, created_by, updated_at, updated_by

## Constraints

- **Tech stack**: Must use existing stack (React 19, Supabase, Tailwind, shadcn/ui) — no new frameworks
- **Type safety**: 100% type-safe changes, no new `any` types
- **Multi-tenant**: All new tables/queries must include tenant_id isolation
- **Soft deletes**: All new entities must support soft delete pattern
- **Design system**: Continue IBM Carbon aesthetic

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fix schema cache before features | Can't demo if can't create clients | ✓ Good |
| Contacts as separate table (not JSON) | Need proper relationships, querying, RLS | ✓ Good |
| Full-page views over modals | Better UX for complex forms | ✓ Good |
| Use existing calculate_priority_score SQL | Already implemented, just need UI display | ✓ Good |
| Skip real-time for MVP | Polling sufficient, reduces complexity | ✓ Good |
| Atomic client+contact via PostgreSQL function | Database-level atomicity | ✓ Good |
| ViewEditToggle as shared component | Reusable across all detail pages | ✓ Good |
| IBM Carbon Design tokens | Consistent aesthetic, easy to maintain | ✓ Good |
| Separate profile fetch for audit fields | auth.users → user_profiles needs separate query | ✓ Good |

---
*Last updated: 2026-02-15 after v1.0 milestone*
