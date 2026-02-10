# Phase 3: Projects & Sets Enhancement - Research

**Researched:** 2026-02-10
**Domain:** React Detail Pages, ViewEditToggle Pattern, Date Fields, Team Member Dropdowns
**Confidence:** HIGH

## Summary

Phase 3 enhances Projects and Sets with full-page detail views using the ViewEditToggle pattern established in Phase 2. The codebase already has complete implementations for both ProjectDetailPage and SetDetailPage that serve as reference implementations. These pages demonstrate IBM Carbon styling, date field management, and team member selection patterns.

**Key Finding:** The required functionality is largely ALREADY IMPLEMENTED. ProjectDetailPage and SetDetailPage both exist with ViewEditToggle, date pickers (expected/actual start/end), and team dropdowns (lead, secondary lead, PM). The main work will be verifying completeness and potentially adding budget fields to Sets.

**Primary recommendation:** Audit existing implementations against requirements, add missing budget fields to Sets schema/UI, ensure all patterns are consistent with Phase 2 standards.

## Standard Stack

### Core Components (Already in Codebase)
| Component | Purpose | Current Implementation |
|-----------|---------|------------------------|
| ViewEditField | Mendix-style view/edit toggle for individual fields | `/src/components/shared/ViewEditField.tsx` - Supports text, textarea, date, select, badge, switch, custom |
| SearchableSelect | Dropdown with search for team members and parent relationships | `/src/components/ui/searchable-select.tsx` - Includes clearable prop, description support |
| React Hook Form + Zod | Form validation and state management | Used in all detail pages with zodResolver |
| TanStack Query v5 | Server state management | useProject, useSet, useProjectMutations, useSetMutations hooks |

### Supporting Libraries (No New Dependencies Needed)
| Library | Version | Purpose | Already Used For |
|---------|---------|---------|------------------|
| lucide-react | Latest | Icons (Calendar, Users, Edit, Save, etc.) | All existing detail pages |
| date-fns or native | N/A | Date formatting via formatDate utility | ProjectDetailPage, SetDetailPage date displays |
| @radix-ui/* | Latest | Accessible UI primitives (tabs, cards, etc.) | Tabs, Cards, Dropdowns throughout |

**Installation:** No new packages required - all dependencies already installed.

## Architecture Patterns

### Existing Project Structure (Verified)
```
src/
├── pages/
│   ├── projects/ProjectDetailPage.tsx  ✓ ALREADY EXISTS
│   ├── sets/SetDetailPage.tsx          ✓ ALREADY EXISTS
│   └── requirements/RequirementDetailPage.tsx  ✓ ALREADY EXISTS
├── components/
│   ├── shared/ViewEditField.tsx        ✓ ALREADY EXISTS
│   └── ui/searchable-select.tsx        ✓ ALREADY EXISTS
└── hooks/
    ├── useProjects.ts                  ✓ ALREADY EXISTS
    └── useSets.ts                      ✓ ALREADY EXISTS
```

### Pattern 1: ViewEditToggle Detail Page (ESTABLISHED)
**What:** Full-page view with inline edit mode toggle
**When to use:** All entity detail pages (Projects, Sets, Requirements, Clients)
**Example from SetDetailPage.tsx:**
```typescript
// 1. Edit state management
const [isEditing, setIsEditing] = useState(false)
const [isSaving, setIsSaving] = useState(false)

// 2. Auto-enter edit mode from URL param (?edit=true)
useEffect(() => {
  if (shouldEditOnLoad && set && !isEditing) {
    setIsEditing(true)
    setSearchParams({}, { replace: true })
  }
}, [shouldEditOnLoad, set])

// 3. Edit/Save/Cancel buttons in card
{isEditing ? (
  <>
    <Button variant="outline" size="sm" onClick={handleCancelEdit}>
      <X className="mr-2 h-4 w-4" />
      Cancel
    </Button>
    <Button size="sm" onClick={form.handleSubmit(handleSave)}>
      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
      Save
    </Button>
  </>
) : (
  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
    <Edit className="mr-2 h-4 w-4" />
    Edit
  </Button>
)}
```

### Pattern 2: Date Fields (4-Field Pattern)
**What:** Expected Start/End + Actual Start/End date pickers
**When to use:** All scheduled entities (Projects, Sets, Phases, Requirements)
**Example from ProjectDetailPage.tsx:**
```typescript
// Schema definition
const projectFormSchema = z.object({
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
})

// Form initialization - convert ISO to YYYY-MM-DD
defaultValues: {
  expected_start_date: project?.expected_start_date?.split('T')[0] || '',
  expected_end_date: project?.expected_end_date?.split('T')[0] || '',
  actual_start_date: project?.actual_start_date?.split('T')[0] || '',
  actual_end_date: project?.actual_end_date?.split('T')[0] || '',
}

// UI rendering in Schedule section
<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
  <ViewEditField
    type="date"
    label="Expected Start"
    isEditing={isEditing}
    value={form.watch('expected_start_date') || ''}
    onChange={(v) => form.setValue('expected_start_date', v)}
  />
  <ViewEditField type="date" label="Expected End" ... />
  <ViewEditField type="date" label="Actual Start" ... />
  <ViewEditField type="date" label="Actual End" ... />
</div>
```

### Pattern 3: Team Member Dropdowns (Editable)
**What:** Searchable dropdowns for lead_id, secondary_lead_id, pm_id
**When to use:** Projects, Sets, Phases (entities with team assignments)
**Example from SetDetailPage.tsx:**
```typescript
// 1. Fetch tenant users
const { data: users } = useTenantUsers()

// 2. Build user options (CRITICAL: use user_profiles.id, NOT user_id)
const userOptions = useMemo(() =>
  users?.filter((u) => u.user_profiles?.id).map((u) => ({
    value: u.user_profiles!.id,
    label: u.user_profiles?.full_name || 'Unknown',
  })) || [],
  [users]
)

// 3. Render in edit mode with SearchableSelect
<div>
  <p className="text-sm font-medium text-muted-foreground mb-1">Lead</p>
  {isEditing ? (
    <SearchableSelect
      options={userOptions}
      value={form.watch('lead_id') || ''}
      onValueChange={(value) => form.setValue('lead_id', value || '')}
      placeholder="Select lead..."
      clearable
    />
  ) : set.lead ? (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
        <span className="text-xs font-medium">
          {set.lead.full_name?.split(' ').map(n => n[0]).join('')}
        </span>
      </div>
      <span className="font-medium">{set.lead.full_name}</span>
    </div>
  ) : (
    <p className="text-muted-foreground">—</p>
  )}
</div>
```

### Pattern 4: IBM Carbon Styling
**What:** IBM Design Language aesthetics via CSS custom properties
**When to use:** All pages and cards
**Implementation:**
```css
/* src/index.css - Custom properties */
--carbon-gray-10: #f4f4f4;  /* Page backgrounds */
--carbon-gray-20: #e0e0e0;  /* Borders, dividers */
--carbon-white: #ffffff;    /* Card backgrounds */

.page-carbon {
  background-color: var(--page-background);
  min-height: 100vh;
}

.card-carbon {
  background-color: var(--card-background);
  border-radius: 0.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
```

```tsx
// Usage in pages
<div className="page-carbon p-6 space-y-6">
  <Card className="card-carbon">
    <CardContent className="pt-6">
      {/* Content */}
    </CardContent>
  </Card>
</div>
```

### Pattern 5: Parent Relationship Editing (Searchable Dropdowns)
**What:** Allow editing client_id, project_id via searchable dropdowns in edit mode
**When to use:** Child entities that reference parents (Sets → Client/Project)
**Example from SetDetailPage.tsx:**
```typescript
// Cascade filtering: when client changes, reset project if incompatible
const selectedClientId = useWatch({ control: form.control, name: 'client_id' })

const filteredProjects = useMemo(() => {
  if (!allProjects) return []
  if (!selectedClientId) return allProjects
  return allProjects.filter((p) => p.client_id === selectedClientId)
}, [allProjects, selectedClientId])

// Reset project on client change
onValueChange={(value) => {
  form.setValue('client_id', value || '')
  const currentProject = form.getValues('project_id')
  if (currentProject && value) {
    const projectBelongsToClient = allProjects?.find(
      (p) => p.id === currentProject && p.client_id === value
    )
    if (!projectBelongsToClient) {
      form.setValue('project_id', '')
    }
  }
}}
```

### Anti-Patterns to Avoid
- **Modal/Popup Detail Views:** Phase 2 established full-page views are superior (better UX, more space for complex forms)
- **Non-cascading dropdowns:** When parent changes, child selections MUST be validated/reset
- **Hardcoded user lookups:** Always use `user_profiles.id` not `user_id` for team member references (FK constraints point to user_profiles table)
- **Date format mismatch:** Database stores ISO timestamps, form inputs use YYYY-MM-DD - always split/convert
- **Missing ?edit=true support:** All detail pages should auto-enter edit mode when URL has `?edit=true`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Searchable Dropdowns | Custom autocomplete | `SearchableSelect` component | Already supports search, clearable, descriptions, keyboard nav |
| Date Pickers | Custom calendar UI | Native `<input type="date">` | Browser-native, accessible, mobile-friendly, no extra deps |
| View/Edit Field Toggle | Separate view/edit components | `ViewEditField` component | Prevents layout shift, handles all field types, consistent UX |
| Team Member Avatars | Image loading/fallback logic | Initials in rounded div (existing pattern) | No avatar storage needed, works with names only |
| Form Validation | Manual error checking | React Hook Form + Zod | Type-safe, async validation, field-level errors |
| Query Invalidation | Manual cache updates | TanStack Query invalidateQueries | Automatic refetch, prevents stale data |

**Key insight:** Phase 2 established all reusable patterns. Phase 3 is primarily APPLYING existing patterns to ensure Projects and Sets have feature parity, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Foreign Key Reference Mismatch
**What goes wrong:** Using `user_id` instead of `user_profiles.id` for team member dropdowns causes INSERT failures
**Why it happens:** Database FK constraints like `sets.lead_id → user_profiles(id)` don't match `auth.users(id)`
**How to avoid:**
- Always use `u.user_profiles!.id` when building select options from `useTenantUsers()` data
- Never use `u.user_id` for lead_id, pm_id, secondary_lead_id fields
**Warning signs:** 400 Bad Request errors on save with "foreign key violation" or "column does not exist"

### Pitfall 2: Date Field Initialization Bug
**What goes wrong:** Date inputs show `undefined` or invalid dates in edit mode
**Why it happens:** Database returns ISO timestamps like `2024-01-15T08:00:00.000Z`, but `<input type="date">` expects `YYYY-MM-DD`
**How to avoid:**
```typescript
// CORRECT: Split ISO timestamp before setting form default
defaultValues: {
  expected_start_date: project?.expected_start_date?.split('T')[0] || '',
}

// WRONG: Using raw ISO string
defaultValues: {
  expected_start_date: project?.expected_start_date || '', // Will show invalid date
}
```
**Warning signs:** Date fields appear blank or show strange formats in edit mode despite having data

### Pitfall 3: Missing Query Invalidation After Update
**What goes wrong:** After saving changes, detail page shows stale data or requires manual refresh
**Why it happens:** TanStack Query caches data - updates don't automatically refetch unless invalidated
**How to avoid:**
```typescript
// In mutation onSuccess callback
onSuccess: (_, variables) => {
  queryClient.invalidateQueries({ queryKey: ['projects'] }) // List view
  queryClient.invalidateQueries({ queryKey: ['project', variables.id] }) // Detail view
  // Also invalidate parent queries (e.g., client detail page shows project list)
  if (variables.client_id) {
    queryClient.invalidateQueries({ queryKey: ['client', variables.client_id] })
  }
}
```
**Warning signs:** Need to navigate away and back to see changes, or F5 to refresh

### Pitfall 4: Parent ID Nullification on Update
**What goes wrong:** Saving a Set clears its `client_id` or `project_id` unintentionally
**Why it happens:** UpdateInput includes parent FKs in mutation, but form doesn't track them, so they get set to undefined
**How to avoid:**
- Exclude parent foreign keys from update mutations (they're immutable after creation)
- OR ensure form schema includes them and they're populated in defaultValues
**Prevention from Phase 2 Retrospective:**
```typescript
// In sets.ts update function - protect parent IDs
const cleanUUIDFields = (obj: UpdateSetInput) => {
  // ... clean fields ...
  // DON'T include client_id, project_id in cleanable fields
}
```
**Warning signs:** After edit, breadcrumbs disappear, parent relationship is lost

### Pitfall 5: Incomplete Budget Fields Schema
**What goes wrong:** Adding `budget_days` and `budget_hours` to form but database columns don't exist
**Why it happens:** UI built before schema migration, or migration not applied
**How to avoid:**
- Verify schema has columns BEFORE adding to form
- Check `src/types/database.ts` for type definitions
- Run migration FIRST, then update UI
**Warning signs:** 500 errors mentioning "column does not exist: budget_days"

## Code Examples

Verified patterns from existing implementation:

### Complete Detail Page Boilerplate
```typescript
// Source: SetDetailPage.tsx (simplified)
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ViewEditField } from '@/components/shared/ViewEditField'
import { SearchableSelect } from '@/components/ui/searchable-select'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  expected_start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  lead_id: z.string().optional(),
})

export function EntityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: entity, isLoading } = useEntity(id!)
  const { updateEntity } = useEntityMutations()

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: entity?.name || '',
      expected_start_date: entity?.expected_start_date?.split('T')[0] || '',
      lead_id: entity?.lead_id || '',
    },
  })

  // Reset form when data loads
  useEffect(() => {
    if (entity && !isEditing) {
      form.reset({
        name: entity.name,
        expected_start_date: entity.expected_start_date?.split('T')[0] || '',
        lead_id: entity.lead_id || '',
      })
    }
  }, [entity?.id, isEditing])

  // Auto-enter edit mode from URL
  useEffect(() => {
    if (shouldEditOnLoad && entity && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, entity])

  const handleSave = async (data) => {
    setIsSaving(true)
    try {
      await updateEntity.mutateAsync({ id, ...data })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      <Card className="card-carbon">
        <CardContent className="pt-6">
          {/* Edit/Save buttons */}
          <div className="flex justify-end gap-2 mb-4">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  <X className="mr-2 h-4 w-4" />Cancel
                </Button>
                <Button size="sm" onClick={form.handleSubmit(handleSave)} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />Edit
              </Button>
            )}
          </div>

          {/* Fields */}
          <ViewEditField
            type="text"
            label="Name"
            required
            isEditing={isEditing}
            value={form.watch('name')}
            onChange={(v) => form.setValue('name', v)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

### Team Member Selection Pattern
```typescript
// Source: SetDetailPage.tsx (lines 142-149, 582-607)
const { data: users } = useTenantUsers()

const userOptions = useMemo(() =>
  users?.filter((u) => u.user_profiles?.id).map((u) => ({
    value: u.user_profiles!.id, // CRITICAL: Use user_profiles.id
    label: u.user_profiles?.full_name || 'Unknown',
  })) || [],
  [users]
)

// In Details tab Team section
<div>
  <p className="text-sm font-medium text-muted-foreground mb-1">Lead</p>
  {isEditing ? (
    <SearchableSelect
      options={userOptions}
      value={form.watch('lead_id') || ''}
      onValueChange={(value) => form.setValue('lead_id', value || '')}
      placeholder="Select lead..."
      searchPlaceholder="Search team..."
      emptyMessage="No team members found."
      clearable
    />
  ) : entity.lead ? (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
        <span className="text-xs font-medium">
          {entity.lead.full_name?.split(' ').map(n => n[0]).join('')}
        </span>
      </div>
      <span className="font-medium">{entity.lead.full_name}</span>
    </div>
  ) : (
    <p className="text-muted-foreground">—</p>
  )}
</div>
```

### Cascading Parent Dropdowns
```typescript
// Source: SetDetailPage.tsx (lines 117-125, 450-508)
const selectedClientId = useWatch({ control: form.control, name: 'client_id' })

// Filter projects by selected client
const filteredProjects = useMemo(() => {
  if (!allProjects) return []
  if (!selectedClientId) return allProjects
  return allProjects.filter((p) => p.client_id === selectedClientId)
}, [allProjects, selectedClientId])

// Client dropdown with cascade logic
<SearchableSelect
  options={clientOptions}
  value={form.watch('client_id')}
  onValueChange={(value) => {
    form.setValue('client_id', value || '')
    // Reset project if it doesn't belong to new client
    const currentProject = form.getValues('project_id')
    if (currentProject && value) {
      const projectBelongsToClient = allProjects?.find(
        (p) => p.id === currentProject && p.client_id === value
      )
      if (!projectBelongsToClient) {
        form.setValue('project_id', '')
      }
    }
  }}
  placeholder="Select client..."
/>
```

## State of the Art

| Current Implementation | Status | Notes |
|------------------------|--------|-------|
| ProjectDetailPage | ✓ COMPLETE | Has ViewEditToggle, date fields (4), team dropdowns (lead, secondary_lead, pm) |
| SetDetailPage | ✓ COMPLETE | Has ViewEditToggle, date fields (4), team dropdowns (lead, secondary_lead, pm), parent editing (client/project) |
| RequirementDetailPage | ✓ EXISTS | Full-page view established in Phase 2 |
| ViewEditField Component | ✓ MATURE | Supports 7 field types including searchable select |
| SearchableSelect Component | ✓ MATURE | Has clearable, description, keyboard nav |
| IBM Carbon Styling | ✓ ESTABLISHED | `.page-carbon` and `.card-carbon` utility classes defined |

**What's Missing for Phase 3:**
1. **Sets budget fields:** `budget_days` and `budget_hours` NOT in schema or UI (search found no matches)
2. **Verification:** Need to confirm all existing date fields and team dropdowns actually work (may have been added but not tested)

**Deprecated/outdated:** None - Phase 2 implementations are current

## Open Questions

1. **Budget Fields Schema Status**
   - What we know: Sets table has date fields, team fields, but grep found no `budget_days` or `budget_hours` columns
   - What's unclear: Should these be INTEGER (days) and DECIMAL (hours)? Or both as DECIMAL to allow fractional days?
   - Recommendation: Add migration to create `budget_days INTEGER` and `budget_hours DECIMAL(5,2)` on sets table, then add ViewEditField number inputs to SetDetailPage Details tab

2. **Team Member Display Priority**
   - What we know: Sets have owner_id, lead_id, secondary_lead_id, pm_id fields; owner_id was removed from SetForm in Phase 2.9
   - What's unclear: Should "Assigned To" column in grids show owner OR lead (current logic)?
   - Recommendation: Keep existing pattern - show lead if present, else owner (see SetsPage.tsx grid pattern)

3. **Date Field Validation**
   - What we know: Forms accept optional date strings, no cross-field validation
   - What's unclear: Should we validate expected_end >= expected_start, or actual_end >= actual_start?
   - Recommendation: Add Zod refinement for logical date ordering, but make it non-blocking (warning, not error)

4. **Projects Budget Fields**
   - What we know: Requirements mention budget for Sets, but not Projects
   - What's unclear: Do Projects also need budget_days/budget_hours?
   - Recommendation: Clarify with user - if Projects need budget, add same pattern as Sets

## Sources

### Primary (HIGH confidence)
- `/src/pages/projects/ProjectDetailPage.tsx` - Reference implementation for ViewEditToggle with dates and team members
- `/src/pages/sets/SetDetailPage.tsx` - Reference implementation for parent relationship editing and cascading dropdowns
- `/src/components/shared/ViewEditField.tsx` - Component API and supported field types
- `/src/components/ui/searchable-select.tsx` - SearchableSelect component implementation
- `/src/types/database.ts` - Schema definitions for Project and Set interfaces
- `/src/index.css` - IBM Carbon CSS custom properties and utility classes
- `/tailwind.config.js` - Carbon color tokens in Tailwind theme

### Secondary (MEDIUM confidence)
- `CLAUDE.md` - Project standards, Phase 2 retrospective patterns, user_profiles.id FK guidance
- Phase 2 migrations (014, 017) - Column rename history, date field evolution

### Tertiary (LOW confidence)
- None - all findings verified against actual codebase files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components exist and are actively used
- Architecture: HIGH - Patterns verified in multiple working pages
- Pitfalls: HIGH - Documented from Phase 2 retrospective (actual bugs encountered)
- Budget fields: MEDIUM - Schema status unclear, but implementation pattern is clear

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days - React/UI patterns are stable)

**Critical for Planning:**
- This is NOT a greenfield phase - most infrastructure exists
- Focus planning on VERIFICATION and COMPLETION, not building from scratch
- Budget fields are the primary net-new schema addition needed
- All other requirements appear to be met by existing implementations
