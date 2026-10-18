# LineUp Design System

Authoritative rules for layout, data display and responsive behaviour.

This is not a style guide to browse. It is the contract every screen must meet.
When you add or change a page, the checklist in section 8 is the definition of
done. Where this document and an existing screen disagree, the screen is wrong.

`CLAUDE.md` holds the product rules: the six-level hierarchy, the One-Page
View/Edit pattern, the priority scale, the security laws. This document holds
the presentation rules. Neither overrides the other; they cover different ground.

---

## 1. Why this exists

An audit of the codebase in October 2026 found:

| Measure | Before |
|---|---|
| Table render sites | 56 |
| …with working column sorting | 3 |
| …with any mobile handling | 2 |
| Densest grid | 16 columns, no horizontal scroll container |
| Duplicated child-tab table | copy-pasted 9+ times |

The result on a 390px phone was columns overlapping, unreadable rows and no way
to sort anything. The fix is not 56 individual repairs. It is one primitive that
is correct by construction, and a rule that says to use it.

---

## 2. Foundations

### 2.1 Breakpoints

Tailwind defaults. Do not add custom breakpoints.

| Token | Min width | Target device | Layout intent |
|---|---|---|---|
| *(none)* | 0 | Phone portrait | Single column. Cards, not tables |
| `sm` | 640px | Phone landscape, small tablet | Two-up metadata, still cards |
| `md` | 768px | Tablet portrait | **Tables appear here.** Sidebar still collapsed |
| `lg` | 1024px | Tablet landscape, laptop | Sidebar expands. Full column set |
| `xl` | 1280px | Desktop | Optional extra columns |
| `2xl` | 1536px | Wide desktop | Max content width applies |

**`md` (768px) is the single structural breakpoint.** A data view is cards below
it and a table at or above it. Do not introduce a second switch point for the
same decision; a reader resizing a window should cross one boundary, not three.

Design and test at exactly **390 × 844** (iPhone 14/15 logical size). If it
works there it works on everything narrower in practice.

### 2.2 Page layout and gutters

| Context | Padding | Class |
|---|---|---|
| Page shell, phone | 16px | `px-4` |
| Page shell, `sm`+ | 24px | `sm:px-6` |
| Page shell, `lg`+ | 32px | `lg:px-8` |
| Vertical page rhythm | 24px | `py-4 sm:py-6` + `space-y-6` |
| Card interior | 16px phone, 24px `sm`+ | `p-4 sm:p-6` |

These gutters are applied **once**, by `MainLayout`, so every page inherits
them. `PageShell` adds the title/action header and the content-width cap on top
and deliberately does **not** re-pad. Do not add page-level `p-*` yourself; that
is double padding.

The old `page-carbon p-6` pattern is deprecated. It adds a second 24px gutter on
top of the layout's, and `page-carbon` has no dark-mode definition, so it pins
the page to light colours.

**Every page must be free of horizontal scroll at 390px.** The only element
permitted to scroll horizontally is a table's own scroll container.

### 2.3 Typography

| Role | Phone | `sm`+ | Class |
|---|---|---|---|
| Page title | 24px | 30px | `text-2xl sm:text-3xl font-bold tracking-tight` |
| Page subtitle | 14px | 14px | `text-sm text-muted-foreground` |
| Section heading | 16px | 18px | `text-base sm:text-lg font-semibold` |
| Card title | 16px | 16px | `text-base font-semibold` |
| Body | 14px | 14px | `text-sm` |
| Table cell | 14px | 14px | `text-sm` |
| Table header | 12px | 12px | `text-xs font-medium uppercase tracking-wide` |
| Metadata, captions | 12px | 12px | `text-xs text-muted-foreground` |
| Numeric / ID / code | 12px | 12px | `font-mono text-xs` |

Never go below `text-xs` (12px). Never shrink text to make a table fit; hide a
column instead.

### 2.4 Touch targets

Per Apple HIG (44pt) and Material (48dp), and the WCAG 2.2 target-size rule:

| Element | Minimum | Notes |
|---|---|---|
| Primary button, form control | 48 × 48px | `min-h-12` |
| Row action, icon button, tab | 44 × 44px | `min-h-11 min-w-11` |
| Table row (mobile card) | 44px tall | enforced by the card primitive |
| Dense desktop grid control | 24 × 24px | desktop pointer only, with 24px clear space |
| Gap between adjacent targets | 8px | `gap-2` |

A 32px icon button is acceptable on desktop only. On touch it needs a 44px hit
area, which may be larger than its visual box via padding.

### 2.5 Colour and semantics

Use the existing CSS-variable tokens (`background`, `foreground`, `card`,
`muted`, `border`, `primary`, `destructive`) plus `success`, `warning`, `danger`.
Both themes are defined in `src/index.css`; anything you add must be defined for
light **and** dark.

**Gotcha, previously a live bug:** the `.dark` token block must stay **outside**
`@layer base`. Tailwind tree-shakes class selectors it cannot find in the
content files, and the bare class `dark` never appears in the source — only the
`dark:` variant prefix, which is tokenised differently. Inside the layer the
whole block was dropped from every build, so the `dark:` utilities compiled
while the custom properties they depend on did not. After touching theme
tokens, confirm the built CSS contains `--muted-foreground: 215 20.2% 65.1%`.

Status colours are HSL triplets, not hex, so Tailwind's `/opacity` modifier
works (`bg-warning/10`).

Never encode meaning in colour alone. A status is a `Badge` with a word in it.
The colour is reinforcement for sighted users scanning quickly, not the message.

### 2.6 Density

Three densities, set once per view, never mixed within one table:

| Density | Row height | Use for |
|---|---|---|
| `comfortable` | 56px | Default. Overview pages |
| `compact` | 44px | Dense operational grids (Requirements, Financials) |
| `spacious` | 64px | Rows with an avatar plus two lines of text |

---

## 3. Choosing a data view

Work down this list and stop at the first match.

| If the data… | Use | Component |
|---|---|---|
| is tabular, comparable across rows, and may be sorted | Responsive table | `DataGrid` |
| is tabular **and** editable in place | Editable grid | `GridEditTable` |
| is a short list (under ~8) of heterogeneous things | Card list | `Card` + `space-y-3` |
| is a hierarchy the user expands | Accordion tree | `Accordion` |
| is one record's fields | Field grid | `ViewEditField` in `grid gap-5 md:grid-cols-2` |
| is a visual asset (document, image) | Thumbnail grid | `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` |

**Do not hand-roll a `<Table>`.** Importing `@/components/ui/table` directly in
a page is a defect. `ui/table` exists only as the renderer that `DataGrid` and
`GridEditTable` build on.

---

## 4. The table system

### 4.1 Column priority: the core model

Every column declares a priority. Priority drives both what survives on mobile
and the order fields appear in a card.

| Priority | Meaning | Mobile card position | Desktop |
|---|---|---|---|
| `primary` | The one thing that identifies the row | Card title. **Exactly one per table** | Always visible |
| `secondary` | The 2–4 facts needed to triage without opening the record | Labelled rows, always shown | Always visible |
| `tertiary` | Useful when comparing rows | Behind "More details" | Visible from `md` |
| `hideOnMobile: true` | Desktop-only noise (internal IDs, audit timestamps) | Never rendered | Visible from `lg` |

Rules:

- Exactly one `primary` column. The grid warns in development if there are zero
  or more than one.
- At most **four** `secondary` columns. If you want a fifth, something else is
  not actually secondary.
- A row-action menu column is `hideOnMobile`; on mobile the whole card is the
  tap target and actions live in the quick-view panel.
- Aim for **5–7 visible columns** on first paint at `lg`. Everything beyond that
  is `tertiary` or user-enabled.

### 4.2 Sorting is mandatory

**Every column displaying a scalar value must be sortable.** Not optional, not
"on the important ones". An overview page where the user cannot reorder by date
or status is the defect this design system exists to prevent.

- Sort indicator is always present: a muted up/down chevron pair when unsorted,
  a solid single chevron when active.
- The header is a real `<button>` with `aria-sort` on the `<th>`.
- Three states cycle: ascending → descending → unsorted.
- Sorting persists per view in `localStorage`, keyed by the grid's `storageKey`.
- On mobile the table is gone, so sorting moves to a **sort sheet**: a single
  control in the toolbar listing the sortable columns. `DataGrid` renders this
  automatically.
- Columns that render a composite or purely decorative cell (avatar, action
  menu, checkbox) opt out with `sortable: false`.
- Nulls sort last in both directions. A record with no due date is not "oldest".

### 4.3 Alignment

| Content | Alignment | Why |
|---|---|---|
| Text, names, descriptions | Left | Reading order |
| Numbers, currency, counts | **Right**, tabular figures | Digits line up by place value |
| Dates | Left | Read as text, scanned as a column |
| Status, badges | Left | They are labels |
| Actions | Right | Edge of the row, out of the scan path |
| Booleans, icons | Center | Symmetric glyph |

Numeric columns use `text-right font-mono tabular-nums`. The header aligns with
the body: a right-aligned column has a right-aligned header.

### 4.4 Overflow and truncation

- The table lives in a horizontal scroll container with an **inset shadow on the
  scrollable edge**, so it is visibly scrollable rather than silently clipped.
- The first column may be made sticky (`stickyFirstColumn`) so identity stays
  visible while scrolling wide data.
- A **sticky header requires `maxBodyHeight`**. `position: sticky` resolves
  against the nearest scrolling ancestor, so with no vertical scroll container
  the header has nothing to stick to and just scrolls away. Set
  `maxBodyHeight` (e.g. `"60vh"`) on long dense grids; leave it off for short
  lists, where capping the height is worse than letting the page scroll.
- Long text truncates to a single line with an ellipsis and exposes the full
  value in a tooltip. Use `TruncatedCell`.
- Give every column an explicit `width` or `minWidth`. Columns without one are
  what cause the overlapping-column defect: the browser is free to collapse them
  below legibility.
- Never wrap a cell to three or more lines. Truncate, or move the field into the
  detail page.

### 4.5 Row interaction

Consistent with `CLAUDE.md`:

| Input | Action |
|---|---|
| Single click (desktop) | Open the quick-view panel |
| Double click (desktop) | Navigate to the detail page |
| `Enter` on a focused row | Navigate to the detail page |
| Single tap (mobile card) | Navigate to the detail page |
| Long press (mobile) | Nothing. Do not hide features behind it |

Double-click does not exist on touch, so mobile collapses to the single most
useful action: open the record. Row actions on mobile belong in the detail page,
not in a cramped dropdown.

**One exception.** Where an action *is* the point of the list — copying a
credential from the password manager, say — pin it to the card with
`DataGrid`'s `mobileCardActions`. Keep it to two controls. This is not a licence
to reproduce the desktop action menu on a card.

### 4.6 States

Every grid handles four states, and `DataGrid` requires them:

- **Loading** — skeleton rows matching the real column count and widths. Never a
  centred spinner; it causes a layout jump.
- **Empty, no filters** — icon, one-line explanation, and the primary create
  action.
- **Empty, filters active** — different copy ("No records match these filters")
  and a Clear filters button. Never show a create button here; the records may
  exist.
- **Error** — the message, and a Retry button.

### 4.7 Selection and bulk actions

Checkbox column is first, `sortable: false`, 44px wide. When anything is
selected, a `BulkActionBar` docks to the bottom of the viewport, above the
mobile safe-area inset. Selection survives sorting; it does not survive
filtering.

### 4.8 Escape hatches

Two props exist so a page can express state the grid does not own, without
forking the primitive:

- `rowClassName(row)` — per-row classes. Use for the row open in the quick-view
  panel, a row with unsaved edits, an overdue record.
- `mobileCardActions(row)` — see 4.5.

If you find yourself wanting a third, add it to `DataGrid` and document it here.
Do not copy the component.

### 4.9 Column visibility

Grids with more than eight columns get a column manager: a dropdown listing
toggles, persisted to `localStorage` under `storageKey`. The `primary` column
cannot be hidden. The manager is desktop-only; mobile already reduces to the
card view.

---

## 5. Mobile patterns

### 5.1 The responsive table contract

Below `md`, a table becomes a list of cards. This is not a fallback, it is the
mobile design. It is implemented once, in `DataGrid`, so no page re-implements
it.

Card anatomy, top to bottom:

```
┌──────────────────────────────────────────┐
│ ‹primary value›                    ‹ID›  │  title row, 16px semibold
│ ‹status badge› ‹type badge›              │  badge row, if any
│                                          │
│ Owner      Jane Smith                    │  secondary rows, label + value
│ Due        14 Nov 2026                   │  label is 96px, muted
│ Priority   High                          │
│                                          │
│ ⌄ More details                           │  present only if tertiary exist
└──────────────────────────────────────────┘
```

Rules:

- Minimum 44px tall, 12px gap between cards, full bleed to the page gutter.
- The whole card is one tap target that opens the record.
- Labels are fixed-width and muted so values form a scannable column.
- `tertiary` fields are collapsed by default behind one disclosure. Never render
  sixteen key-value rows; that is the wall of text this replaces.
- A card never scrolls horizontally.

### 5.2 Progressive disclosure

Mobile shows less, not smaller. In order of preference: hide the field, collapse
it behind a disclosure, move it to the detail page. Shrinking type or squeezing
columns is not an option.

### 5.3 Navigation

- Sidebar is a `Sheet` below `lg`, triggered from a 44px header button, and
  closes on navigation.
- The header is sticky. Nothing else is, so vertical space is preserved.
- Primary page action (the "New …" button) is full width below `sm`, inline from
  `sm`.
- Respect the safe area: any bottom-docked element adds
  `pb-[env(safe-area-inset-bottom)]`.
- Keep destructive actions out of the thumb zone at the bottom right.

### 5.4 Filters and toolbars

The toolbar is a wrapping flex row, never a fixed grid. Below `md`:

- Search stays visible and full width.
- Every other filter collapses into one **Filters** button showing an active
  count, opening a bottom `Sheet`.
- Sort gets its own button next to it, as described in 4.2.

Use `GridFilterSelect` for a single-value filter and `GridFilterMultiSelect`
where the underlying filter accepts an array. Dropping a multi-value filter into
the single-value control silently narrows it, which looks like a bug in the
filter rather than in the control.

### 5.5 Dialogs and forms

- A `Dialog` below `sm` renders as a bottom `Sheet` with `max-h-[90vh]` and its
  own scroll. A centred modal on a phone clips its own action buttons.
- Form grids are `grid-cols-1` then `sm:grid-cols-2`. A bare `grid-cols-2` is a
  defect: it produces 150px-wide inputs on a phone.
- Inputs are `min-h-12` on touch. Use the right `inputMode` and `autoComplete`
  so the correct keyboard appears.
- Sticky footer for Save/Cancel on long forms, so the action is always reachable.

---

## 6. Component reference

### Use these

| Component | Path | For |
|---|---|---|
| `PageShell` | `src/components/layouts/PageShell.tsx` | Page title, actions, overflow guard, width cap |
| `PageSection` | same file | A titled section with consistent rhythm |
| `DataGrid` | `src/components/ui/data-grid.tsx` | Every read-only tabular view |
| `GridToolbar` | `src/components/shared/GridToolbar.tsx` | Search + filters, collapsing to a sheet below `md` |
| `GridSearch` | same file | The search input |
| `GridFilterSelect` | same file | Single-value filter |
| `GridFilterMultiSelect` | same file | Multi-value filter |
| `GridEditTable` | `src/components/shared/GridEditTable/` | Inline-editable grids |
| `TruncatedCell` | `src/components/shared/TruncatedCell.tsx` | Any cell that can overflow |
| `BulkActionBar` | `src/components/shared/BulkActionBar.tsx` | Multi-select actions |
| `ViewEditField` | `src/components/shared/ViewEditField.tsx` | Detail-page fields |
| `SearchableSelect` | `src/components/ui/searchable-select.tsx` | Every dropdown. Never a native `<select>` |
| `useMediaQuery` | `src/hooks/useMediaQuery.ts` | Only when CSS cannot express it |

### Do not use

| Thing | Instead |
|---|---|
| `@/components/ui/table` in a page | `DataGrid` |
| `DataTable` | `DataGrid`. `DataTable` is a deprecated shim kept for the two portal tables |
| `page-carbon p-6` | `PageShell` |
| `useMediaQuery` for layout | Tailwind responsive prefixes. Media queries are for behaviour, not layout |
| A native `<select>` | `SearchableSelect` |
| `grid-cols-2` with no prefix | `grid-cols-1 sm:grid-cols-2` |

### Prefer CSS over JavaScript

`useMediaQuery` causes a render pass and can flash the wrong layout on first
paint. Use it only where the two branches render genuinely different component
trees, as `DataGrid` does for table-versus-cards. For everything else, Tailwind
prefixes are correct and free.

---

## 7. Accessibility floor

Not aspirational; these are required.

- Sortable headers are `<button>` elements inside `<th>`, with `aria-sort`.
- Interactive rows are focusable (`tabIndex={0}`) and respond to `Enter`.
- Every icon-only button has an `aria-label`.
- Mobile cards are `<article>` with an accessible name from the primary field.
- Contrast: 4.5:1 for body text, 3:1 for large text and UI boundaries, in both
  themes.
- Visible focus ring on every interactive element. Never `outline: none` without
  a replacement.
- Loading regions use `aria-busy`. Toast and empty-state updates are announced.

---

## 8. Checklist for any new or changed view

Copy this into the pull request.

**Layout**

- [ ] Wrapped in `PageShell`; no hand-rolled page padding
- [ ] No horizontal page scroll at 390px
- [ ] Every multi-column grid has a responsive prefix
- [ ] Toolbar wraps; filters collapse to a sheet below `md`

**Table**

- [ ] Uses `DataGrid` or `GridEditTable`, not `ui/table`
- [ ] Exactly one `primary` column; at most four `secondary`
- [ ] Every scalar column is sortable
- [ ] Numbers right-aligned with `tabular-nums`
- [ ] Every column has a `width` or `minWidth`
- [ ] Overflowing cells use `TruncatedCell`
- [ ] Loading, empty-no-filter, empty-filtered and error states all handled

**Mobile**

- [ ] Verified at 390 × 844
- [ ] Card view readable without horizontal scroll
- [ ] Tap targets 44px or larger, 8px apart
- [ ] Sorting reachable from the sort sheet
- [ ] Bottom-docked elements respect the safe-area inset

**Accessibility**

- [ ] Keyboard reachable end to end
- [ ] `aria-sort` on sorted headers, `aria-label` on icon buttons
- [ ] Focus visible throughout
- [ ] Contrast checked in light and dark

---

---

## 9. Contextual creation: the parent chain

When a record is created from inside a parent — a Requirement from a Set's
Requirements tab, a Pitch from a Set, a Phase from a Project — every ancestor
is already determined. The user must not have to re-pick them, and the form
must not quietly discard them.

This was a live bug: a Requirement created from a Set arrived with no set. The
id was passed correctly and held in form state, but an async cascade reset
cleared it before submit, and the select rendered blank because the value was
not yet in its option list.

### 9.1 The three rules

1. **The caller passes the one id it knows.** A Set detail page passes
   `set_id`. It does not assemble the whole chain by hand; that duplicates
   knowledge of the hierarchy across every page.

2. **Ancestors are derived, not retyped.** `set_id` determines the phase,
   project and client. `useParentContext` resolves the chain from whatever was
   supplied.

3. **Supplied and derived fields are locked.** A locked field renders
   read-only and is *never* cleared by a cascade reset. Both halves matter: the
   read-only control is the visible contract, and the reset guard is what
   actually prevents data loss.

**A locked field is not necessarily a stored field.** Locking governs the form;
the payload is governed by the entity's schema. A requirement created from a
Set locks the project and phase selects so the user sees where they are, but
only `set_id`, `pitch_id` and `client_id` are written, because the requirements
table has no project or phase column. Keep the two concerns separate.

### 9.2 How to implement it

Use the shared pieces. Do not hand-roll per-form effects; that is what
produced the race.

```tsx
import { useParentContext } from '@/hooks/useParentContext'
import { isParentLocked, withLockedOption } from '@/lib/parentContext'

const { values: parentValues, locked: lockedParents } = useParentContext(defaultValues)

// Apply the resolved chain in ONE effect, not one per ancestor.
useEffect(() => {
  for (const field of ['client_id', 'project_id', 'phase_id', 'set_id'] as const) {
    const value = parentValues[field]
    if (value && form.getValues(field) !== value) {
      form.setValue(field, value, { shouldDirty: false })
    }
  }
}, [parentValues, form])

// Guard EVERY cascade reset.
if (currentSet && !isParentLocked('set_id', lockedParents)) {
  // ...only now may it be cleared
}

// Keep the control truthful while its option list loads.
<SearchableSelect
  options={withLockedOption(setOptions, lockedParents.has('set_id') ? field.value : undefined, 'Selected set')}
  value={field.value}
  disabled={lockedParents.has('set_id')}
/>
```

### 9.3 Why the option injection is needed

`SearchableSelect` renders its label by looking the value up in `options`.
Cascading option lists arrive asynchronously, so a pre-filled parent displays
as blank until its list loads. To the user that reads as "not linked" even when
the form state is correct, which is how this bug was reported.
`withLockedOption` injects a placeholder so the control never lies.

### 9.4 Checklist for a create form

- [ ] Parent ids come from `useParentContext`, not from ad-hoc `defaultValues` effects
- [ ] One effect applies the chain, not one per ancestor
- [ ] Every cascade reset is wrapped in `isParentLocked`
- [ ] Locked selects are `disabled` and pass through `withLockedOption`
- [ ] Locked parents carry a `FormDescription` saying where the value came from
- [ ] Every parent column **the table actually stores** is in the submit
      payload — and nothing that it does not. These differ per entity: a
      requirement stores `set_id`, `pitch_id` and `client_id`, but has **no**
      `phase_id` column (its phase is derived through its set). So `project_id`
      and `phase_id` are cascade filter fields on that form and must be
      destructured out. Check the entity's `Create…Input` type before adding a
      field to a payload; sending a column that does not exist fails the insert

### 9.5 Where the hierarchy lives

`src/lib/parentContext.ts` holds the one ordered definition of the six levels
and their foreign-key columns. Anything that needs to walk the hierarchy reads
it from there rather than hard-coding the order again.

## 10. Migration status

`DataGrid` and `PageShell` are adopted incrementally. Converting a page is
mechanical: describe the columns, delete the markup.

Any **new** page uses the new primitives. No exceptions; that is what makes the
remaining list shrink rather than grow.

See `docs/DESIGN-SYSTEM-MIGRATION.md` for the live per-page status.
