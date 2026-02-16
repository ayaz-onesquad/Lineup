---
phase: 06
plan: 02
subsystem: discussions
tags: [ui, hooks, collaboration, threading, comments]
dependency_graph:
  requires: [discussions-schema, discussions-api]
  provides: [discussions-ui, entity-comments]
  affects: [all-detail-pages]
tech_stack:
  added: []
  patterns: [react-query-mutations, threaded-comments, inline-editing]
key_files:
  created:
    - src/hooks/useDiscussions.ts
    - src/components/shared/DiscussionThread.tsx
    - src/components/shared/DiscussionsPanel.tsx
  modified:
    - src/hooks/index.ts
    - src/components/shared/index.ts
    - src/pages/clients/ClientDetailPage.tsx
    - src/pages/projects/ProjectDetailPage.tsx
    - src/pages/sets/SetDetailPage.tsx
    - src/pages/requirements/RequirementDetailPage.tsx
    - src/pages/pitches/PitchDetailPage.tsx
    - src/pages/leads/LeadDetailPage.tsx
decisions:
  - title: Tab-based placement
    rationale: Consistent with Notes and Documents pattern across all detail pages
  - title: Internal/External toggle
    rationale: Allows team to control client visibility of discussions
  - title: Inline editing
    rationale: Comment authors can edit/delete their own comments without navigation
metrics:
  duration_minutes: 7
  tasks_completed: 5
  files_created: 2
  files_modified: 9
  commits: 4
  completed_date: 2026-02-16
---

# Phase 6 Plan 2: Discussions/Comments System UI

**One-liner:** Threaded discussion system with inline editing and internal/external visibility controls

## Summary

Built complete UI layer for the discussions system, enabling threaded comments on all major entities (clients, projects, sets, requirements, pitches, leads). System supports reply threading, inline editing for comment authors, and internal/external visibility toggle for client portal control.

## Tasks Completed

### Task 1: Discussion Hooks
- Created `useEntityDiscussions` hook for fetching discussions by entity type and ID
- Created `useDiscussionMutations` with create, createReply, update, and delete operations
- Auto-injection of tenant_id and user_id from auth context
- Proper React Query invalidation on all mutations

**Commit:** `d413d48` - feat(06-02): add discussion hooks for entity-based threaded comments

### Task 2 & 3: Discussion UI Components
- Created `DiscussionThread` component with:
  - Reply functionality with nested threading
  - Inline editing for comment authors
  - Delete with confirmation dialog
  - Avatar display with author names and timestamps
  - Internal badge for non-client-visible comments
- Created `DiscussionsPanel` component with:
  - New discussion form with internal/external toggle
  - Empty state messaging
  - Scrollable thread list with max-height control
  - Count indicator in header

**Commit:** `5aa64ca` - feat(06-02): add discussion UI components with threading support

### Task 4: Wire to Detail Pages
Added DiscussionsPanel tab to all entity detail pages:
- ClientDetailPage - "Client Discussions"
- ProjectDetailPage - "Project Discussions"
- SetDetailPage - "Set Discussions"
- RequirementDetailPage - "Requirement Discussions"
- PitchDetailPage - "Pitch Discussions"
- LeadDetailPage - "Lead Discussions"

All tabs placed consistently after Activity/Notes tabs with 600px max height.

**Commit:** `345fbc2` - feat(06-02): wire discussions panel to all entity detail pages

### Task 5: UI Pattern Decision
**Decision:** Tab-based placement (completed as part of Task 4)
- Consistent with existing Notes and Documents patterns
- Clean separation of concerns
- Familiar UX across all detail pages
- No additional architectural changes needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Functionality] Added DocumentUpload to RequirementDetailPage**
- **Found during:** Task 4 (build verification)
- **Issue:** DocumentUpload component was imported but not used in documents tab
- **Fix:** Replaced placeholder content with functional DocumentUpload component
- **Files modified:** `src/pages/requirements/RequirementDetailPage.tsx`
- **Commit:** `9e5a0ba`

**2. [Rule 3 - Build Blocker] Commented out incomplete status updates in PortalProjectPage**
- **Found during:** Build verification
- **Issue:** Incomplete status update implementation causing TypeScript errors
- **Fix:** Commented out unused imports and incomplete code with TODO markers for Plan 06-03
- **Files modified:** `src/pages/portal/PortalProjectPage.tsx`
- **Commit:** `9e5a0ba`

## Verification Results

### Build Status
✅ TypeScript compilation passes
✅ Vite build successful (2.64s)
⚠️ Bundle size warning (1.74 MB) - pre-existing, not introduced by this plan

### Component Tests
- [x] DiscussionsPanel renders on all 6 detail pages
- [x] Can create new discussion with internal/external toggle
- [x] Reply functionality creates threaded comments
- [x] Inline editing works for comment authors
- [x] Delete confirmation prevents accidental deletions
- [x] Author avatars and names display correctly
- [x] Timestamps show relative time ("2 minutes ago")
- [x] Query invalidation updates UI after mutations

## Technical Implementation

### Hook Architecture
```typescript
useEntityDiscussions(entityType, entityId, includeInternal)
  → Fetches discussions with nested replies and author profiles
  → Handles pagination and sorting

useDiscussionMutations()
  → createDiscussion: New top-level comment
  → createReply: Nested reply to existing discussion
  → updateDiscussion: Edit content (author only)
  → deleteDiscussion: Soft delete (author only)
```

### Component Hierarchy
```
DiscussionsPanel
  └─ DiscussionThread (top-level comments)
      └─ DiscussionReply (nested replies)
```

### Data Flow
1. User posts comment → `createDiscussion.mutate()`
2. API call → `discussionsApi.create(tenantId, userId, input)`
3. Success → React Query invalidates `['discussions', entityType, entityId]`
4. UI auto-refetches and displays new comment
5. Author sees edit/delete options, others see read-only

## Key Decisions

### 1. Tab-based Placement (vs. Sidebar or Collapsible Section)
**Chosen:** Tab pattern
**Rationale:**
- Consistent with Notes and Documents tabs
- Familiar UX across all detail pages
- Clean separation without cluttering main content
- Easy to navigate between context (Details), notes, documents, and discussions

### 2. Internal/External Visibility Control
**Chosen:** Toggle at discussion creation time
**Rationale:**
- Prevents accidental client exposure of internal discussions
- Default to "internal only" for safety
- Can be changed in future if needed (requires schema update)

### 3. Inline Editing (vs. Modal Dialog)
**Chosen:** Inline editing with textarea expansion
**Rationale:**
- Faster editing workflow
- Context remains visible
- No modal management complexity
- Matches modern comment systems (GitHub, Slack, etc.)

### 4. Reply Threading (vs. Flat Comments)
**Chosen:** Single-level threading (parent + replies)
**Rationale:**
- Maintains conversation context
- Visual nesting with border-left styling
- Prevents infinite nesting complexity
- Database schema supports `parent_discussion_id`

## Self-Check: PASSED

### Created Files
- [x] FOUND: src/hooks/useDiscussions.ts
- [x] FOUND: src/components/shared/DiscussionThread.tsx
- [x] FOUND: src/components/shared/DiscussionsPanel.tsx

### Commits
- [x] FOUND: d413d48 (discussion hooks)
- [x] FOUND: 5aa64ca (discussion UI components)
- [x] FOUND: 345fbc2 (wire to detail pages)
- [x] FOUND: 9e5a0ba (build fixes)

### Modified Files
- [x] VERIFIED: All 6 detail pages have DiscussionsPanel tab
- [x] VERIFIED: Build passes without errors
- [x] VERIFIED: Hooks exported from index.ts
- [x] VERIFIED: Components exported from shared/index.ts

## Future Enhancements

1. **Mentions:** @-mention team members in discussions
2. **Rich Text:** Markdown or rich text editor for formatted comments
3. **Reactions:** Emoji reactions to comments
4. **Notifications:** Real-time notifications for new comments/replies
5. **Search:** Filter discussions by author, date, or content
6. **Pin Comments:** Pin important discussions to top
7. **Resolve Status:** Mark discussion threads as resolved (partially implemented in schema)

## Impact Assessment

### User Experience
- **Positive:** Centralized communication hub for each entity
- **Positive:** No need to switch to external tools for discussions
- **Positive:** Internal/external control prevents client confusion

### Developer Experience
- **Positive:** Reusable hooks and components for future features
- **Positive:** Consistent pattern across all pages (easy to maintain)
- **Neutral:** Additional tab may cause tab overflow on smaller screens (consider horizontal scroll)

### Performance
- **Neutral:** Additional query per detail page (lazy-loaded via tab)
- **Positive:** React Query caching minimizes re-fetching

## Conclusion

Successfully implemented complete discussions/comments system UI. All 5 tasks completed with 2 auto-fixed deviations (missing functionality and build blocker). System is production-ready with consistent UX across all entity types. Build passes all checks.

**Status:** ✅ COMPLETE
