🚀 Vision & Core Hierarchy
LineUp is a multi-tenant agency command center using the CORE methodology (Capture, Organize, Review, Execute).

🏛 The 6-Level Data Structure
Strictly enforce this parent-child hierarchy. orphans are not allowed.

Client (Root)

Project (Container)

Phase (Time-bound segment)

Set (Functional Grouping)

Pitch (Optional Concept/Campaign Layer)

Requirement (Actionable Item/Task)

🎨 UI/UX & Component Standards (Strict Enforcement)
1. The "One-Page" View/Edit Pattern
Every entity (Client, Project, Phase, etc.) must use a Single Detail Page that handles both viewing and editing.

Default State: View Mode (Read-only text, badges, status indicators).

Action: "Edit" button (Top Right) toggles mode.

Edit Mode: Fields transform into inputs.

Component: Use ViewEditField for inline editing to prevent layout shifts.

2. Form Input Standards
Dropdowns: ALL dropdowns MUST use the SearchableSelect component. Never use a native <select>.

Rich Text: All description, notes, or long-form text fields MUST use the Rich Text Editor (Tiptap/Quill).

Passwords: All password inputs MUST include a Lucide 'Eye' icon toggle and strip whitespace/newlines (.trim()) to prevent copy-paste errors.

Validation: Use Zod + React Hook Form. Mark required fields with a red asterisk (*).

3. Navigation & Routing Patterns
Breadcrumbs: EVERY Detail Page must have a breadcrumb header: Client > Project > Phase > Set.

Grid vs. Card:

Overview Pages: Must use Data Grids (Tables) for density.

Child Tabs: Must use Data Grids.

Interaction:

Single Click: Opens Quick-View sidebar.

Double Click: Navigates to the full Detail Page (Router Push).

Contextual Creation:

When creating a child (e.g., Phase) from a parent (Project), the project_id must be auto-populated and locked/hidden.

Use URL params to pass context: /phases/new?projectId=123.

📊 Dashboard & Priority Logic
1. The "Command Center" Dashboard
KPI Drill-Down: All KPI Cards are interactive. Clicking a card (e.g., "Past Due") opens a Modal/Slide-over listing the specific records.

My Work Tree: Use a 3-tier expandable accordion:

Set (Parent) -> Pitch (Child) -> Requirement (Grandchild).

Logic: If a Set has Requirements but no Pitch, show an "Independent Items" placeholder to maintain indentation.

2. The 6-Level Priority Scale (Eisenhower)
DO NOT use "Routine" or generic labels. Use this strict 1-6 mapping for all entities:

Critical (Do First / Crisis)

High (Do First / Urgent)

Medium-High (Schedule)

Medium (Plan)

Medium-Low (Delegate)

Low (Eliminate)

🔐 Security & Architecture Laws
1. Multi-Tenancy (The "Golden Rule")
Database: Every table (except users) MUST have a tenant_id column.

RLS: Every Supabase Policy must check auth.jwt() ->> 'tenant_id'.

Isolation: No user can see data outside their tenant unless they are a SysAdmin.

2. Roles & Permissions
SysAdmin: Global Superuser. Can access Support Dashboard and Tenant Management.

Bypass: Use is_sys_admin() function for logic checks.

OrgAdmin: Tenant Owner. Manages Team and Billing.

OrgUser: Standard Employee.

ClientUser: Portal Access (Restricted to specific client_id).

3. Support Ticket System (Global Feature)
UI: Persistent "Submit Ticket" button in the Top-Right Header.

Magic Context: Automatically capture:

Current URL (window.location.href)

Tenant ID

User ID

Visibility:

User -> Sees own tickets.

OrgAdmin -> Sees all Tenant tickets.

SysAdmin -> Sees ALL tickets globally via Admin Portal.

🛠 Engineering Best Practices
1. Database & Schema
IDs: Every table needs a UUID id (PK) and an Integer display_id (Human-readable).

Audit: All tables track created_at, created_by, updated_at, updated_by.

Soft Deletes: Always filter queries with deleted_at IS NULL.

Storage: Use documents bucket (lowercase). Path: /{tenant_id}/{filename}.

2. State & Data Fetching
Server State: Use TanStack Query v5.

Keys: ['entity', 'list', { filter }] or ['entity', 'detail', id].

Client State: Use Zustand for UI toggles (Sidebar open/close, Auth session).

Optimistic Updates: UI must reflect changes immediately (e.g., creating a Phase shows it in the list instantly).

3. Production Deployment
Vercel Routing: Root vercel.json MUST exist with SPA rewrites to prevent 404s on refresh:

JSON
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
Environment: Use VITE_ prefix for client-side vars. SUPABASE_SERVICE_ROLE_KEY is server-side ONLY.

The Key Date & Status Engine
Hierarchy Ripple: Requirements ➔ Pitches ➔ Sets ➔ Phases ➔ Projects.

Key Start Date Logic: - If actual_start_date exists, use it.

Else if child records exist, use the earliest key_start_date of children.

Else use expected_start_date.

Key End/Due Date Logic: - If actual_end_date exists, use it.

Else if child records exist, use the latest key_end_date of children.

Else use expected_end_date.

Automated Status: Status is Read-Only and derived from:

Completed: If completed_date is present.

Past Due: If Key_End_Date < Today AND not completed.

Active: If Key_Start_Date ≤ Today AND no child "Past Due" flags.

On-Deck: If Key_Start_Date is within the next 10 days.

Future: If Key_Start_Date > 10 days from today.

⌨️ Critical CLI Commands
Deploy Edge Function: npx supabase functions deploy admin-reset-password --no-verify-jwt

Link Project: npx supabase link --project-ref zsrtcthepydfxgruagvq

Prod Sync: vercel --prod

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

# 🎨 UI/UX: Design System (MANDATORY)

`docs/DESIGN-SYSTEM.md` is the authoritative contract for layout, data display
and responsive behaviour. **Read it before building or changing any screen.**
Section 8 of that document is the definition of done; copy its checklist into
the pull request.

Non-negotiables, repeated here because they are the ones most often broken:

1. **Never hand-roll a table.** Importing `@/components/ui/table` in a page is
   a defect. Use `DataGrid` (`src/components/ui/data-grid.tsx`) for read-only
   tabular data, or `GridEditTable` when cells are editable in place. Both
   render a sortable table from `md` up and a card list below it from one
   column definition.

2. **Every scalar column must be sortable.** Give the column an `accessor`.
   A list the user cannot reorder is the defect this system exists to prevent.

3. **Column priority is required.** Exactly one `priority: 'primary'` column
   (the row's identity, which becomes the mobile card title), at most four
   `priority: 'secondary'`, everything else defaults to tertiary and collapses
   behind a disclosure on mobile. Internal IDs get `hideOnMobile: true`.

4. **Every column needs `width` or `minWidth`.** Columns without one collapse
   below legibility, which is what made columns appear to overlap.

5. **Test at 390 × 844.** No page may scroll horizontally at that width. The
   only element allowed to scroll sideways is a table's own scroll container.

6. **`md` (768px) is the single structural breakpoint.** Do not add custom
   breakpoints or a second switch point for the same decision.

7. **Never write a bare `grid-cols-2`.** Always `grid-cols-1 sm:grid-cols-2`.
   A bare two-column grid yields ~160px inputs on a phone.

8. **Page padding is applied once, by `MainLayout`.** Do not add page-level
   `p-*`. Use `PageShell` for the title/action header; it deliberately does not
   re-pad. `page-carbon p-6` is deprecated and removed.

9. **Touch targets:** 48px for primary buttons and form controls, 44px for row
   actions, icon buttons and tabs, 8px apart. The `coarse:` Tailwind variant
   applies sizing on touch input only.

10. **Money and counts use `numeric: true`** so they right-align with tabular
    figures.

11. **Contextual creation must lock the parent chain.** When a record is
    created from inside a parent, resolve the ancestors with
    `useParentContext` and guard every cascade reset with `isParentLocked`.
    Locked selects are disabled and pass through `withLockedOption`. Passing
    the id is not enough: a Requirement created from a Set used to arrive with
    no set because an async reset cleared it. See docs/DESIGN-SYSTEM.md
    section 10.

12. **Match the submit payload to the entity's real columns.** Check the
    `Create…Input` type first. Locking a select does not mean the column
    exists: a requirement stores `set_id`, `pitch_id` and `client_id` but has
    no `phase_id` (its phase comes via the set), so project and phase are
    filter-only fields on that form. Sending a column that does not exist
    fails the insert.

Deprecated, do not use: `DataTable` (use `DataGrid`), `page-carbon`, native
`<select>` (use `SearchableSelect`), `useMediaQuery` for layout (use Tailwind
prefixes; media queries are for behaviour), per-form `defaultValues` effects
for parent ids (use `useParentContext`).
