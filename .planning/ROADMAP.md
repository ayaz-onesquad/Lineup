# Roadmap: LineUp MVP

## Overview

Complete the LineUp MVP with an **IBM Carbon Design System** aesthetic — elegant, modern, high-density UI. All detail pages use the **View/Edit toggle pattern**. This roadmap fixes critical bugs, implements Client + Contact management with atomic saves, enhances Projects and Sets with date/budget fields, and completes CORE methodology features.

## Design Direction

**IBM Carbon Design System** — High-density layouts with consistent spacing, typography, and interaction patterns:
- Page backgrounds: `#f4f4f4` (Gray 10)
- Card/container backgrounds: `#ffffff` (white)
- Spacing: 16px base unit, 8px for tight spacing

**ViewEditToggle Component** — All detail pages implement toggle between View Mode (read-only) and Edit Mode (inline form).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation Fixes** - Fix blocking schema cache and tenant isolation bugs, update ClientForm
- [x] **Phase 2: Client & Contact System** - Fix client detail, add primary contact to create form, complete contacts subsystem
- [ ] **Phase 3: Projects & Sets Enhancement** - Full-page views with View/Edit toggle, date pickers, roles, budget fields
- [ ] **Phase 4: CORE Workflow & Audit** - Complete Eisenhower display, review workflow, smart navigation, audit trails

## Phase Details

### Phase 1: Foundation Fixes
**Goal**: Critical bugs are resolved and clients can be created with complete information
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, CLI-01
**Status**: COMPLETE
**Success Criteria** (what must be TRUE):
  1. PostgREST recognizes all columns on clients table (including location) without cache errors
  2. All INSERT operations automatically include tenant_id from auth context without explicit passing
  3. Users can create clients with Name, Status, Overview, Industry (searchable select), and Location fields
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Fix PostgREST schema cache for new columns
- [x] 01-02-PLAN.md — Add tenant_id validation to client mutations
- [x] 01-03-PLAN.md — Update ClientForm layout with Status, Industry, Location fields

### Phase 2: Client & Contact System
**Goal**: Client detail works, new clients include primary contact (atomic save), contacts subsystem complete
**Depends on**: Phase 1
**Requirements**: BUG-03, CLI-02, CLI-03, CLI-04, CLI-05
**Success Criteria** (what must be TRUE):
  1. Client detail route (`/clients/:id`) loads correctly without 404/errors
  2. Contacts table exists with complete schema (first_name, last_name, email, phone, role dropdown, relationship, is_primary, display_id, audit fields, tenant_id)
  3. `useCreateClient` hook refactored to accept `primaryContact` data
  4. Saving a new client is atomic — saves client + primary contact to Supabase in one flow
  5. Client Detail page shows Contacts tab with all linked contacts, supports add/edit/delete
  6. Client Detail page implements ViewEditToggle component
  7. System enforces exactly one primary contact per client
  8. UI follows IBM Carbon styling (#f4f4f4 page bg, white cards, high-density)
**Status**: COMPLETE
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Fix client detail route (BUG-03)
- [x] 02-02-PLAN.md — Create atomic save infrastructure (PostgreSQL function + API)
- [x] 02-03-PLAN.md — Refactor client creation with primary contact (CLI-05)
- [x] 02-04-PLAN.md — Create ViewEditToggle component and IBM Carbon design tokens

### Phase 3: Projects & Sets Enhancement
**Goal**: Projects and Sets have full-page views with ViewEditToggle, enhanced fields (dates, roles, budget)
**Depends on**: Phase 2
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, SET-01, SET-02, SET-03, UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Projects appear correctly in UI (listing/filtering works)
  2. Project Detail page implements ViewEditToggle with IBM Carbon styling
  3. Projects have `expected_start_date`, `expected_end_date`, `actual_start_date`, `actual_end_date` date pickers
  4. Projects have `lead_id`, `secondary_lead_id`, `pm_id` dropdowns with user lookup
  5. Set Detail page implements ViewEditToggle with IBM Carbon styling
  6. Sets have `expected_start_date`, `expected_end_date`, `actual_start_date`, `actual_end_date` fields
  7. Sets have `budget_days` (numeric) and `budget_hours` (numeric) fields
  8. All detail pages (Projects, Sets, Requirements) use full-page views, not modals
  9. Parent relationships editable via searchable dropdowns in Edit Mode
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Add editable team member dropdowns to ProjectDetailPage
- [ ] 03-02-PLAN.md — Add budget fields to Sets (schema + UI)
- [ ] 03-03-PLAN.md — Verify all Phase 3 requirements complete

### Phase 4: CORE Workflow & Audit
**Goal**: CORE methodology features complete with priority display, review workflow, smart navigation, and audit trails
**Depends on**: Phase 3
**Requirements**: CORE-01, CORE-02, NAV-01, NAV-02, AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):
  1. Sets and Requirements display calculated Eisenhower Priority (1-6) using existing calculate_priority_score SQL function
  2. When requires_review is true on a Set or Requirement, review_assigned_to field is visible and status transitions reflect review workflow
  3. Cascading filters work in forms: selecting a Client filters the Projects dropdown to show only that client's projects; selecting a Project filters the Sets dropdown
  4. "Create New" buttons in child tabs auto-populate parent record ID (e.g., creating Requirement from Set detail page pre-fills set_id)
  5. All record views display display_id (auto-number) prominently
  6. All major record pages show AuditTrail component in footer with Created By, Created At, Updated By, Updated At (with user names, not just IDs)
**Plans**: TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation Fixes | 3/3 | Complete | 2026-02-05 |
| 2. Client & Contact System | 4/4 | Complete | 2026-02-06 |
| 3. Projects & Sets Enhancement | 0/3 | Not started | - |
| 4. CORE Workflow & Audit | 0/TBD | Not started | - |
