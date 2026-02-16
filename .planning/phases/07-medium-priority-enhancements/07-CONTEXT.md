# Phase 7: Medium Priority Enhancements

## Priority: MEDIUM

## Overview

This phase completes the UI for two partially-built features:

1. **Phase Management UI** - PhasesPage, PhaseDetailPage, drag-drop ordering
2. **Client Portal Enhancement** - Expose sets, requirements, documents to client users

## Current State

### Phase Management
- **Database:** `project_phases` table fully implemented with ordering fields
- **API:** `phasesApi` service exists with full CRUD
- **UI:** Phases tab exists in ProjectDetailPage but minimal
- **MISSING:**
  - Standalone PhasesPage for overview
  - PhaseDetailPage for editing phase details
  - Drag-drop reordering UI
  - Phase team assignments UI

### Client Portal
- **Database:** `show_in_client_portal` flag exists on projects
- **Pages:** PortalDashboardPage and PortalProjectPage exist
- **MISSING:**
  - Sets visibility in portal
  - Requirements visibility in portal
  - Documents visibility in portal
  - Any interaction capabilities (comments, approvals)

## Success Criteria

1. Users can view all phases across projects in PhasesPage
2. Users can edit phase details in PhaseDetailPage
3. Users can reorder phases via drag-drop in ProjectDetailPage
4. Client users can see sets and requirements in their portal
5. Client users can view/download portal-visible documents

## Dependencies

- Phase 5 and 6 should be completed first
- This phase is enhancement, not critical functionality
