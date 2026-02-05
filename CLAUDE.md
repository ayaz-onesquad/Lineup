# CLAUDE.md — LineUp Project Memory

## 🚀 Vision & Methodology
**LineUp** is a multi-tenant SaaS for agencies using the **CORE methodology** (Capture, Organize, Review, Execute).

## 🏗 Essential Hierarchy
Always respect this 5-level data structure. Never skip a level:
**Client ➔ Project ➔ Phase ➔ Set ➔ Requirement**.

## 🔐 Multi-Tenant & Security Rules
- **Isolation:** Every table (except `users`) MUST have a `tenant_id`. Every query MUST filter by `currentTenantId`.
- **RLS:** Row Level Security is the source of truth. Use `SECURITY DEFINER` for role-based access.
- **Roles:** Handle four distinct roles: `sys_admin` (system), `org_admin` (tenant owner), `org_user` (team), and `client_user` (portal).

## 🚦 Authorization & Routing (The "No-Loop" Logic)
- **Source of Truth:** Use the `useUserRole` hook (calling the `get_user_highest_role` RPC). Do NOT rely on potentially stale Zustand `authStore` roles.
- **sys_admin Branch:** If role is `sys_admin`, redirect to `/admin`. Bypass `/onboarding` entirely.
- **Tenant Branch:** If role is `org_admin/user`, redirect to `/dashboard`.
- **New User:** If authenticated but NO tenant/role exists, redirect to `/onboarding`.
- **Loading States:** Use `isPending && fetchStatus !== 'idle'` for TanStack Query loading checks to prevent infinite spinners.

## 💻 Technical Standards
- **Stack:** React 19, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query v5, Zustand.
- **State:** Zustand for UI/Auth; React Query for all server data.
- **Forms:** React Hook Form + Zod for all validation.
- **Soft Deletes:** Filter for `deleted_at IS NULL` on all Select queries.

## 🛠 Database & Logic Rules (Updated)
- **ID System:** Every table MUST have a `display_id` (auto-incrementing integer/auto-number) and a `uuid` (primary key).
- **Audit Logs:** Every table MUST include: `created_at`, `created_by`, `updated_at`, `updated_by` (UUIDs referencing `profiles.id`).
- **Persistence:** On object creation, automatically link `tenant_id` from the current active session.
- **Priority Logic:** Use Eisenhower Matrix (Urgency/Importance) to auto-calculate `priority` (1-6). 
- **Relationships:** All parent-child linkages must be editable via searchable dropdowns in Edit Mode.

## 🎨 UI/UX Standards
- **Page Pattern:** Full-page views for all major records (Clients, Projects, Sets, Requirements). Use "View Mode" and "Edit Mode" toggles on the same page.
- **Tab Order:** Always 1. Details (with Primary Contact/Parent info), 2. Immediate Children.
- **Navigation:** Back arrows must reliably pop the history stack.
- **Contextual Creation:** "Create New" buttons inside child tabs must auto-populate the parent ID from the current context.

## ⌨️ Common Commands
- `npm run dev`: Start dev server
- `npm run build`: Production check
- `npx remotion preview`: Preview video skills