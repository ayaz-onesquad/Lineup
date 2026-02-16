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

⌨️ Critical CLI Commands
Deploy Edge Function: npx supabase functions deploy admin-reset-password --no-verify-jwt

Link Project: npx supabase link --project-ref zsrtcthepydfxgruagvq

Prod Sync: vercel --prod