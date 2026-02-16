---
phase: 06-high-priority-features
verified: 2026-02-16T18:15:00Z
status: gaps_found
score: 8/9 must-haves verified
gaps:
  - truth: "Client portal displays client-visible status updates"
    status: failed
    reason: "Implementation was added (commit 8a6c595) but then commented out in commit 9e5a0ba due to 'incomplete status update imports'. Portal shows 'Status updates coming soon' placeholder instead of actual updates."
    artifacts:
      - path: "src/pages/portal/PortalProjectPage.tsx"
        issue: "StatusUpdateCard import and useEntityStatusUpdates hook are commented out with TODO markers. Updates tab shows placeholder text 'Status updates coming soon'."
    missing:
      - "Uncomment status update imports in PortalProjectPage.tsx"
      - "Implement StatusUpdateCard rendering in updates tab"
      - "Replace placeholder 'coming soon' text with actual timeline display"
---

# Phase 6: High Priority Features Verification Report

**Phase Goal:** Enable template creation UI, discussions/comments system, and status updates timeline
**Verified:** 2026-02-16T18:15:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can save existing project as template from ProjectDetailPage | ✓ VERIFIED | SaveAsTemplateDialog component exists, actions menu present, mutation wired |
| 2 | Template creation dialog shows project name pre-filled | ✓ VERIFIED | Dialog initializes templateName with `${projectName} Template` (line 29) |
| 3 | Created templates appear in TemplatesPage | ✓ VERIFIED | useProjectTemplates hook fetches templates, grid displays them |
| 4 | User can post comments on any entity (client, project, set, requirement, pitch, lead) | ✓ VERIFIED | DiscussionsPanel on all 6 detail pages with createDiscussion mutation |
| 5 | User can reply to existing comments (threading) | ✓ VERIFIED | DiscussionThread implements createReply with parent_discussion_id |
| 6 | Authors can edit/delete their own comments | ✓ VERIFIED | DiscussionThread checks isAuthor, shows edit/delete dropdown (lines 103-120) |
| 7 | Internal/external visibility toggle controls client portal visibility | ✓ VERIFIED | DiscussionsPanel has is_internal Switch (lines 96-105), stored in DB |
| 8 | User can post status updates on projects | ✓ VERIFIED | PostStatusUpdateDialog with createStatusUpdate mutation, wired to ProjectDetailPage |
| 9 | Updates display in chronological timeline | ✓ VERIFIED | StatusUpdatesTimeline sorts by created_at, displays with StatusUpdateCard |
| 10 | Client portal shows only client-visible updates | ✗ FAILED | Implementation commented out in PortalProjectPage, shows placeholder text instead |
| 11 | Update types show appropriate badges (general, milestone, blocker, completed) | ✓ VERIFIED | StatusUpdateCard maps update_type to badge variant (lines 14-19, 39-43) |

**Score:** 10/11 truths verified (1 failed: client portal status updates)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/projects/SaveAsTemplateDialog.tsx` | Dialog component with mutation | ✓ VERIFIED | 114 lines, wired to useProjectMutations().saveAsTemplate |
| `src/hooks/useDiscussions.ts` | Query and mutation hooks | ✓ VERIFIED | 85 lines, useEntityDiscussions + useDiscussionMutations |
| `src/components/shared/DiscussionThread.tsx` | Thread display with reply/edit/delete | ✓ VERIFIED | 315 lines, implements threading, editing, deletion |
| `src/components/shared/DiscussionsPanel.tsx` | Main panel component | ✓ VERIFIED | 141 lines, form + thread list + internal toggle |
| `src/hooks/useStatusUpdates.ts` | Status update hooks | ✓ VERIFIED | 75 lines, useEntityStatusUpdates + useStatusUpdateMutations |
| `src/components/shared/StatusUpdateCard.tsx` | Single update card | ✓ VERIFIED | 78 lines, displays type badge, content, author, timestamp |
| `src/components/shared/StatusUpdatesTimeline.tsx` | Timeline container | ✓ VERIFIED | 79 lines, vertical timeline with post button |
| `src/components/shared/PostStatusUpdateDialog.tsx` | Creation dialog | ✓ VERIFIED | 172 lines, type selector, content fields, client visibility toggle |
| ProjectDetailPage actions menu | Dropdown with "Save as Template" | ✓ VERIFIED | MoreHorizontal menu with SaveAsTemplateDialog trigger |
| TemplatesPage | Updated workflow info | ✓ VERIFIED | Confusing button removed (commit 1e21d23) |
| DiscussionsPanel on 6 detail pages | ClientDetailPage, ProjectDetailPage, SetDetailPage, RequirementDetailPage, PitchDetailPage, LeadDetailPage | ✓ VERIFIED | All pages import and render DiscussionsPanel in tabs |
| Status Updates tab on ProjectDetailPage | StatusUpdatesTimeline component | ✓ VERIFIED | Tab exists with entityType="project" and canPost=true |
| PortalProjectPage status updates | Client-visible updates display | ✗ STUB | Imports commented out, shows "Status updates coming soon" placeholder |

**Score:** 12/13 artifacts verified (1 stub: portal status updates)

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| SaveAsTemplateDialog | useProjectMutations | saveAsTemplate hook | ✓ WIRED | Mutation called on line 43, proper error handling |
| ProjectDetailPage | SaveAsTemplateDialog | Actions menu import + render | ✓ WIRED | Imported line 60, rendered line 1203 |
| DiscussionsPanel | useEntityDiscussions | Hook call with entityType/entityId | ✓ WIRED | Line 31, query enabled when both present |
| DiscussionThread | useDiscussionMutations | createReply, updateDiscussion, deleteDiscussion | ✓ WIRED | Lines 26, 39-52 (reply), 54-68 (update), 70-74 (delete) |
| All 6 detail pages | DiscussionsPanel | Import + tab render | ✓ WIRED | Verified via grep: all pages import and render in tabs |
| StatusUpdatesTimeline | useEntityStatusUpdates | Hook call with entityType/entityId | ✓ WIRED | PostStatusUpdateDialog uses useStatusUpdateMutations |
| ProjectDetailPage | StatusUpdatesTimeline | Status Updates tab | ✓ WIRED | Line 1184, entityType="project", canPost=true |
| PortalProjectPage | StatusUpdateCard | Client-visible updates | ✗ NOT_WIRED | Imports commented out (lines 3, 20), hook call commented (lines 26-30) |

**Score:** 7/8 key links verified (1 not wired: portal status updates)

### Requirements Coverage

No requirements mapped to Phase 6 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/pages/portal/PortalProjectPage.tsx | 3 | TODO: Implement status updates | ⚠️ Warning | Client portal does not show status updates as planned |
| src/pages/portal/PortalProjectPage.tsx | 20 | Commented import: StatusUpdateCard | ⚠️ Warning | Component exists but not used |
| src/pages/portal/PortalProjectPage.tsx | 26-30 | Commented hook call: useEntityStatusUpdates | ⚠️ Warning | Hook exists and works but disabled |
| src/pages/portal/PortalProjectPage.tsx | 236 | Placeholder text: "Status updates coming soon" | ⚠️ Warning | User-facing indication of incomplete feature |

**Categorization:**
- 🛑 Blocker: 0
- ⚠️ Warning: 4 (all in PortalProjectPage — incomplete portal status updates)
- ℹ️ Info: 0

### Human Verification Required

#### 1. Template Creation End-to-End Flow

**Test:** 
1. Navigate to an existing project detail page
2. Click the three-dots actions menu in the header
3. Select "Save as Template"
4. Verify dialog opens with "{Project Name} Template" pre-filled
5. Click "Create Template"
6. Verify success toast appears
7. Navigate to Templates page
8. Verify new template appears in the grid
9. Click "Use Template" on the new template
10. Verify new project created with same structure

**Expected:** Template creation works end-to-end, new project inherits phases/sets with cleared dates/assignments

**Why human:** Requires full user interaction flow, database state changes, multi-page navigation

#### 2. Discussion Threading and Editing

**Test:**
1. Navigate to any entity detail page (e.g., ClientDetailPage)
2. Go to Discussions tab
3. Post a new comment with internal toggle ON
4. Verify comment appears with "Internal" badge
5. Click Reply on the comment
6. Post a reply
7. Verify reply appears nested under parent
8. Click the three-dots menu on original comment
9. Select Edit
10. Change content and save
11. Verify content updates
12. Click Delete
13. Confirm deletion
14. Verify comment removed

**Expected:** Full CRUD operations work, threading displays correctly, internal badge shows

**Why human:** Requires multiple interactions, visual verification of threading layout, confirmation dialogs

#### 3. Status Updates Timeline and Client Portal

**Test:**
1. Navigate to ProjectDetailPage
2. Go to Status Updates tab
3. Click "Post Update"
4. Select update type "Milestone"
5. Add title and content
6. Toggle "Visible to Client" ON
7. Post update
8. Verify update appears in timeline with Milestone badge and "Client Visible" badge
9. Log out and log in as a client user
10. Navigate to portal project page
11. Go to Updates tab
12. **EXPECTED FAILURE:** Currently shows "Status updates coming soon" instead of the posted update

**Expected:** Team view works, but client portal shows placeholder (gap confirmed)

**Why human:** Requires multi-role testing, portal access, visual verification of badges and timeline

#### 4. Discussions Internal vs External Visibility

**Test:**
1. As team member, post discussion with internal toggle OFF (external)
2. Post another discussion with internal toggle ON (internal)
3. Log in as client user
4. Navigate to same entity's discussions
5. Verify only external discussion is visible
6. Verify internal discussion is hidden

**Expected:** RLS policies enforce visibility based on is_internal flag

**Why human:** Requires multi-role testing, RLS policy verification, portal access

### Gaps Summary

**1 gap found blocking full goal achievement:**

**Gap: Client Portal Status Updates Not Implemented**

The status updates system was built for the team view (ProjectDetailPage) but the client portal integration was incomplete. Commit `8a6c595` added the necessary imports and hooks to `PortalProjectPage.tsx`, but commit `9e5a0ba` (during Plan 06-02 build fixes) commented them out with the note "Commented out incomplete status update imports in PortalProjectPage."

**Current state:**
- `useEntityStatusUpdates` hook works (tested in ProjectDetailPage)
- `StatusUpdateCard` component exists and is functional
- PortalProjectPage has the imports but they're commented out
- Updates tab shows "Status updates coming soon" placeholder

**To fix:**
1. Uncomment lines 3, 20, 26-30 in `src/pages/portal/PortalProjectPage.tsx`
2. Replace the placeholder card (lines 233-239) with StatusUpdateCard rendering:
   ```tsx
   <TabsContent value="updates" className="mt-6">
     {updatesLoading ? (
       <Skeleton className="h-40" />
     ) : clientUpdates?.length === 0 ? (
       <Card>
         <CardContent className="flex flex-col items-center justify-center py-12">
           <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
           <p className="text-muted-foreground">No updates shared yet</p>
         </CardContent>
       </Card>
     ) : (
       <div className="space-y-4">
         {clientUpdates?.map((update, index) => (
           <StatusUpdateCard key={update.id} update={update} isFirst={index === 0} />
         ))}
       </div>
     )}
   </TabsContent>
   ```
3. Test with client user to verify only `show_in_client_portal = true` updates are visible

**Impact:** Client portal users cannot see project status updates, limiting transparency and communication. This is a user-facing feature gap that affects the client experience.

---

_Verified: 2026-02-16T18:15:00Z_
_Verifier: Claude (gsd-verifier)_
