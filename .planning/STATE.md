# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Hierarchical flow (Client -> Project -> Phase -> Set -> Requirement) with automatic Eisenhower prioritization and built-in client portal
**Current focus:** Phase 4 - CORE Workflow & Audit (Next)

## Current Position

Phase: 04-core-workflow-audit - IN PROGRESS
Plan: 04-03-PLAN.md complete (Cascading Filters Verification)
Status: Forms verified for cascading filters and parent context passing
Last activity: 2026-02-14 - Phase 04 Plan 03 complete

Progress: [████████░░] 1/3 plans complete in Phase 04

## V2 Features Sprint (48-Hour)

**Migration 026 Applied:** YES (026_v2_features.sql)

### Completed Backend Infrastructure:

1. **Document Catalog** - `document_catalog` table + `documentCatalogApi` + `useDocumentCatalog` hooks
2. **Enhanced Documents** - Added `document_catalog_id`, `phase_id`, `pitch_id`, `has_file` columns
3. **Enhanced Phases** - Added `lead_id`, `secondary_lead_id`, `order_key`, `urgency`, `importance`, `priority`, `is_template`
4. **Pitches** (NEW ENTITY) - `pitches` table + `pitchesApi` + `usePitches` hooks
   - Parent-child: Set -> Pitch -> Requirement
   - Approval workflow (is_approved, approved_by_id, approved_at)
5. **Templates** - Added `is_template` to projects, phases, sets, pitches, requirements
   - Operational views filter templates out by default
   - Template duplication via `duplicate_project` RPC
6. **Leads** (NEW ENTITY) - `leads` + `lead_contacts` tables + `leadsApi` + `useLeads` hooks
   - Sales pipeline with status tracking
   - Convert lead to client via `convert_lead_to_client` RPC
7. **Display IDs** - Auto-generated PH-XXXX, PI-XXXX, LD-XXXX

### Next Steps (UI Components):
- [ ] LeadsPage - Pipeline view with Kanban board
- [ ] LeadDetailPage - Full detail with contacts, documents
- [ ] PitchesPage - List view
- [ ] PitchDetailPage - Requirements tab, approval workflow
- [ ] DocumentCatalogPage - Settings page for managing types
- [ ] TemplatesPage - List/create project templates

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: ~1.4 minutes
- Total execution time: ~11 minutes

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-fixes | 3 | ~5 min | ~1.7 min |
| 02-client-contact-system | 4 | ~6 min | ~1.5 min |
| 03-projects-sets-enhancement | 3 | ~3 min | ~1 min |
| 04-core-workflow-audit | 1 | ~2 min | ~2 min |

**Recent Executions:**

| Plan | Duration (s) | Tasks | Files |
|------|-------------|-------|-------|
| Phase 04 P01 | 132 | 2 | 2 |
| Phase 04 P03 | 128 | 3 | 8 |

**Recent Trend:**
- Last 3 plans: 04-01 (~2.2 min), 04-03 (~2.1 min)
- Trend: Verification-heavy plans taking ~2 minutes each

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Fix schema cache before features: Can't demo if can't create clients
- Contacts as separate table (not JSON): Need proper relationships, querying, RLS
- Full-page views over modals: Better UX for complex forms, matches existing ClientDetailPage pattern
- Use existing calculate_priority_score SQL: Already implemented, just need UI display
- Skip real-time for MVP: Polling sufficient, reduces complexity

**From Plan 01-01:**
- SQL script over CLI command: Provide SQL script to run in Supabase SQL Editor (no local CLI setup required)
- Include verification queries: Add SELECT queries after NOTIFY to confirm columns exist

**From Plan 01-02:**
- Validate tenantId and userId before API calls rather than rely on non-null assertion: Fail-fast with clear error messages
- Document RLS requirements in code comments: Help future maintainers understand tenant isolation constraints
- Apply validation pattern to all CRUD operations: Consistent error handling across all entity mutations

**From Plan 01-03:**
- Industry field required with searchable dropdown: Standardized classification
- "Other" option with custom text: Flexibility for unlisted industries
- Removed Primary Contact from ClientForm: Defer to Phase 2 Contacts subsystem

**From Plan 02-02:**
- PostgreSQL function via RPC over sequential JS inserts: Database-level atomicity cannot be interrupted
- SECURITY DEFINER for RLS bypass during atomic operation: Single function handles both inserts with elevated permissions
- Unique partial index for primary contact: Extra safety at database level prevents race conditions

**From Plan 02-04:**
- ViewEditToggle component accepts children object with view/edit slots: Maximum flexibility for different content types
- IBM Carbon colors defined in both Tailwind theme AND CSS custom properties: Tailwind for utilities, CSS for semantic aliasing
- Utility classes (page-carbon, card-carbon) for IBM Carbon aesthetic: Encapsulate design patterns for consistency

**From Plan 02-03:**
- Form-level atomic submission: Pass client + contact data together to hook
- Required primary contact: New clients must have at least first/last name for primary contact
- Optional contact details: Email, phone, and role are optional but recommended

**From Plan 04-01:**
- Use IIFE with type assertion for inline priority calculation to handle database vs calculated priority
- Pattern: `(value || fallback) as Type` for handling nullable priority fields

**From Plan 04-03:**
- All cascading filter patterns already correctly implemented (verification-only plan)
- useWatch + useMemo + useEffect pattern established for dependent field resets
- Separate profile fetching pattern for creator/updater (avoid broken PostgREST FK joins)

### Pending Todos

**From Plan 01-01:**
- User must run `supabase/refresh-schema-cache.sql` in Supabase SQL Editor to refresh PostgREST cache
- After running script, verify client creation works with location/industry/overview fields

**From Plan 02-02:**
- User must run `supabase/migrations/003_create_client_with_contact.sql` in Supabase SQL Editor
- Verify function exists with: `SELECT proname FROM pg_proc WHERE proname = 'create_client_with_contact';`

### Blockers/Concerns

**Known Issues from Codebase:**
- No test coverage - all changes must be careful
- Form complexity - large form components (400+ lines)
- Type safety issues (34 instances of any/unknown)
- Dashboard loads all data without pagination

**Technical Constraints:**
- Must maintain multi-tenant isolation (tenant_id on all new tables)
- Must use soft delete pattern (deleted_at)
- Must respect 5-level hierarchy (Client -> Project -> Phase -> Set -> Requirement)

## Session Continuity

Last session: 2026-02-14
Stopped at: Completed 04-03-PLAN.md (Cascading Filters Verification)
Resume file: None
Next: Continue Phase 04 - remaining plans or move to Phase 05
