# Roadmap: LineUp MVP

## Overview

Complete the LineUp MVP by fixing critical schema and tenant isolation bugs, enhancing the Client experience with contact management, transitioning all entity views to full-page patterns with View/Edit toggles, and implementing CORE methodology features (Eisenhower priority display, review workflows, cascading filters, and audit trails). This roadmap delivers a professional demo-ready platform in 4 phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation Fixes** - Fix blocking schema cache and tenant isolation bugs, update ClientForm
- [ ] **Phase 2: Contact Management** - Build complete Contacts subsystem with primary contact enforcement
- [ ] **Phase 3: Full-Page Transition** - Replace modals with full-page views for Projects, Sets, Requirements
- [ ] **Phase 4: CORE Workflow & Audit** - Complete Eisenhower display, review workflow, smart navigation, audit trails

## Phase Details

### Phase 1: Foundation Fixes
**Goal**: Critical bugs are resolved and clients can be created with complete information
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, CLI-01
**Success Criteria** (what must be TRUE):
  1. PostgREST recognizes all columns on clients table (including location) without cache errors
  2. All INSERT operations automatically include tenant_id from auth context without explicit passing
  3. Users can create clients with Name, Status, Overview, Industry (searchable select), and Location fields
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Fix PostgREST schema cache for new columns
- [x] 01-02-PLAN.md — Add tenant_id validation to client mutations
- [x] 01-03-PLAN.md — Update ClientForm layout with Status, Industry, Location fields

### Phase 2: Contact Management
**Goal**: Clients have structured contact management with enforced primary contact
**Depends on**: Phase 1
**Requirements**: CLI-02, CLI-03, CLI-04
**Success Criteria** (what must be TRUE):
  1. Contacts table exists with complete schema (first_name, last_name, email, phone, role dropdown, relationship, is_primary, display_id, audit fields, tenant_id)
  2. Client Detail page shows Contacts tab displaying all linked contacts with ability to add/edit/delete
  3. System enforces exactly one primary contact per client (prevents creating client without primary contact, prevents deleting last primary contact)
  4. Users can mark a contact as primary and system automatically unmarks previous primary contact
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 3: Full-Page Transition
**Goal**: All entity types use consistent full-page views with View/Edit toggle pattern
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Projects, Sets, and Requirements each have full-page detail views (not modals/popups)
  2. All detail pages implement View Mode and Edit Mode with toggle button
  3. View Mode displays read-only information with "Edit" button
  4. Edit Mode shows inline form with "Save" and "Cancel" buttons
  5. Parent relationships are editable via searchable dropdowns in Edit Mode (e.g., Requirement can change which Set it belongs to)
**Plans**: TBD

Plans:
- [ ] TBD

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
| 2. Contact Management | 0/TBD | Not started | - |
| 3. Full-Page Transition | 0/TBD | Not started | - |
| 4. CORE Workflow & Audit | 0/TBD | Not started | - |
