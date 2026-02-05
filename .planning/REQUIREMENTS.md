# Requirements: LineUp MVP

**Defined:** 2026-02-05
**Core Value:** Hierarchical flow (Client → Project → Phase → Set → Requirement) with automatic Eisenhower prioritization and built-in client portal

## v1 Requirements

Requirements for MVP completion demo. Each maps to roadmap phases.

### Bug Fixes

- [x] **BUG-01**: Fix PostgREST schema cache so `location` column on `clients` table is recognized
- [x] **BUG-02**: All INSERT mutations explicitly include `tenant_id` from auth context to prevent RLS visibility bugs

### Client Management

- [x] **CLI-01**: ClientForm includes Name, Status, Overview, Industry (searchable select), Location fields
- [ ] **CLI-02**: Contacts table exists with first_name, last_name, email, phone, role (dropdown), relationship, is_primary, display_id, audit fields
- [ ] **CLI-03**: Client Detail page has Contacts tab showing linked contacts
- [ ] **CLI-04**: System enforces one primary contact per client

### Full-Page UI

- [ ] **UI-01**: Projects use full-page view instead of modal/popup
- [ ] **UI-02**: Sets use full-page view instead of modal/popup
- [ ] **UI-03**: Requirements use full-page view instead of modal/popup
- [ ] **UI-04**: All detail pages implement View/Edit toggle pattern
- [ ] **UI-05**: Parent relationships editable via searchable dropdowns in Edit Mode

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
| CLI-02 | Phase 2 | Pending |
| CLI-03 | Phase 2 | Pending |
| CLI-04 | Phase 2 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| CORE-01 | Phase 4 | Pending |
| CORE-02 | Phase 4 | Pending |
| NAV-01 | Phase 4 | Pending |
| NAV-02 | Phase 4 | Pending |
| AUDIT-01 | Phase 4 | Pending |
| AUDIT-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 after initial definition*
