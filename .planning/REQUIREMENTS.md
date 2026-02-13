# Requirements: LineUp MVP

**Defined:** 2026-02-05
**Updated:** 2026-02-05 (Pivot to IBM Carbon aesthetic)
**Core Value:** Hierarchical flow (Client → Project → Phase → Set → Requirement) with automatic Eisenhower prioritization and built-in client portal

## Design Direction

**IBM Carbon Design System** — All components must follow IBM Carbon style guides:
- **High-density layouts** — Compact, information-rich interfaces
- **Colors**: `#f4f4f4` (Gray 10) for page backgrounds, white (`#ffffff`) for card/container backgrounds
- **Consistent spacing** — 16px base unit, 8px for tight spacing
- **Typography** — IBM Plex Sans (or system fallback with similar weights)

**ViewEditToggle Component** — All detail pages implement a `ViewEditToggle` component to switch between:
- **View Mode**: Read-only display with "Edit" action
- **Edit Mode**: Inline form with "Save" and "Cancel" actions

## v1 Requirements

Requirements for MVP completion demo. Each maps to roadmap phases.

### Bug Fixes

- [x] **BUG-01**: Fix PostgREST schema cache so `location` column on `clients` table is recognized
- [x] **BUG-02**: All INSERT mutations explicitly include `tenant_id` from auth context to prevent RLS visibility bugs
- [x] **BUG-03**: Fix client detail route (`/clients/:id`) — currently failing to load

### Client Management

- [x] **CLI-01**: ClientForm includes Name, Status, Overview, Industry (searchable select), Location fields
- [x] **CLI-02**: Contacts table exists with first_name, last_name, email, phone, role (dropdown), relationship, is_primary, display_id, audit fields
- [x] **CLI-03**: Client Detail page has Contacts tab showing linked contacts with View/Edit toggle
- [x] **CLI-04**: System enforces one primary contact per client
- [x] **CLI-05**: Refactor `useCreateClient` hook to accept `primaryContact` data; save client + contact to Supabase in one atomic flow

### Project Management

- [x] **PROJ-01**: Projects appear correctly in UI (fix listing/filtering issues)
- [x] **PROJ-02**: Projects have Expected Start/End and Actual Start/End date pickers
- [x] **PROJ-03**: Projects have Lead, Secondary Lead, and PM dropdowns (mapping to users table)
- [x] **PROJ-04**: Project Detail page implements View/Edit toggle pattern with IBM Carbon styling

### Set Management

- [x] **SET-01**: Sets have Expected Start/End and Actual Start/End date fields
- [x] **SET-02**: Sets have Budget Days and Budget Hours fields
- [x] **SET-03**: Set Detail page implements View/Edit toggle pattern with IBM Carbon styling

### Full-Page UI

- [x] **UI-01**: Projects use full-page view instead of modal/popup
- [x] **UI-02**: Sets use full-page view instead of modal/popup
- [x] **UI-03**: Requirements use full-page view instead of modal/popup
- [x] **UI-04**: All detail pages implement View/Edit toggle pattern (IBM Carbon style)
- [x] **UI-05**: Parent relationships editable via searchable dropdowns in Edit Mode

### CORE Methodology

- [ ] **CORE-01**: Eisenhower Priority (1-6) displayed on Sets and Requirements using calculate_priority_score
- [ ] **CORE-02**: When requires_review=true, review_assigned_to is exposed and status transitions are handled

### Smart Navigation

- [ ] **NAV-01**: Cascading filters in forms: Client selection filters Projects; Project selection filters Sets
- [ ] **NAV-02**: "Create New" buttons in child tabs auto-populate parent record ID

### Audit Trail

- [ ] **AUDIT-01**: display_id (auto-number) visible on all record views
- [ ] **AUDIT-02**: AuditTrail component shows Created/Updated timestamps and user names on all major record pages

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: User receives in-app notifications for assignments
- **NOTF-02**: User receives email for overdue requirements
- **NOTF-03**: User can configure notification preferences

### Document Management

- **DOC-01**: User can upload documents to any entity
- **DOC-02**: User can preview documents inline
- **DOC-03**: Documents respect show_in_client_portal flag

### Advanced Views

- **VIEW-01**: Gantt chart / timeline view for projects
- **VIEW-02**: Advanced search across all entities
- **VIEW-03**: Export to PDF

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app | Web-first, mobile later |
| OAuth login (Google, GitHub) | Email/password sufficient for MVP demo |
| Real-time updates (Supabase Realtime) | Polling sufficient for demo, reduces complexity |
| @mentions in comments | Nice-to-have, not core functionality |
| Project templates | Not needed for demo |
| Time tracking detail | Beyond MVP scope |
| Custom forms | Beyond MVP scope |
| Integrations (Slack, etc.) | Post-MVP |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 1 | Complete |
| BUG-02 | Phase 1 | Complete |
| CLI-01 | Phase 1 | Complete |
| BUG-03 | Phase 2 | Complete |
| CLI-02 | Phase 2 | Complete |
| CLI-03 | Phase 2 | Complete |
| CLI-04 | Phase 2 | Complete |
| CLI-05 | Phase 2 | Complete |
| PROJ-01 | Phase 3 | Complete |
| PROJ-02 | Phase 3 | Complete |
| PROJ-03 | Phase 3 | Complete |
| PROJ-04 | Phase 3 | Complete |
| SET-01 | Phase 3 | Complete |
| SET-02 | Phase 3 | Complete |
| SET-03 | Phase 3 | Complete |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 3 | Complete |
| UI-05 | Phase 3 | Complete |
| CORE-01 | Phase 4 | Pending |
| CORE-02 | Phase 4 | Pending |
| NAV-01 | Phase 4 | Pending |
| NAV-02 | Phase 4 | Pending |
| AUDIT-01 | Phase 4 | Pending |
| AUDIT-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 — Pivot to IBM Carbon aesthetic, added PROJ-*, SET-*, BUG-03, CLI-05*
