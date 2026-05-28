# LineUp Leads Data Model — Findings Report

**Date:** 2026-05-28
**Purpose:** Document LineUp's lead schema for external waitlist inserts from DriveCommand marketing site

---

## 1. Table Name

```
leads
```

---

## 2. Complete Column List with Types and Constraints

| Column | Type | Nullable | Default | Constraint/Notes |
|--------|------|----------|---------|------------------|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `tenant_id` | UUID | **NOT NULL** | — | FK → `tenants(id)` ON DELETE CASCADE |
| `display_id` | SERIAL | NOT NULL | Auto-increment | Human-readable ID |
| `lead_id_display` | VARCHAR(20) | NULL | — | Optional formatted display ID |
| `lead_name` | VARCHAR(255) | **NOT NULL** | — | **REQUIRED** |
| `description` | TEXT | NULL | — | |
| `status` | `lead_status` ENUM | **NOT NULL** | `'new'` | See §3 for values |
| `industry` | VARCHAR(100) | NULL | — | Free-text, not FK |
| `website` | VARCHAR(500) | NULL | — | |
| `phone` | VARCHAR(50) | NULL | — | |
| `email` | VARCHAR(255) | NULL | — | |
| `city` | VARCHAR(100) | NULL | — | Added in migration 040 |
| `state` | TEXT | NULL | — | Added in migration 055 |
| `address` | VARCHAR(500) | NULL | — | Added in migration 040 |
| `company_size` | `company_size` ENUM | NULL | — | `'1-10'│'11-50'│'51-200'│'201-500'│'500+'` |
| `estimated_value` | NUMERIC(15,2) | NULL | — | |
| `estimated_close_date` | DATE | NULL | — | |
| `source` | VARCHAR(50) | NULL | — | **CHECK constraint** — see §4 |
| `source_automation_name` | TEXT | NULL | — | Added in migration 055 |
| `lead_owner_id` | UUID | NULL | — | FK → `user_profiles(id)` |
| `converted_to_client_id` | UUID | NULL | — | FK → `clients(id)` |
| `converted_at` | TIMESTAMPTZ | NULL | — | |
| `lost_reason` | VARCHAR(100) | NULL | — | Required if status='lost' |
| `lost_reason_notes` | TEXT | NULL | — | |
| `notes` | TEXT | NULL | — | |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `created_by` | UUID | NULL | — | FK → `auth.users(id)` |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `updated_by` | UUID | NULL | — | FK → `auth.users(id)` |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft delete |

### Table-Level CHECK Constraints

1. **`leads_won_check`**: If `status = 'won'`, then `converted_to_client_id` AND `converted_at` must be NOT NULL
2. **`leads_lost_check`**: If `status = 'lost'`, then `lost_reason` must be NOT NULL

---

## 3. Lead Status — The `lead_status` ENUM

**There is NO "waitlist" status.** The existing enum values are:

```sql
CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost'
);
```

**For waitlist signups**, use **`status = 'new'`** (the default).

---

## 4. Source Column — CHECK Constraint Values

```sql
CHECK (source IN (
  'referral',
  'website',
  'social_media',
  'cold_outreach',
  'event',
  'partner',
  'advertising',
  'lead_generator',
  'other'
))
```

**Recommendation for marketing waitlist:**
- Use `source = 'website'` for marketing site signups
- **OR** add `'marketing_waitlist'` to the CHECK constraint via a new migration if you want a distinct value

---

## 5. Tenant Requirement — CRITICAL BLOCKER

### The Problem

```sql
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
```

**`tenant_id` is NOT NULL and has a foreign key constraint.** Every lead MUST belong to a valid tenant.

### Marketing Waitlist Implications

A marketing-sourced lead (anonymous visitor, no LineUp tenant) has **no tenant to belong to**. Options:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A** | Create a "Marketing/DriveCommand" tenant | Simple; leads appear in LineUp UI | Pollutes real tenant list; requires manual assignment later |
| **B** | Store waitlist in a separate `waitlist_signups` table | Clean separation; no tenant required | Doesn't appear in LineUp Leads UI; needs separate admin view |
| **C** | Create an RPC/Edge Function that assigns to default tenant | Controlled; can add validation | Still needs a "default" tenant to exist |

**Recommended:** Option **B** — Create a dedicated `waitlist_signups` table without `tenant_id` requirement, or use Option **A** with a single "DriveCommand Marketing" tenant UUID that you provision once and hardcode in the marketing site.

---

## 6. RLS Policies — Will Service-Role Key Work?

### Current RLS Policies (as of migration 042)

```sql
-- INSERT policy
CREATE POLICY "leads_insert_policy" ON leads
FOR INSERT WITH CHECK (
    (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
    )
    OR public.is_sys_admin()
);
```

### Analysis

| Role | Can INSERT? | Notes |
|------|-------------|-------|
| `anon` | ❌ NO | Not listed; `auth.uid()` returns NULL |
| `authenticated` | ✅ Conditional | Only if user is member of target tenant with valid role |
| `service_role` | ✅ YES | **Bypasses RLS entirely** |

### Answer: YES, Service-Role Key Will Work

When using `SUPABASE_SERVICE_ROLE_KEY`, RLS is bypassed completely. An insert will succeed as long as:
1. The `tenant_id` references a valid tenant (FK constraint)
2. Required columns are provided (`lead_name`, `tenant_id`)
3. `status` is a valid enum value (defaults to `'new'`)

---

## 7. How LineUp UI Queries Leads

From `src/services/api/leads.ts:55-60`:

```typescript
const { data, error } = await supabase
  .from('leads')
  .select(LEAD_SELECT)
  .eq('tenant_id', tenantId)       // Filter by current tenant
  .is('deleted_at', null)          // Exclude soft-deleted
  .order('created_at', { ascending: false })
```

From `src/pages/leads/LeadsPage.tsx:131-145`:

```typescript
// Filter and group by status
const filteredLeads = useMemo(() => {
  if (!leads) return []
  return leads.filter(/* search/filter logic */)
}, [leads, ...])

// Group by pipeline stage
const leadsByStatus = useMemo(() => {
  const grouped: Record<LeadStatus, LeadWithRelations[]> = {} as any
  for (const stage of stages) {
    grouped[stage.status] = filteredLeads.filter((l) => l.status === stage.status)
  }
  return grouped
}, [filteredLeads])
```

**For a lead to appear in LineUp's UI:**
1. Must have `tenant_id` matching the logged-in user's current tenant
2. Must have `deleted_at = NULL`
3. Will appear in the "New" pipeline column by default (status='new')

---

## 8. Recommended Insert Object (JSON)

Assuming you create a "DriveCommand Marketing" tenant and capture its UUID:

```json
{
  "tenant_id": "YOUR_MARKETING_TENANT_UUID",
  "lead_name": "Waitlist Signup - {{email}}",
  "email": "user@example.com",
  "status": "new",
  "source": "website",
  "source_automation_name": "DriveCommand Waitlist",
  "notes": "Marketing waitlist signup from DriveCommand landing page",
  "description": "Waitlist signup captured {{timestamp}}"
}
```

### Minimum Required Fields

```json
{
  "tenant_id": "REQUIRED_UUID",
  "lead_name": "REQUIRED_STRING"
}
```

All other fields are optional and will use defaults or NULL.

---

## 9. Summary & Recommendations

### Can You Insert via Service-Role Key?
**YES** — Service-role bypasses RLS. The insert will succeed.

### Blocking Issue
**`tenant_id` is NOT NULL** — You must provision a tenant for marketing leads.

### Schema Changes Needed?
| Scenario | Change Required |
|----------|-----------------|
| Insert to existing `leads` table | Provision a "Marketing" tenant; no schema change |
| Want `'marketing_waitlist'` as distinct source | Add to CHECK constraint via migration |
| Want `'waitlist'` as distinct status | Add to `lead_status` ENUM via migration |
| Prefer separate table | Create `waitlist_signups` table (different schema) |

### Recommended Approach

1. **Create a dedicated "DriveCommand Marketing" tenant** in LineUp's `tenants` table
2. **Use the service-role key** from DriveCommand to insert leads
3. **Use `source = 'website'`** and `source_automation_name = 'DriveCommand Waitlist'`
4. **Status defaults to `'new'`** — leads appear in the "New" column of the pipeline
5. Optionally: Create a migration to add `'marketing_waitlist'` to the source CHECK constraint for better tracking

### If You Need a Separate Waitlist Table Instead

You would need to create a new table without the `tenant_id NOT NULL` constraint. This would require a new migration and a separate admin UI to view waitlist signups. The current `leads` table is tightly coupled to the multi-tenant model.

---

## 10. Quick Reference — Insert Example (TypeScript)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypasses RLS
)

const MARKETING_TENANT_ID = 'your-marketing-tenant-uuid-here'

export async function insertWaitlistLead(data: {
  email: string
  name?: string
  company?: string
}) {
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      tenant_id: MARKETING_TENANT_ID,
      lead_name: data.name || `Waitlist - ${data.email}`,
      email: data.email,
      description: data.company || null,
      status: 'new',
      source: 'website',
      source_automation_name: 'DriveCommand Waitlist',
    })
    .select()
    .single()

  if (error) throw error
  return lead
}
```
