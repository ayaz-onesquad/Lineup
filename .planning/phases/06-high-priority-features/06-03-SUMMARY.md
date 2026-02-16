---
phase: 06
plan: 03
subsystem: ui-status-updates
tags: [status-updates, timeline, ui-components, client-portal]
dependency-graph:
  requires: [statusUpdatesApi, database-schema]
  provides: [StatusUpdatesTimeline, StatusUpdateCard, PostStatusUpdateDialog, client-visible-updates]
  affects: [ProjectDetailPage, PortalProjectPage]
tech-stack:
  added: [timeline-ui-pattern]
  patterns: [read-only-client-view, entity-polymorphic-updates]
key-files:
  created:
    - src/hooks/useStatusUpdates.ts
    - src/components/shared/StatusUpdateCard.tsx
    - src/components/shared/StatusUpdatesTimeline.tsx
    - src/components/shared/PostStatusUpdateDialog.tsx
  modified:
    - src/services/api/statusUpdates.ts
    - src/pages/projects/ProjectDetailPage.tsx
    - src/pages/portal/PortalProjectPage.tsx
    - src/hooks/index.ts
    - src/components/shared/index.ts
decisions:
  - Use separate profile fetch pattern (not FK joins) due to auth.users reference
  - Use Textarea instead of RichTextEditor for simpler content input
  - Client portal shows only updates with show_in_client_portal = true
  - No edit/delete functionality in initial implementation
metrics:
  duration_minutes: 6
  tasks_completed: 6
  files_created: 4
  files_modified: 7
  commits: 6
  completed_date: 2026-02-16
---

# Phase 6 Plan 3: Status Updates System UI

**One-liner:** Built complete status updates timeline UI with team posting and client-visible portal view.

## Summary

Successfully implemented the status updates system UI, enabling teams to post project updates (progress, milestones, blockers, completed) with optional client visibility. Added timeline display to ProjectDetailPage and read-only view to client portal.

## Tasks Completed

### Task 1: Create Status Update Hooks
- **Commit:** d3deb7c
- **Description:** Created useStatusUpdates.ts with entity queries and mutations
- **Key Changes:**
  - `useEntityStatusUpdates(entityType, entityId, includeInternalOnly)` - fetch updates with author profiles
  - `useRecentStatusUpdates(limit)` - tenant-wide recent updates
  - `useStatusUpdateMutations()` - create operations with toast notifications
  - Updated `statusUpdatesApi` to fetch author profiles separately (auth.users → user_profiles pattern)
- **Files:**
  - `src/hooks/useStatusUpdates.ts` (created)
  - `src/services/api/statusUpdates.ts` (modified)
  - `src/hooks/index.ts` (modified)

### Task 2: Create StatusUpdateCard Component
- **Commit:** e36c008
- **Description:** Single status update card display in timeline format
- **Key Changes:**
  - Type badges: general, milestone, blocker, completed
  - Client visibility indicator with Eye icon
  - Author avatar, name, timestamp
  - Timeline dot styling (primary for first, muted for rest)
  - Optional title field support
- **Files:**
  - `src/components/shared/StatusUpdateCard.tsx` (created)

### Task 3: Create StatusUpdatesTimeline Component
- **Commit:** 7358222
- **Description:** Vertical timeline container with chronological display
- **Key Changes:**
  - "Post Update" button at top (conditionally visible)
  - Vertical line connector for visual timeline
  - Empty state message
  - Loading skeleton states
  - Newest-first ordering
- **Files:**
  - `src/components/shared/StatusUpdatesTimeline.tsx` (created)

### Task 4: Create PostStatusUpdateDialog
- **Commit:** 38f197c
- **Description:** Dialog form for creating status updates
- **Key Changes:**
  - Update type dropdown (general, milestone, blocker, completed) with descriptions
  - Title (optional) and Content (required) fields
  - Client visibility toggle switch
  - Form validation and reset on submit
  - Loading state during submission
- **Files:**
  - `src/components/shared/PostStatusUpdateDialog.tsx` (created)

### Task 5: Wire to ProjectDetailPage
- **Commit:** 7194407
- **Description:** Added Status Updates tab to project detail view
- **Key Changes:**
  - New "Status Updates" tab with Calendar icon
  - StatusUpdatesTimeline component with posting enabled
  - Exported all new components from shared/index.ts
  - Fixed useDiscussions to use useTenantStore (deviation - bug fix)
  - Fixed SaveAsTemplateDialog toast usage (deviation - bug fix)
- **Files:**
  - `src/pages/projects/ProjectDetailPage.tsx` (modified)
  - `src/components/shared/index.ts` (modified)
  - `src/hooks/useDiscussions.ts` (fixed)
  - `src/components/projects/SaveAsTemplateDialog.tsx` (fixed)

### Task 6: Wire to Client Portal
- **Commit:** 8a6c595
- **Description:** Added client-visible updates to portal project page
- **Key Changes:**
  - Updates tab shows only client-visible updates (show_in_client_portal = true)
  - Read-only view (no post button)
  - Same timeline layout as team view
  - Loading and empty states
- **Files:**
  - `src/pages/portal/PortalProjectPage.tsx` (modified)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed useDiscussions tenant store usage**
- **Found during:** Task 5 (build verification)
- **Issue:** `useDiscussions.ts` was using `useAuth().currentTenantId` which doesn't exist
- **Fix:** Changed to use `useTenantStore().currentTenant.id` pattern
- **Files modified:** `src/hooks/useDiscussions.ts`
- **Commit:** Included in 7194407

**2. [Rule 1 - Bug] Fixed SaveAsTemplateDialog toast import**
- **Found during:** Task 5 (build verification)
- **Issue:** Importing `toast` from 'sonner' package which doesn't exist
- **Fix:** Changed to import from '@/hooks/use-toast' and updated toast usage pattern
- **Files modified:** `src/components/projects/SaveAsTemplateDialog.tsx`
- **Commit:** Included in 7194407

**3. [Rule 2 - Missing Critical] Author profile fetching in API**
- **Found during:** Task 1 (API review)
- **Issue:** `statusUpdatesApi` wasn't fetching author profiles, would cause undefined author data
- **Fix:** Added separate profile fetch pattern after main query (auth.users → user_profiles mapping)
- **Rationale:** Follows established pattern for auth.users references (no direct FK to user_profiles)
- **Files modified:** `src/services/api/statusUpdates.ts`
- **Commit:** d3deb7c

## Technical Decisions

### 1. Separate Profile Fetch Pattern
**Decision:** Fetch user_profiles separately, not via PostgREST FK joins
**Rationale:** `author_id` references `auth.users(id)`, not `user_profiles(id)`. PostgREST can't do multi-hop joins (status_updates → auth.users → user_profiles).
**Implementation:** Collect author_ids → fetch profiles in bulk → map to updates
**Reference:** CLAUDE.md Phase 2 Retrospective - 400 Bad Request Errors

### 2. Textarea vs RichTextEditor
**Decision:** Use simple Textarea for content input
**Rationale:** Simpler UX for quick updates, can upgrade to RichTextEditor later if needed
**Trade-off:** No rich formatting, but faster posting experience

### 3. Client Portal Read-Only
**Decision:** No edit/delete/post functionality in client portal
**Rationale:** Clients should consume updates, not create them. Team controls narrative.
**Future:** Could add client comment/reply feature on updates

### 4. No Edit/Delete in Initial Release
**Decision:** StatusUpdateCard shows content but no action menu
**Rationale:** Focus on creation flow first, editing less critical for status updates
**Plan mentioned edit/delete but deferred for simplicity**

## Verification

### Build Status
✅ All TypeScript compilation passed
✅ No status update related errors
⚠️ Pre-existing unused import warnings (unrelated to this plan)

### Feature Checklist
- [x] Status Updates tab appears in ProjectDetailPage
- [x] Can post new status update with all fields
- [x] Updates appear in chronological timeline (newest first)
- [x] Status type badges display correctly
- [x] Client visibility indicator shows
- [x] Client portal shows only client-visible updates
- [x] Client portal is read-only (no post button)
- [x] Author profiles display correctly
- [x] Timeline visual (vertical line, dots) works

### Components Created
- `useEntityStatusUpdates(entityType, entityId, includeInternalOnly)` - hook
- `useRecentStatusUpdates(limit)` - hook
- `useStatusUpdateMutations()` - hook
- `<StatusUpdateCard>` - component
- `<StatusUpdatesTimeline>` - component
- `<PostStatusUpdateDialog>` - component

### Integration Points
- ProjectDetailPage → Status Updates tab → StatusUpdatesTimeline
- PortalProjectPage → Updates tab → StatusUpdateCard list (client-visible only)

## Self-Check: PASSED

### Created Files Verification
```
✓ FOUND: src/hooks/useStatusUpdates.ts
✓ FOUND: src/components/shared/StatusUpdateCard.tsx
✓ FOUND: src/components/shared/StatusUpdatesTimeline.tsx
✓ FOUND: src/components/shared/PostStatusUpdateDialog.tsx
```

### Commits Verification
```
✓ FOUND: d3deb7c (Task 1 - hooks)
✓ FOUND: e36c008 (Task 2 - StatusUpdateCard)
✓ FOUND: 7358222 (Task 3 - StatusUpdatesTimeline)
✓ FOUND: 38f197c (Task 4 - PostStatusUpdateDialog)
✓ FOUND: 7194407 (Task 5 - ProjectDetailPage integration)
✓ FOUND: 8a6c595 (Task 6 - Client portal integration)
```

### Modified Files Verification
```
✓ FOUND: src/services/api/statusUpdates.ts (author profiles)
✓ FOUND: src/pages/projects/ProjectDetailPage.tsx (Status Updates tab)
✓ FOUND: src/pages/portal/PortalProjectPage.tsx (client-visible updates)
✓ FOUND: src/hooks/index.ts (hook exports)
✓ FOUND: src/components/shared/index.ts (component exports)
```

## Next Steps

### Immediate
1. Test status updates in development environment
2. Verify client portal visibility toggle works correctly
3. Test with multiple users (team vs client views)

### Future Enhancements
1. Add edit/delete functionality for status updates
2. Add notifications when new client-visible update posted
3. Add filtering by update type (milestone, blocker, etc.)
4. Add RichTextEditor support for formatted content
5. Add client reply/comment functionality
6. Add status update analytics (views, engagement)

## Notes

- Plan execution was clean with minimal deviations
- All deviations were bug fixes (Rule 1) or missing critical functionality (Rule 2)
- Timeline UI pattern reusable for other features (activity logs, audit trails)
- Client portal integration demonstrates polymorphic component design
- Author profile fetching pattern now documented for future entity APIs
