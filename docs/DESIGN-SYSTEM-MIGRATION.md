# Design System Migration Status

Live tracker for adopting `DataGrid` and `PageShell`. See `docs/DESIGN-SYSTEM.md`
for the rules themselves.

**Any new page uses the new primitives. No exceptions** — that is what makes
the remaining list shrink rather than grow.

Last updated: 12 October 2026.

---

## Where things stand

| | Count |
|---|---|
| Overview pages on `DataGrid` | 11 |
| Dense grids on `GridEditTable` (now sortable + mobile cards) | 4 |
| Shared components on `DataGrid` | 2 |
| Files still importing `@/components/ui/table` directly | 21 |

Sorting went from 3 of 56 table sites to every column of every migrated grid.
Mobile handling went from 2 of 56 to all of them.

---

## Done

### Overview pages — `PageShell` + `DataGrid`

| Page | Columns | Notes |
|---|---|---|
| Clients | 7 | Multi-select status filter, bulk selection with select-all |
| Contacts | 7 | |
| Projects | 9 | List/card toggle kept, sticky first column |
| Leads | 8 | **Row navigation added** — there was none before |
| Passwords | 10 | Reveal-on-demand preserved; copy action pinned to the mobile card |
| Competitors | 7 | Threat level sorts by rank, not alphabetically |
| Notes | 6 | |
| Documents | 7 | |
| Discussions | 6 | |
| Financials | 11 | `density="compact"`, sticky first column, `constrainWidth={false}` |
| Company Documents | 10 | The reference implementation — copy this one |

### Dense editable grids — `GridEditTable`

Sorting and the mobile card view were added to the shared component, so these
four were fixed by assigning column priorities rather than by rewriting them.
Below `md` they delegate to `DataGrid`; grid-edit mode stays desktop-only
because inline date and select editing is not usable at 390px.

| Page | Columns |
|---|---|
| Requirements | 16 |
| Sets | 12 |
| Phases | 11 |
| Pitches | 10 |

### Shared components

| Component | Reach |
|---|---|
| `DocumentsTable` | The Documents tab on 7 detail pages, fixed in one file |
| `GridEditTable` | The 4 pages above |

### Foundations

- Responsive gutters applied once in `MainLayout`; `page-carbon p-6` removed from 26 files.
- `min-w-0` + `overflow-x-clip` on the main content area — the root cause of page-wide horizontal scroll.
- 65 unprefixed `grid-cols-*` made responsive across forms and detail pages.
- Touch targets via a `coarse:` Tailwind variant, so sizes grow on touch input rather than by viewport width.
- `Dialog` renders as a bottom sheet below `sm`, with `max-h` and its own scroll.
- `TabsList` scrolls horizontally — a detail page with 22 tabs was unreachable past the first few.
- Bottom-docked bars wrap and respect `env(safe-area-inset-bottom)`.
- `success` / `warning` / `danger` are now CSS variables with dark-mode values; they were hard-coded hexes that failed contrast in dark mode.
- **Dark mode base tokens now actually ship.** The `.dark` block sat inside `@layer base`, where Tailwind tree-shook it out of every build, so the `dark:` utilities across the app compiled while the custom properties they reference did not. Moved outside the layer and verified in the production CSS.
- Admin layout rail hidden below `md`; it was not collapsible to zero and made the admin area unusable on a phone.
- `viewport-fit=cover` added, so `env(safe-area-inset-*)` resolves to real values.

---

## Remaining

Ordered by user impact. None of these is blocking; all are mechanical.

### 1. Child-tab grids on detail pages — the biggest remaining win

The same 7–8 column grid ("Order / Name / Priority / Status / Lead / Key Start
/ Key End / menu") is copy-pasted across these files, each with a duplicate
skeleton copy:

- `src/pages/clients/ClientDetailPage.tsx` — contacts, projects, phases, sets, pitches, competitors
- `src/pages/projects/ProjectDetailPage.tsx` — sets, requirements, pitches
- `src/pages/sets/SetDetailPage.tsx` — pitches
- `src/pages/phases/PhaseDetailPage.tsx` — sets
- `src/pages/contacts/ContactDetailPage.tsx` — clients
- `src/pages/leads/LeadDetailPage.tsx` — contacts
- `src/components/shared/RequirementsTabbedPanel.tsx` — open + completed

**Recommended approach:** build one `ChildEntityGrid` component wrapping
`DataGrid` with the shared column set, then replace roughly 18 `<Table>` blocks
with it. Do not migrate these one at a time; the duplication is the problem.

### 2. Admin and settings tables

Lower traffic, but they are the tables an OrgAdmin uses:

- `src/pages/admin/AdminDashboardPage.tsx`
- `src/pages/admin/AdminTenantDetailPage.tsx` (3 tables)
- `src/pages/admin/SupportDashboardPage.tsx`
- `src/pages/admin/AdminNotificationsPage.tsx` (has manual sorting; replace it)
- `src/pages/admin/AdminNotificationLogPage.tsx`
- `src/pages/settings/TeamPage.tsx`
- `src/pages/settings/DocumentCatalogPage.tsx`
- `src/pages/settings/NotificationsSettingsPage.tsx` (3 tables)
- `src/pages/tickets/MyTicketsPage.tsx`
- `src/pages/lead-generator/LeadGeneratorPage.tsx`

### 3. Detail-page sub-tables

- `src/pages/company-documents/CompanyDocumentDetailPage.tsx` — versions, access log, acknowledgements
- `src/pages/financials/FinancialEntryDetailPage.tsx` — payment schedule
- `src/components/dashboard/AssignedByMeWidget.tsx`
- `src/pages/dashboard/DashboardPage.tsx`

### 4. Client portal

`PortalRequirementsTable` and `PortalSetsTable` still use the deprecated
`DataTable`. They work and are responsive, so this is cleanup rather than a fix.

### 5. Known behaviour changes to review with the team

- **Projects and Clients `MobileActionBar`.** A tap on a mobile card now
  navigates, per the design system, so the action bar rarely surfaces. The
  component is still wired. Decide whether to keep it or delete it.
- **`BulkUpload/DataPreviewTable`** uses raw `<table>` elements and is
  intentionally horizontally scrollable, since it previews arbitrary spreadsheet
  columns. Leave as is.
- **`src/index.css`** still defines `.page-carbon` and `.card-carbon`. No page
  uses `page-carbon` any more. Remove both once `card-carbon` is gone too.

---

## How to migrate a page

1. Read `src/pages/company-documents/CompanyDocumentsPage.tsx`. It is the
   worked reference.
2. Define `DataGridColumn<T>[]` in a `useMemo`. One `primary`, at most four
   `secondary`, `hideOnMobile` on internal IDs, an `accessor` on everything
   scalar, a `width` or `minWidth` on everything.
3. Wrap the page in `PageShell`. Do not add padding.
4. Move search and filters into `GridToolbar`.
5. Move row action menus into the `rowActions` prop.
6. Delete the `@/components/ui/table` import and the hand-rolled skeleton and
   empty-state markup — `DataGrid` owns those states.
7. Run `npx tsc --noEmit -p tsconfig.app.json` and `npx eslint <file>`.
8. Check it at 390 × 844.
9. Put the section 8 checklist in the pull request.
