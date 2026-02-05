# Codebase Concerns

**Analysis Date:** 2026-02-05

## Tech Debt

**Placeholder Client Name in Project Code Generation:**
- Issue: Hardcoded fallback to 'XXX' when client lookup fails during project code generation
- Files: `src/services/api/projects.ts:144`
- Impact: Projects created without a valid client reference will have malformed project codes (e.g., "XXX-001"), making them difficult to track
- Fix approach: Validate client_id exists before project creation; throw explicit error to user instead of silently using placeholder

**No Test Coverage:**
- Issue: Zero automated tests for critical business logic (API services, forms, hooks, data mutations)
- Files: Entire `src/` directory - no `.test.ts` or `.spec.ts` files exist
- Impact: Regressions in core functionality go undetected; refactoring is dangerous; multi-tenant isolation cannot be verified; RLS policies cannot be validated
- Fix approach:
  1. Add Jest/Vitest configuration
  2. Create unit tests for all API services (prioritize multi-tenant isolation checks)
  3. Create integration tests for RLS policy enforcement
  4. Create component tests for critical forms and pages

**Type Safety Issues:**
- Issue: 34 instances of `any`, `unknown`, or `@ts-ignore` scattered throughout codebase
- Files: Throughout `src/`
- Impact: Type checking cannot catch potential runtime errors; IDE autocomplete fails; refactoring breaks silently
- Fix approach: Audit all type safety escapes; replace with proper types or `as const` where appropriate

**Form Complexity - Multiple Large Forms:**
- Issue: Individual form components exceed 400+ lines each (RequirementForm: 508 lines, SetForm: 401 lines)
- Files: `src/components/forms/RequirementForm.tsx`, `src/components/forms/SetForm.tsx`, `src/components/forms/ClientForm.tsx`
- Impact: Forms are difficult to maintain; reusable form logic is duplicated; testing individual fields is complex; form state management is error-prone
- Fix approach:
  1. Extract cascading select logic into reusable hook (filterProjectsByClient, filterSetsByProject)
  2. Extract field groups into smaller sub-components
  3. Create FormFieldGroup component for repeated patterns (Urgency/Importance, Date ranges)

**Project Code Generation Logic in API Service:**
- Issue: Business logic for generating project codes lives in API service (`src/services/api/projects.ts:140-155`), not in database
- Files: `src/services/api/projects.ts`
- Impact: Project code generation can be inconsistent across different clients; code is tightly coupled to Supabase client; logic cannot be easily reused in migrations or batch operations
- Fix approach: Move project code generation to database trigger or stored function; API service becomes a thin client

---

## Known Bugs

**Detail Panel State Loss on Page Reload:**
- Symptoms: Open detail panel in ProjectDetailPage; navigate away and return; panel is closed
- Files: `src/stores/uiStore.ts`, `src/pages/projects/ProjectDetailPage.tsx`
- Trigger: Any full page navigation away from a detail panel
- Root cause: UIStore state is not persisted; Zustand only stores what's explicitly configured in `persist()` middleware
- Workaround: Reopen panel manually
- Fix approach: Add entity ID to URL query params (`?entity=requirement&id=xxx`) instead of relying solely on Zustand state

**Client Deletion Restore Loses Audit Trail:**
- Symptoms: Delete client → archive completes → restore via Supabase UI → soft delete flag removed
- Files: `src/services/api/clients.ts:134` (undelete function sets deleted_at to null)
- Trigger: Any client undelete operation
- Root cause: Undelete function exists but is not exposed in UI
- Impact: No clear indication who undeleted or when; violates audit trail expectations
- Fix approach: Add proper undelete UI with confirmation; log undelete as separate audit event

---

## Security Considerations

**RLS Circular Dependency Workaround Not Documented:**
- Risk: RLS policies on `tenant_users` create circular dependency (users can't check their own role to verify access to tenant data)
- Files: `src/services/api/auth.ts:166-172`, `src/hooks/useUserRole.ts`, `supabase/fix-role-check.sql`
- Current mitigation: Using SECURITY DEFINER function `get_user_highest_role()` to bypass RLS for role checks
- Recommendations:
  1. Document this architectural decision in code comments
  2. Ensure all role checks use the RPC function, not direct queries
  3. Verify RPC function grants are correct
  4. Add warning: Never call tenant_users table directly in client code for role checks

**AuthStore May Have Stale Role Data:**
- Risk: Zustand authStore persists `isAuthenticated` flag but not actual role; role only fetched on demand
- Files: `src/stores/authStore.ts`, `src/components/guards/AuthGuard.tsx`
- Current mitigation: CLAUDE.md explicitly states "Use useUserRole hook, not authStore roles"
- Recommendations:
  1. Remove any role-related fields from authStore to prevent confusion
  2. Make useUserRole a required dependency in all guarded routes
  3. Add runtime warning if code attempts to read role from authStore

**Tenant Isolation Not Enforced at Application Level:**
- Risk: API services filter by tenant_id, but missing tenant_id parameter defaults to undefined, which could bypass isolation
- Files: All `src/services/api/*.ts` files rely on tenant_id parameter
- Current mitigation: TenantGuard and hooks ensure currentTenant is set before making requests
- Recommendations:
  1. Create a wrapper function that injects currentTenant automatically
  2. TypeScript error if tenant_id is not provided to CRUD functions
  3. Add query hook validation that currentTenant exists before making request

**Portal Access Control Not Fully Implemented:**
- Risk: `show_in_client_portal` field exists on Requirement and Set, but no validation in PortalProjectPage
- Files: `src/pages/portal/PortalProjectPage.tsx`
- Current mitigation: None visible
- Recommendations:
  1. Filter all displayed requirements/sets by `show_in_client_portal === true`
  2. Verify RLS policies prevent client_user role from seeing non-portal items
  3. Add security test: client_user cannot view non-portal requirements

---

## Performance Bottlenecks

**Dashboard Page Loads Multiple Independent Queries in Parallel:**
- Problem: DashboardPage loads projects, sets, and requirements simultaneously; no data dependency optimization
- Files: `src/pages/dashboard/DashboardPage.tsx:1-24`
- Cause: Three separate useQuery hooks with no pagination or filtering on load
- Current: 3 queries always run, even if user only needs 1
- Impact: Slow initial dashboard load; high database query count
- Improvement path:
  1. Add query-level pagination or limit (first 10 projects, first 20 requirements)
  2. Only load "my tasks" and "overdue" for requirements, not all requirements
  3. Cache results longer (staleTime currently 5 minutes globally)

**Form Cascading Selects Refetch All Data:**
- Problem: RequirementForm, SetForm load ALL clients, ALL projects, ALL sets regardless of context
- Files: `src/components/forms/RequirementForm.tsx:69-71`, `src/components/forms/SetForm.tsx:53-55`
- Cause: useQuery hooks have no filters; data fetching happens at component level
- Impact: If 1000 projects exist, component loads all 1000 then filters client-side
- Improvement path:
  1. Create parameterized hooks: `useProjectsByClient(clientId)` instead of `useProjects()` in form
  2. Move filtering logic to server via API query parameters
  3. Cache filtered results by client_id

**ProjectDetailPage Loads Full Hierarchy on Every Render:**
- Problem: `useProjectWithHierarchy()` fetches project + all phases + all sets + all requirements
- Files: `src/hooks/useProjects.ts:33-39`, `src/services/api/projects.ts:115-135`
- Cause: Single query fetches nested structure without pagination
- Impact: Rendering a project with 100+ requirements is slow
- Improvement path:
  1. Paginate phases/sets/requirements
  2. Lazy-load requirements when user expands a set
  3. Add `limit` parameter to API (e.g., first 20 sets per phase)

---

## Fragile Areas

**Form Reset Logic Runs on Every Render:**
- Files: `src/pages/clients/ClientDetailPage.tsx:143-153`, `src/pages/projects/ProjectDetailPage.tsx:94-106`
- Why fragile: `if (client && !form.isDirty && !isEditing)` condition runs on every render; if data changes unexpectedly, user edits will be lost
- Safe modification:
  1. Use useEffect with dependency array `[client?.id]`
  2. Only reset when client data actually changes
  3. Add warning toast if resetting after user has started editing
- Test coverage gaps: No tests for form reset behavior with stale data

**AuthGuard Role Checking Depends on Multiple States:**
- Files: `src/components/guards/AuthGuard.tsx:26-106`
- Why fragile: Four separate useEffect hooks that independently check `isLoading`, `role`, `tenants`, and redirect. Order matters. Race conditions possible.
- Safe modification:
  1. Consolidate into single useEffect with combined dependency
  2. Add explicit logging for debugging redirect flow
  3. Test all redirect paths in isolation
- Current issue: If any loading state is incorrect, user sees blank screen instead of meaningful error

**Detail Panel State Tied to UIStore Only:**
- Files: `src/stores/uiStore.ts`, `src/pages/projects/ProjectDetailPage.tsx:591`
- Why fragile: Panel state exists only in memory; navigating away loses context
- Safe modification: Use URL query params as source of truth; Zustand as cache only
- Test coverage gaps: No tests for panel persistence across navigation

**Soft Delete Implementation Inconsistent:**
- Files: All API services check `.is('deleted_at', null)` but no standardized helper
- Why fragile: Easy to miss deleted_at filter in new queries
- Safe modification:
  1. Create helper function `selectNotDeleted(query)` to enforce filter
  2. Create database views that automatically filter deleted items
  3. Add query hook wrapper that enforces deleted_at check

---

## Scaling Limits

**In-Memory Cascading Selects in Forms:**
- Current capacity: Works well up to ~500 items per category
- Limit: Forms with 5000+ projects/clients will freeze UI during filter operations
- Scaling path:
  1. Implement server-side filtering with search input
  2. Use virtual scrolling for large select lists (react-window)
  3. Lazy-load select options via API

**Single Zustand Store for Global UI State:**
- Current capacity: Works for single-panel, single-modal state
- Limit: If multiple detail panels or modals are added, state management becomes unmaintainable
- Scaling path:
  1. Split UIStore into domain-specific stores (ModalStore, PanelStore, SidebarStore)
  2. Consider Redux or Jotai for more complex state trees

**Dashboard Query Performance:**
- Current capacity: Dashboard loads instantly with <100 projects/sets/requirements
- Limit: With 1000+ items, page takes 5-10s to load and becomes laggy
- Scaling path:
  1. Add server-side filtering/search
  2. Implement dashboard preferences (what widgets to show)
  3. Cache dashboard data in localStorage
  4. Add pagination to all list views

---

## Dependencies at Risk

**Zustand Persisted State Not Invalidated on Logout:**
- Risk: `auth-storage` persists `isAuthenticated` flag; if browser doesn't clear, stale state could cause issues
- Package: `zustand@^4.0.0`
- Impact: User could have `isAuthenticated: true` in localStorage but no actual session
- Workaround: AuthProvider clears state on logout
- Migration plan: Consider switching to TanStack Query's built-in persistence for auth state

**React Hook Form + Zod Validation Errors Not User-Friendly:**
- Risk: Form validation errors are technical (e.g., "Expected string, received undefined")
- Package: `react-hook-form@^7`, `zod@^3`
- Impact: Users don't understand why form won't submit
- Migration plan: Create custom Zod error messages layer that translates to user-friendly text

---

## Missing Critical Features

**File Upload/Document Management:**
- Problem: Documents tab exists on Client and Project pages but shows placeholder "Upload Document" button
- Blocks: Cannot attach contracts, SOWs, or deliverables to projects
- Priority: High - required for business operations
- Estimated effort: 2-3 weeks (upload logic, storage, preview, permissions)

**Activity/Audit Log UI:**
- Problem: Activity tab exists but shows placeholder
- Blocks: Cannot see who changed what and when
- Priority: High - required for compliance/accountability
- Estimated effort: 1-2 weeks (if backend audit_logs table already populated)

**Client User Portal Incomplete:**
- Problem: Portal login exists but PortalProjectPage only shows structure, no actual content
- Blocks: Clients cannot access their project information
- Priority: Critical - promised feature
- Estimated effort: 2-3 weeks (filtering, permissions, styling)

**Notifications/Comments:**
- Problem: No discussion/notification system
- Blocks: Teams cannot collaborate within LineUp; must use external tools
- Priority: Medium - nice-to-have
- Estimated effort: 3-4 weeks

**Gantt/Timeline View:**
- Problem: Only list and hierarchy views available
- Blocks: Cannot visualize project timelines; cannot identify bottlenecks
- Priority: Medium - would improve usability
- Estimated effort: 4-6 weeks

---

## Test Coverage Gaps

**Multi-Tenant Isolation Not Tested:**
- What's not tested: Verify that user from Tenant A cannot see Tenant B's data
- Files: All API services (`src/services/api/*`), all hooks (`src/hooks/*`)
- Risk: High - security vulnerability if isolation fails
- Priority: Critical - write integration tests first

**RLS Policy Enforcement:**
- What's not tested: Database-level RLS policies actually block unauthorized access
- Risk: High - if RLS is bypassed, all data is exposed
- Priority: Critical - need E2E tests that verify policy behavior

**Form Validation:**
- What's not tested: Complex form scenarios (cascading selects, required field combinations, date validations)
- Files: `src/components/forms/*`
- Risk: Medium - users could submit invalid data
- Priority: High - would catch data integrity bugs

**Authorization Routes:**
- What's not tested: AuthGuard and role redirects work correctly for all combinations
- Files: `src/components/guards/*`
- Risk: Medium - users might be able to access pages they shouldn't
- Priority: High - security-critical

**API Error Handling:**
- What's not tested: Network errors, timeouts, 403/401 responses handled gracefully
- Files: All `src/services/api/*`
- Risk: Medium - user gets blank screen instead of error message
- Priority: Medium - improves UX

---

*Concerns audit: 2026-02-05*
