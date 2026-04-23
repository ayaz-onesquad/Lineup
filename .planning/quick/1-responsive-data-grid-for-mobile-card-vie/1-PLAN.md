---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ui/data-table.tsx
  - src/types/table.ts
autonomous: true

must_haves:
  truths:
    - "On screens under 768px, rows render as stacked cards instead of table rows"
    - "Primary field displays as bold header on mobile cards"
    - "Secondary/tertiary fields display as labeled key-value pairs"
    - "Row click handlers work on mobile cards (44px minimum tap target)"
    - "Columns marked hideOnMobile:true do not appear in mobile view"
  artifacts:
    - path: "src/types/table.ts"
      provides: "MobileColumnMeta type definition"
      exports: ["MobileColumnMeta"]
    - path: "src/components/ui/data-table.tsx"
      provides: "Responsive DataTable with card fallback"
      min_lines: 150
  key_links:
    - from: "src/components/ui/data-table.tsx"
      to: "src/hooks/useMediaQuery.ts"
      via: "useMediaQuery import"
      pattern: "useMediaQuery.*768px"
---

<objective>
Add responsive mobile card view to DataTable component

Purpose: Transform data grid into stacked cards on screens under 768px for better mobile UX
Output: Enhanced DataTable that auto-switches between table and card layout based on viewport
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/ui/data-table.tsx
@src/hooks/useMediaQuery.ts
@src/components/portal/PortalSetsTable.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create MobileColumnMeta type definition</name>
  <files>src/types/table.ts</files>
  <action>
Create a new type file for table-related types. Define MobileColumnMeta interface:

```typescript
export interface MobileColumnMeta {
  priority?: 'primary' | 'secondary' | 'tertiary'
  hideOnMobile?: boolean
  mobileLabel?: string  // Override header text for mobile card label
}
```

This extends TanStack Table's column meta pattern. Columns define this in their `meta` property.
  </action>
  <verify>File exists at src/types/table.ts with exported MobileColumnMeta interface</verify>
  <done>MobileColumnMeta type available for column configuration</done>
</task>

<task type="auto">
  <name>Task 2: Implement responsive DataTable with mobile card view</name>
  <files>src/components/ui/data-table.tsx</files>
  <action>
Enhance DataTable component:

1. Import useMediaQuery from '@/hooks/useMediaQuery'
2. Import MobileColumnMeta from '@/types/table'
3. Add `const isMobile = useMediaQuery('(max-width: 768px)')`

4. Create MobileCardView component (internal to file):
   - Iterate over table rows
   - For each row, render a card with:
     - Primary column as bold header (text-lg font-semibold)
     - Secondary/tertiary columns as labeled rows: `<span class="text-muted-foreground">{label}:</span> {value}`
     - Skip columns with hideOnMobile: true
     - Use mobileLabel if provided, otherwise fall back to header string
   - Card styling: rounded-lg border bg-card p-4 shadow-sm
   - Min-height 44px tap target via min-h-[44px] on card
   - Add onClick/onDoubleClick handlers matching table row behavior
   - Show selection state via ring styling if row.getIsSelected()

5. Conditional render:
   ```tsx
   if (isMobile) {
     return <MobileCardView ... />
   }
   return <div className="rounded-md border">...</div>  // existing table
   ```

6. Helper to extract header label:
   ```typescript
   function getColumnLabel(column: Column<TData, unknown>): string {
     const meta = column.columnDef.meta as MobileColumnMeta | undefined
     if (meta?.mobileLabel) return meta.mobileLabel
     const header = column.columnDef.header
     if (typeof header === 'string') return header
     return column.id
   }
   ```

7. Mobile card layout structure:
   ```tsx
   <div className="space-y-3">
     {table.getRowModel().rows.map((row) => (
       <div
         key={row.id}
         className={cn(
           "rounded-lg border bg-card p-4 shadow-sm min-h-[44px]",
           (onRowClick || onRowDoubleClick) && "cursor-pointer active:bg-muted/50",
           row.getIsSelected() && "ring-2 ring-primary"
         )}
         onClick={() => onRowClick?.(row.original)}
         onDoubleClick={() => onRowDoubleClick?.(row.original)}
       >
         {/* Primary field as header */}
         {/* Secondary/tertiary as key-value pairs */}
       </div>
     ))}
   </div>
   ```

8. Empty state for mobile: Show "No results." centered in div matching desktop behavior
  </action>
  <verify>
Run `npm run build` - should compile without errors.
Manually verify in browser: resize to < 768px and confirm cards appear instead of table.
  </verify>
  <done>
DataTable renders as cards on mobile (< 768px) with:
- Primary field as bold header
- Secondary/tertiary as labeled key-value pairs
- Click handlers preserved
- 44px minimum tap targets
- hideOnMobile columns excluded
  </done>
</task>

<task type="auto">
  <name>Task 3: Add example column meta to PortalSetsTable for verification</name>
  <files>src/components/portal/PortalSetsTable.tsx</files>
  <action>
Update columns array to demonstrate mobile meta usage:

```typescript
const columns: ColumnDef<Set>[] = [
  {
    accessorKey: 'display_id',
    header: 'ID',
    meta: { priority: 'tertiary', mobileLabel: 'Set ID' },
    // ... existing cell
  },
  {
    accessorKey: 'name',
    header: 'Name',
    meta: { priority: 'primary' },  // Will be card header
    // ... existing cell
  },
  {
    accessorKey: 'status',
    header: 'Status',
    meta: { priority: 'secondary' },
    // ... existing cell
  },
  {
    accessorKey: 'expected_end_date',
    header: 'Expected Completion',
    meta: { priority: 'secondary', mobileLabel: 'Due' },
    // ... existing cell
  },
  {
    id: 'progress',
    header: 'Progress',
    meta: { priority: 'secondary' },
    // ... existing cell
  },
]
```

This serves as a working example for other tables to follow.
  </action>
  <verify>
Run `npm run build` - no TypeScript errors.
Open /portal in browser, resize to mobile, verify PortalSetsTable shows cards.
  </verify>
  <done>PortalSetsTable demonstrates mobile-responsive column configuration</done>
</task>

</tasks>

<verification>
1. `npm run build` passes without errors
2. On desktop (> 768px): DataTable renders as standard table
3. On mobile (< 768px): DataTable renders as stacked cards
4. Card primary field appears as bold header
5. Card secondary/tertiary fields appear as labeled key-value pairs
6. Clicking cards triggers onRowClick handler
7. Cards have minimum 44px tap target height
</verification>

<success_criteria>
- DataTable automatically switches to card view on screens under 768px
- Primary/secondary/tertiary column priority controls mobile display
- hideOnMobile columns are excluded from card view
- mobileLabel overrides default header text
- All existing DataTable functionality preserved on desktop
- PortalSetsTable serves as working example
</success_criteria>

<output>
After completion, create `.planning/quick/1-responsive-data-grid-for-mobile-card-vie/1-SUMMARY.md`
</output>
