# Phase 4: CORE Workflow & Audit - Research

**Researched:** 2026-02-14
**Domain:** React UI patterns, form cascading, state management, audit display
**Confidence:** HIGH

## Summary

Phase 4 focuses on completing the CORE methodology features: displaying Eisenhower priority (already calculated in database), implementing review workflow visibility, creating cascading filters in forms, ensuring "Create New" buttons pre-populate parent IDs, and displaying audit trails consistently.

The good news is that **most infrastructure already exists**. The database has `calculate_eisenhower_priority` functions, triggers auto-calculate priority, the `AuditTrail` component exists and works, `SearchableSelect` supports cascading filters via `useWatch` + `useMemo`, and `openCreateModal` accepts context for pre-populating parent IDs. The work is primarily about **applying existing patterns consistently** across all relevant pages.

**Primary recommendation:** This phase is about pattern consistency, not building new infrastructure. Audit existing pages against a checklist, then systematically apply established patterns where missing.

## Standard Stack

### Core (Already in Use)
| Library | Version | Purpose | Already Implemented |
|---------|---------|---------|---------------------|
| React Hook Form | v7.x | Form state management | YES - all forms use it |
| Zod | v3.x | Schema validation | YES - all forms use it |
| TanStack Query | v5.x | Server state | YES - all hooks use it |
| Zustand | v4.x | UI state | YES - `useUIStore` for modals |

### Supporting (Already in Use)
| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `SearchableSelect` | `/src/components/ui/searchable-select.tsx` | Cascading dropdowns | Complete |
| `ViewEditField` | `/src/components/shared/ViewEditField.tsx` | View/Edit mode fields | Complete |
| `AuditTrail` | `/src/components/shared/AuditTrail.tsx` | Audit display | Complete |
| `CreateModal` | `/src/components/shared/CreateModal.tsx` | Entity creation | Complete |

**No new installations required.**

## Architecture Patterns

### Pattern 1: Eisenhower Priority Display

The database already calculates priority via triggers. Frontend has utility functions in `utils.ts`:

```typescript
// Source: /src/lib/utils.ts (lines 115-172)
import {
  calculateEisenhowerPriority,
  getPriorityLabel,
  getPriorityColor
} from '@/lib/utils'

// In component - display computed priority
const priority = calculateEisenhowerPriority(
  form.watch('importance'),
  form.watch('urgency')
)

return (
  <Badge className={getPriorityColor(priority)}>
    {priority} - {getPriorityLabel(priority)}
  </Badge>
)
```

**Priority Color Mapping (already implemented):**
| Priority | Label | Color Class |
|----------|-------|-------------|
| 1 | Critical | `bg-red-600 text-white` |
| 2 | High | `bg-red-500 text-white` |
| 3 | Medium-High | `bg-orange-500 text-white` |
| 4 | Medium | `bg-yellow-500 text-black` |
| 5 | Low | `bg-green-500 text-white` |
| 6 | Minimal | `bg-gray-400 text-white` |

**Where priority display is needed:**
- SetDetailPage header card - DONE (line 426-440)
- RequirementDetailPage header card - DONE (line 447-461)
- SetsPage grid - Priority column (verify badge format)
- RequirementsPage grid - Priority column (verify badge format)

### Pattern 2: Cascading Filter in Forms

The pattern uses `useWatch` + `useMemo` + `useEffect` for resetting child fields:

```typescript
// Source: /src/components/forms/SetForm.tsx (lines 77-98)

// 1. Watch parent field
const selectedClientId = useWatch({ control: form.control, name: 'client_id' })

// 2. Filter child options based on parent
const filteredProjects = useMemo(() => {
  if (!allProjects) return []
  if (!selectedClientId) return allProjects
  return allProjects.filter((p) => p.client_id === selectedClientId)
}, [allProjects, selectedClientId])

// 3. Reset child when parent changes if child is invalid
useEffect(() => {
  if (selectedClientId) {
    const currentProject = form.getValues('project_id')
    if (currentProject) {
      const projectStillValid = filteredProjects.some((p) => p.id === currentProject)
      if (!projectStillValid) {
        form.setValue('project_id', '')
      }
    }
  }
}, [selectedClientId, filteredProjects, form])
```

**Three-level cascade (Client -> Project -> Set):**
Already implemented in `RequirementForm.tsx` (lines 99-163).

### Pattern 3: Pre-populate Parent ID from Context

The `openCreateModal` function accepts a `context` parameter that is passed to forms:

```typescript
// Source: /src/stores/uiStore.ts (lines 95-100)
openCreateModal: (type, context = {}) =>
  set({
    createModalOpen: true,
    createModalType: type,
    createModalContext: context,
  }),

// Usage in SetDetailPage.tsx (line 766)
<Button onClick={() => openCreateModal('requirement', { set_id: set.id })}>
  Add Requirement
</Button>
```

In `CreateModal.tsx`, context is passed to forms via `defaultValues`:

```typescript
// Source: /src/components/shared/CreateModal.tsx (line ~120)
<RequirementForm
  defaultValues={createModalContext as { set_id?: string }}
  onSuccess={() => handleSuccess('Requirement')}
/>
```

### Pattern 4: Review Workflow Visibility

When `requires_review` is true, show additional fields:

```typescript
// Source: /src/pages/requirements/RequirementDetailPage.tsx (lines 581-604)
{form.watch('requires_review') && (
  <>
    <ViewEditField
      type="select"
      label="Reviewer"
      isEditing={isEditing}
      value={form.watch('reviewer_id') || ''}
      onChange={(v) => form.setValue('reviewer_id', v)}
      options={tenantUsers?.map(/* ... */)}
    />
    <ViewEditField
      type="select"
      label="Review Status"
      isEditing={isEditing}
      value={form.watch('review_status')}
      onChange={(v) => form.setValue('review_status', v)}
      options={REVIEW_STATUS_OPTIONS}
    />
  </>
)}
```

**Review Status Options (already defined in RequirementDetailPage.tsx lines 50-56):**
- `not_required` - "Not Required"
- `pending` - "Pending"
- `in_review` - "In Review"
- `approved` - "Approved"
- `rejected` - "Rejected"

### Pattern 5: AuditTrail Component Usage

```typescript
// Source: /src/components/shared/AuditTrail.tsx

// Full version for detail pages
<AuditTrail
  created_at={entity.created_at}
  created_by={entity.created_by}
  updated_at={entity.updated_at}
  updated_by={entity.updated_by}
  creator={entity.creator}      // UserProfile object with full_name, avatar_url
  updater={entity.updater}      // UserProfile object
/>

// Compact version for list items
<AuditTrailCompact
  created_at={entity.created_at}
  updated_at={entity.updated_at}
  creator={entity.creator}
/>
```

**Requirements for AuditTrail:**
1. API queries must join `user_profiles` for creator/updater
2. Database views (`sets_with_profiles`, `requirements_with_profiles`) already do this
3. Component handles null creator/updater gracefully

### Pattern 6: Display ID Prominence

Display IDs should appear in:
1. Page headers: `{name} | ID: {display_id}`
2. Grid rows: Badge with `#{display_id}`
3. Breadcrumbs: `displayId` prop on final item

```typescript
// Header pattern (SetDetailPage.tsx line 304-306)
<h1 className="text-3xl font-bold tracking-tight">
  {set.name}
  {set.display_id && <span className="text-muted-foreground"> | ID: {set.display_id}</span>}
</h1>

// Grid pattern (SetDetailPage.tsx line 810-815)
<div className="flex items-center gap-2">
  {req.title}
  {req.display_id && (
    <Badge variant="outline" className="font-mono text-xs">
      #{req.display_id}
    </Badge>
  )}
</div>

// Breadcrumb pattern
<Breadcrumbs items={[
  { label: 'Client Name', href: '/clients/...' },
  { label: 'Project Name', href: '/projects/...' },
  { label: set.name, displayId: set.display_id }, // Final item with displayId
]} />
```

### Recommended Project Structure

No structural changes needed. Existing structure supports this phase:

```
src/
├── components/
│   ├── shared/
│   │   ├── AuditTrail.tsx          # Exists - complete
│   │   ├── ViewEditField.tsx       # Exists - complete
│   │   ├── Breadcrumbs.tsx         # Exists - needs displayId support check
│   │   └── CreateModal.tsx         # Exists - passes context to forms
│   └── forms/
│       ├── SetForm.tsx             # Has cascading filters
│       └── RequirementForm.tsx     # Has 3-level cascade
├── lib/
│   └── utils.ts                    # Priority functions exist
└── pages/
    ├── sets/
    │   └── SetDetailPage.tsx       # Has AuditTrail, priority display
    └── requirements/
        └── RequirementDetailPage.tsx # Has review workflow, AuditTrail
```

### Anti-Patterns to Avoid

- **Inline priority calculation without memoization:** Use `useMemo` or calculate inline only in render
- **Missing reset effect for cascading fields:** Always add `useEffect` to reset child when parent changes
- **Fetching user profiles separately for audit:** Use views that already join profiles
- **Hardcoding reviewer options:** Use same `tenantUsers` hook as other team fields

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Priority calculation | Custom frontend logic | `calculateEisenhowerPriority` from utils.ts | Database trigger is source of truth |
| Priority badge colors | Custom color function | `getPriorityColor` from utils.ts | Consistent with DB priorities |
| Cascading dropdown state | Custom state management | `useWatch` + `useMemo` pattern | React Hook Form already tracks |
| User profile fetching for audit | Separate profile API calls | Database views with profile joins | Already implemented in views |
| Form pre-population | URL params or complex state | `createModalContext` via uiStore | Pattern already established |

**Key insight:** All required functionality exists. The work is pattern application, not creation.

## Common Pitfalls

### Pitfall 1: Forgetting to Reset Child Fields
**What goes wrong:** User selects Client A, then Project from A, then changes to Client B - but project dropdown still shows old project from A.
**Why it happens:** No `useEffect` to reset project when client changes.
**How to avoid:** Copy the reset pattern from SetForm.tsx lines 88-98.
**Warning signs:** Form submits with mismatched parent IDs.

### Pitfall 2: Missing Profile Joins in Queries
**What goes wrong:** AuditTrail shows "Unknown User" or no avatar.
**Why it happens:** API query doesn't include `creator` and `updater` joins.
**How to avoid:** Check API service `getById` method includes profile joins.
**Warning signs:** `entity.creator` is undefined in component.

### Pitfall 3: Priority Display Without Live Recalculation
**What goes wrong:** User changes Urgency but Priority badge doesn't update until save.
**Why it happens:** Using `entity.priority` from server instead of calculating from watched form values.
**How to avoid:** Always use `calculateEisenhowerPriority(form.watch('importance'), form.watch('urgency'))` in edit mode.
**Warning signs:** Priority badge doesn't change when urgency/importance dropdowns change.

### Pitfall 4: Review Fields Always Visible
**What goes wrong:** Reviewer and Review Status fields show even when `requires_review` is false.
**Why it happens:** Missing conditional render.
**How to avoid:** Wrap in `{form.watch('requires_review') && ( ... )}`.
**Warning signs:** Confusing UX where user can set reviewer but it has no effect.

### Pitfall 5: Context Not Passed to Form
**What goes wrong:** User clicks "Add Requirement" from SetDetailPage but Set dropdown is empty.
**Why it happens:** CreateModal doesn't pass context to form's defaultValues.
**How to avoid:** Verify CreateModal passes `createModalContext` to each form.
**Warning signs:** Forms don't pre-populate parent IDs from context.

## Code Examples

### Complete Cascading Filter Implementation

```typescript
// Three-level cascade: Client -> Project -> Set
// Source: /src/components/forms/RequirementForm.tsx (verified working)

const selectedClientId = useWatch({ control: form.control, name: 'client_id' })
const selectedProjectId = useWatch({ control: form.control, name: 'project_id' })

// Filter projects by client
const filteredProjects = useMemo(() => {
  if (!allProjects) return []
  if (!selectedClientId) return allProjects
  return allProjects.filter((p) => p.client_id === selectedClientId)
}, [allProjects, selectedClientId])

// Filter sets by project (or client if no project)
const filteredSets = useMemo(() => {
  if (selectedProjectId && projectSets) {
    return projectSets
  }
  if (!allSets) return []
  if (selectedProjectId) {
    return allSets.filter((s) => s.project_id === selectedProjectId)
  }
  if (selectedClientId) {
    const projectIds = filteredProjects.map((p) => p.id)
    return allSets.filter((s) => s.project_id && projectIds.includes(s.project_id))
  }
  return allSets
}, [allSets, projectSets, selectedProjectId, selectedClientId, filteredProjects])

// Reset dependent fields when parent changes
useEffect(() => {
  if (selectedClientId) {
    const currentProject = form.getValues('project_id')
    const currentSet = form.getValues('set_id')

    if (currentProject) {
      const projectStillValid = filteredProjects.some((p) => p.id === currentProject)
      if (!projectStillValid) {
        form.setValue('project_id', '')
        form.setValue('set_id', '')
      }
    }

    if (currentSet) {
      const setStillValid = filteredSets.some((s) => s.id === currentSet)
      if (!setStillValid) {
        form.setValue('set_id', '')
      }
    }
  }
}, [selectedClientId, filteredProjects, filteredSets, form])
```

### AuditTrail with User Profiles

```typescript
// API query pattern (sets.ts)
const query = supabase
  .from('sets_with_profiles')  // Use view, not table
  .select('*')
  .eq('id', setId)
  .single()

// View already includes:
// - creator: { id, full_name, avatar_url }
// - updater: { id, full_name, avatar_url }

// Component usage
<AuditTrail
  created_at={set.created_at}
  created_by={set.created_by}
  updated_at={set.updated_at}
  updated_by={set.updated_by}
  creator={set.creator}
  updater={set.updater}
/>
```

### Priority Display in Grid

```typescript
// Column definition for priority display
<TableCell>
  {(() => {
    const priority = item.priority || calculateEisenhowerPriority(item.importance, item.urgency)
    return (
      <Badge className={getPriorityColor(priority)} variant="outline">
        P{priority}
      </Badge>
    )
  })()}
</TableCell>
```

### Pre-populate Parent ID Pattern

```typescript
// In detail page (e.g., SetDetailPage)
<Button onClick={() => openCreateModal('requirement', { set_id: set.id })}>
  Add Requirement
</Button>

// In CreateModal.tsx, pass context to form
<TabsContent value="requirement">
  <RequirementForm
    defaultValues={createModalContext as { set_id?: string; client_id?: string }}
    onSuccess={() => handleSuccess('Requirement')}
  />
</TabsContent>

// In RequirementForm.tsx, use defaultValues
const form = useForm<RequirementFormData>({
  resolver: zodResolver(requirementSchema),
  defaultValues: {
    set_id: defaultValues?.set_id || '',
    // ... other fields
  },
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual priority calculation | Trigger-based in database | Migration 020 | Priority always consistent |
| Separate profile fetches | Database views with joins | Migration 022 | One query, all data |
| URL params for context | Zustand `createModalContext` | Phase 2 | Clean, typesafe |

**Deprecated/outdated:**
- `priority_score` column: Removed in migration 022, use `priority` only
- Direct `auth.users` joins: Use `user_profiles` via views instead

## Audit Checklist

### Priority Display
- [ ] SetDetailPage header shows priority badge
- [ ] SetDetailPage grid shows priority column
- [ ] RequirementDetailPage header shows priority badge
- [ ] RequirementsPage grid shows priority column
- [ ] SetsPage grid shows priority column

### Review Workflow
- [ ] RequirementDetailPage shows Reviewer when `requires_review` is true
- [ ] RequirementDetailPage shows Review Status when `requires_review` is true
- [ ] RequirementForm has `requires_review` toggle
- [ ] Review fields hidden when `requires_review` is false

### Cascading Filters
- [ ] SetForm: Client filters Projects
- [ ] RequirementForm: Client -> Project -> Set cascade
- [ ] All forms reset child fields when parent changes

### Pre-populate Parent IDs
- [ ] SetDetailPage "Add Requirement" passes `set_id`
- [ ] ClientDetailPage "Create Set" passes `client_id`
- [ ] ClientDetailPage "Create Requirement" passes `client_id`
- [ ] ProjectDetailPage "Create Set" passes `project_id`
- [ ] CreateModal passes `createModalContext` to all forms

### Display ID Prominence
- [ ] ClientDetailPage header shows display_id
- [ ] ProjectDetailPage header shows display_id
- [ ] SetDetailPage header shows display_id
- [ ] RequirementDetailPage header shows display_id
- [ ] Grid rows show `#{display_id}` badges

### AuditTrail
- [ ] ClientDetailPage has AuditTrail in footer
- [ ] ProjectDetailPage has AuditTrail in footer
- [ ] SetDetailPage has AuditTrail in footer
- [ ] RequirementDetailPage has AuditTrail in footer
- [ ] All AuditTrails show user names (not IDs)
- [ ] API queries include profile joins

## Open Questions

1. **Should Sets have review workflow?**
   - What we know: Requirements have `requires_review`, `reviewer_id`, `review_status`
   - What's unclear: Phase description mentions "Set or Requirement" - sets don't have these fields
   - Recommendation: Verify with product owner. If needed, add migration first.

2. **Priority display format consistency**
   - What we know: SetDetailPage uses badge with "P{n} - {label}"
   - What's unclear: Should grids use same format or shorter "P{n}"?
   - Recommendation: Use shorter "P{n}" in grids for space, full format in detail pages.

## Sources

### Primary (HIGH confidence)
- `/src/lib/utils.ts` - Priority calculation functions (lines 115-172)
- `/src/components/shared/AuditTrail.tsx` - Audit component
- `/src/components/forms/SetForm.tsx` - Cascading filter pattern
- `/src/components/forms/RequirementForm.tsx` - Three-level cascade
- `/src/stores/uiStore.ts` - Modal context pattern
- `/supabase/migrations/022_fix_views_and_priority_score.sql` - View definitions

### Secondary (MEDIUM confidence)
- `/src/pages/requirements/RequirementDetailPage.tsx` - Review workflow implementation
- `/src/pages/sets/SetDetailPage.tsx` - Priority display, AuditTrail placement

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components already exist in codebase
- Architecture: HIGH - patterns verified against working code
- Pitfalls: HIGH - based on actual codebase patterns and prior bugs

**Research date:** 2026-02-14
**Valid until:** Stable patterns - 60+ days
