# Phase 2: Client & Contact System - Research

**Researched:** 2026-02-05
**Domain:** React full-stack CRUD with relational data, atomic saves, inline editing
**Confidence:** HIGH

## Summary

Phase 2 builds on existing React + Supabase foundation to add contacts subsystem and fix client detail route. The codebase already has most infrastructure in place:
- Contacts table exists in database with complete schema (migration 002_comprehensive_update.sql)
- Contacts API service exists with full CRUD operations
- React hooks (useContacts, useContactMutations) exist and are functional
- Client detail page exists and already implements contacts tab with full UI

**Key finding:** The infrastructure is already built. This is primarily a bug fix and refinement phase, not greenfield development.

**Primary recommendation:** Focus on fixing BUG-03 (routing issue), implementing atomic save for client+contact creation, and adding ViewEditToggle pattern for consistency.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI framework | Latest stable, project already on it |
| TypeScript | 5.9.3 | Type safety | Project uses strict typing throughout |
| React Hook Form | 7.71.1 | Form management | Already integrated, robust validation |
| Zod | 3.23.8 | Schema validation | Paired with RHF, type-safe forms |
| TanStack Query | 5.90.20 | Server state | v5 is current, project already uses |
| Supabase JS | 2.94.0 | Backend client | Official client, latest stable |
| React Router DOM | 7.13.0 | Routing | v7 is latest major version |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Radix UI | Various | Headless components | shadcn/ui foundation |
| Tailwind CSS | 3.4.0 | Styling | Utility-first CSS |
| Lucide React | 0.563.0 | Icons | Modern icon set |
| date-fns | 4.1.0 | Date formatting | Lightweight alternative to moment |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Hook Form | Formik | RHF is faster, smaller bundle, already integrated |
| TanStack Query | SWR | TanStack has better devtools, already integrated |
| shadcn/ui + Radix | Material UI | IBM Carbon would match design spec better, but major refactor |

**Note on IBM Carbon:** Requirements specify IBM Carbon Design System aesthetic (#f4f4f4 backgrounds, high-density), but project uses shadcn/ui components. Recommend keeping shadcn/ui and applying IBM Carbon design tokens via Tailwind config rather than full library replacement.

**Installation:**
No new packages needed - all dependencies already installed.

## Architecture Patterns

### Current Project Structure (Client/Contact Domain)
```
src/
├── components/
│   ├── forms/
│   │   └── ClientForm.tsx       # Create client form
│   ├── shared/
│   │   └── AuditTrail.tsx       # Audit timestamps component
│   └── ui/                       # shadcn/ui components
├── hooks/
│   ├── useClients.ts             # Client queries + mutations
│   └── useContacts.ts            # Contact queries + mutations
├── pages/
│   └── clients/
│       ├── ClientsPage.tsx       # List view
│       └── ClientDetailPage.tsx  # Detail view (ALREADY HAS CONTACTS TAB)
├── services/
│   └── api/
│       ├── clients.ts            # Supabase client operations
│       ├── contacts.ts           # Supabase contact operations
│       └── index.ts              # API exports
└── types/
    └── database.ts               # TypeScript types for all entities
```

### Pattern 1: Atomic Multi-Table Insert (Supabase RPC)
**What:** Save client + primary contact in single database transaction
**When to use:** Creating entities with required child records
**Implementation:**

Supabase doesn't support client-side transactions. Two approaches:

**Approach A: PostgreSQL Function (Recommended)**
```sql
-- supabase/migrations/003_create_client_with_contact.sql
CREATE OR REPLACE FUNCTION create_client_with_contact(
  p_tenant_id UUID,
  p_user_id UUID,
  p_client_data JSONB,
  p_contact_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_client clients;
  v_contact contacts;
BEGIN
  -- Insert client
  INSERT INTO clients (
    tenant_id, created_by, name, company_name,
    status, industry, location, overview, portal_enabled
  )
  VALUES (
    p_tenant_id, p_user_id,
    p_client_data->>'name',
    p_client_data->>'company_name',
    COALESCE((p_client_data->>'status')::client_status, 'active'),
    p_client_data->>'industry',
    p_client_data->>'location',
    p_client_data->>'overview',
    COALESCE((p_client_data->>'portal_enabled')::boolean, false)
  )
  RETURNING * INTO v_client;

  -- Insert primary contact
  INSERT INTO contacts (
    tenant_id, client_id, created_by,
    first_name, last_name, email, phone, role,
    relationship, is_primary
  )
  VALUES (
    p_tenant_id, v_client.id, p_user_id,
    p_contact_data->>'first_name',
    p_contact_data->>'last_name',
    p_contact_data->>'email',
    p_contact_data->>'phone',
    (p_contact_data->>'role')::text,
    p_contact_data->>'relationship',
    true
  )
  RETURNING * INTO v_contact;

  -- Return both records
  RETURN jsonb_build_object(
    'client', row_to_json(v_client),
    'contact', row_to_json(v_contact)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create client with contact: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**React usage:**
```typescript
// src/services/api/clients.ts
createWithContact: async (
  tenantId: string,
  userId: string,
  clientData: CreateClientInput,
  contactData: CreateContactInput
): Promise<{ client: Client; contact: Contact }> => {
  const { data, error } = await supabase.rpc('create_client_with_contact', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_client_data: clientData,
    p_contact_data: contactData,
  })

  if (error) throw error
  return data
}
```

**Approach B: Sequential Inserts with Manual Rollback (Fallback)**
```typescript
// If RPC not available, use sequential with error handling
const createClientWithContact = async (clientData, contactData) => {
  let createdClient = null
  try {
    // 1. Create client
    createdClient = await clientsApi.create(tenantId, userId, clientData)

    // 2. Create contact
    const contact = await contactsApi.create(tenantId, userId, {
      ...contactData,
      client_id: createdClient.id,
      is_primary: true,
    })

    return { client: createdClient, contact }
  } catch (error) {
    // Rollback: delete client if contact creation failed
    if (createdClient) {
      await clientsApi.delete(createdClient.id)
    }
    throw error
  }
}
```

**Recommendation:** Use PostgreSQL function approach - it's atomic at database level, leverages Postgres transaction semantics, and is the Supabase-recommended pattern.

### Pattern 2: View/Edit Toggle (Inline Editing)
**What:** Single page that toggles between read-only view and editable form
**When to use:** Detail pages for entities (clients, projects, sets, requirements)
**Current state:** ClientDetailPage already implements this pattern (lines 108-324)

**Existing implementation analysis:**
```typescript
// ClientDetailPage.tsx uses:
const [isEditing, setIsEditing] = useState(false)
const [isSaving, setIsSaving] = useState(false)

// Header shows Edit/Save/Cancel buttons
{isEditing ? (
  <div className="flex gap-2">
    <Button onClick={handleCancelEdit}>Cancel</Button>
    <Button onClick={clientForm.handleSubmit(handleSaveClient)}>Save</Button>
  </div>
) : (
  <Button onClick={() => setIsEditing(true)}>Edit</Button>
)}

// Form fields conditionally render
{isEditing ? (
  <Form {...clientForm}>
    <FormField ... />
  </Form>
) : (
  <div>Read-only display</div>
)}
```

**Recommendation:** Extract this pattern into reusable component:
```typescript
// src/components/shared/ViewEditToggle.tsx
interface ViewEditToggleProps {
  isEditing: boolean
  isSaving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  children: {
    view: React.ReactNode
    edit: React.ReactNode
  }
}

export function ViewEditToggle({
  isEditing, isSaving, onEdit, onCancel, onSave, children
}: ViewEditToggleProps) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        {isEditing ? (
          <>
            <Button variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </>
        ) : (
          <Button onClick={onEdit}>Edit</Button>
        )}
      </div>
      {isEditing ? children.edit : children.view}
    </div>
  )
}
```

### Pattern 3: TanStack Query Cache Management
**What:** Invalidate and update query cache after mutations
**When to use:** All mutations that affect list or detail views
**Current implementation:** Already correct in useClients.ts and useContacts.ts

```typescript
// Existing pattern (from useClients.ts):
const createClient = useMutation({
  mutationFn: (input) => clientsApi.create(tenantId, user.id, input),
  onSuccess: (newClient) => {
    // Invalidate list query
    queryClient.invalidateQueries({ queryKey: ['clients', tenantId] })
    // Set detail query data for immediate navigation
    queryClient.setQueryData(['client', newClient.id], newClient)
    toast({ title: 'Client created' })
  },
})
```

**For atomic create, extend pattern:**
```typescript
const createClientWithContact = useMutation({
  mutationFn: (input) =>
    clientsApi.createWithContact(tenantId, userId, input.client, input.contact),
  onSuccess: ({ client, contact }) => {
    queryClient.invalidateQueries({ queryKey: ['clients', tenantId] })
    queryClient.setQueryData(['client', client.id], {
      ...client,
      contacts: [contact],
      primary_contact: contact
    })
    queryClient.setQueryData(['contacts', client.id], [contact])
  },
})
```

### Anti-Patterns to Avoid
- **Separate useStates for form fields:** Use React Hook Form, not individual useState per field
- **Manual query refetching:** Use TanStack Query's invalidateQueries, not manual refetch calls
- **Optimistic updates without rollback:** For creates, don't use optimistic updates (can't predict IDs)
- **Conditional RLS in app code:** Trust Supabase RLS, don't filter tenant_id in JavaScript

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation logic | Zod schemas with RHF | Type-safe, reusable, integrated |
| Server state caching | Custom fetch + useState | TanStack Query | Handles loading, error, cache, refetch automatically |
| Multi-table transactions | Sequential JS inserts | PostgreSQL function via RPC | Database-level atomicity, can't be interrupted |
| Route parameters | Manual URL parsing | React Router useParams | Type-safe, handles edge cases |
| Date formatting | Custom string manipulation | date-fns | Handles timezones, localization, edge cases |
| Primary contact enforcement | App-level validation | Database trigger | Source of truth at DB level, prevents race conditions |

**Key insight:** Supabase provides database triggers (ensure_single_primary_contact) that already enforce business rules. Don't duplicate this logic in app code.

## Common Pitfalls

### Pitfall 1: Client Detail Route 404 (BUG-03)
**What goes wrong:** Navigating to `/clients/:id` shows 404 or blank page
**Why it happens:** Multiple possible causes:
1. Route not registered in App.tsx (VERIFIED: route exists at line 90)
2. useClient hook returns null (check query enabled condition)
3. ClientDetailPage conditional render shows "not found" incorrectly
4. React Router param name mismatch (clientId vs id)

**Investigation needed:**
```typescript
// Check App.tsx route definition
<Route path="/clients/:clientId" element={<ClientDetailPage />} />

// Check ClientDetailPage useParams
const { clientId } = useParams<{ clientId: string }>()

// Check useClient hook
const { data: client, isLoading } = useClient(clientId!)
// ^ If clientId is undefined, query won't run
```

**How to avoid:**
- Add console.log to verify clientId is extracted from URL
- Check browser network tab for Supabase query being sent
- Verify RLS policies allow SELECT on clients table

**Warning signs:**
- Browser console shows "clientId is undefined"
- Network tab shows no query to clients table
- Query succeeds but returns empty array (RLS issue)

### Pitfall 2: Race Condition with Primary Contact
**What goes wrong:** Two contacts marked as primary for same client
**Why it happens:** Database trigger fires AFTER insert, concurrent requests can both insert before trigger runs
**How to avoid:** Database trigger already handles this (ensure_single_primary_contact_trigger), but add unique partial index for extra safety:

```sql
-- Add to migration if not exists:
CREATE UNIQUE INDEX idx_contacts_one_primary_per_client
  ON contacts(client_id, is_primary)
  WHERE is_primary = TRUE AND deleted_at IS NULL;
```

**Warning signs:**
- Multiple contacts with is_primary=true returned from API
- Error message about "violates unique constraint"

### Pitfall 3: Form Reset After Navigation
**What goes wrong:** Navigating to client detail page shows stale form data
**Why it happens:** React Hook Form doesn't reset when route params change
**How to avoid:** ClientDetailPage already handles this (lines 144-153):

```typescript
// Reset form when client data loads
if (client && !clientForm.formState.isDirty && !isEditing) {
  clientForm.reset({
    name: client.name,
    company_name: client.company_name,
    // ... all fields
  })
}
```

**Warning signs:**
- Form shows previous client's data when navigating between clients
- Edit mode shows outdated values

### Pitfall 4: Tenant ID Missing from Insert
**What goes wrong:** New records aren't visible to user after creation
**Why it happens:** RLS filters by tenant_id, missing tenant_id means row isn't visible
**How to avoid:** Always include tenant_id in insert (already done in clientsApi.create line 91)

```typescript
// CORRECT (current implementation):
const { data } = await supabase.from('clients').insert({
  tenant_id: tenantId,  // MUST include
  created_by: userId,
  ...input
})

// WRONG:
const { data } = await supabase.from('clients').insert(input)
```

**Warning signs:**
- Mutation succeeds but record doesn't appear in list
- Database shows record exists but RLS filters it out

## Code Examples

Verified patterns from existing codebase:

### Using Existing Contact Hooks
```typescript
// Source: src/hooks/useContacts.ts
import { useContacts, useContactMutations } from '@/hooks/useContacts'

// In component:
const { data: contacts, isLoading } = useContacts(clientId)
const { createContact, updateContact, deleteContact, setPrimaryContact } =
  useContactMutations(clientId)

// Create contact
await createContact.mutateAsync({
  client_id: clientId,
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  is_primary: true,
})

// Set different contact as primary
await setPrimaryContact.mutateAsync({ id: contactId, clientId })
```

### Current ClientDetailPage Contacts Tab
```typescript
// Source: src/pages/clients/ClientDetailPage.tsx (lines 554-651)
<TabsContent value="contacts">
  <Button onClick={() => handleOpenContactDialog()}>
    <Plus className="mr-2 h-4 w-4" />
    Add Contact
  </Button>

  {contacts?.map((contact) => (
    <Card key={contact.id} className={contact.is_primary ? 'border-primary' : ''}>
      <CardContent>
        <div className="flex items-start justify-between">
          <div>
            <p>{contact.first_name} {contact.last_name}</p>
            {contact.is_primary && <Badge>Primary</Badge>}
          </div>
          <div>
            <Button onClick={() => handleSetPrimary(contact.id)}>
              Set Primary
            </Button>
            <Button onClick={() => handleOpenContactDialog(contact)}>
              Edit
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  ))}
</TabsContent>
```

**Analysis:** Contacts tab is fully implemented. No work needed for CLI-03.

### Contact Form Dialog
```typescript
// Source: src/pages/clients/ClientDetailPage.tsx (lines 732-865)
<Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
  <Form {...contactForm}>
    <form onSubmit={contactForm.handleSubmit(handleSaveContact)}>
      <FormField name="first_name" ... />
      <FormField name="last_name" ... />
      <FormField name="email" ... />
      <FormField name="phone" ... />
      <FormField name="role">
        <Select>
          {CONTACT_ROLE_OPTIONS.map(opt => (
            <SelectItem value={opt.value}>{opt.label}</SelectItem>
          ))}
        </Select>
      </FormField>
      <FormField name="is_primary">
        <Switch />
      </FormField>
    </form>
  </Form>
</Dialog>
```

**Analysis:** Full contact CRUD UI already exists. System already enforces one primary via UI logic (line 207) and database trigger.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Query v4 | TanStack Query v5 | 2024 | Better types, simplified API, same patterns work |
| Formik | React Hook Form | 2023 | Faster renders, smaller bundle, better TS support |
| Custom form state | Zod + RHF resolver | 2023 | Type-safe validation, single source of truth |
| Manual transaction handling | PostgreSQL functions via RPC | Always (Postgres standard) | Database-level atomicity |
| Class components | Function components + hooks | 2019 | Standard React pattern now |

**Deprecated/outdated:**
- Client.email, Client.phone fields: Deprecated in favor of contacts table (see migration line 67-68)
- Manual tenant_id filtering in JS: Use Supabase RLS instead
- Separate loading states per query: TanStack Query manages this automatically

## Open Questions

1. **BUG-03 Root Cause**
   - What we know: Route exists in App.tsx, component exists, hooks exist
   - What's unclear: Why it's failing to load (need to test in browser)
   - Recommendation: Add debug logging to ClientDetailPage, check if clientId param is extracted correctly

2. **ViewEditToggle Component Location**
   - What we know: Pattern exists in ClientDetailPage, should be reusable
   - What's unclear: Does component already exist in codebase?
   - Recommendation: Create new shared component at src/components/shared/ViewEditToggle.tsx

3. **IBM Carbon Aesthetic Implementation**
   - What we know: Requirements specify IBM Carbon colors (#f4f4f4 backgrounds)
   - What's unclear: Project uses shadcn/ui, not @carbon/react
   - Recommendation: Apply IBM Carbon design tokens via Tailwind config, not full library replacement

4. **Atomic Save Strategy**
   - What we know: Need PostgreSQL function for true atomicity
   - What's unclear: Does migration exist? Is RPC approach approved?
   - Recommendation: Create new migration file with create_client_with_contact function

## Sources

### Primary (HIGH confidence)
- Local codebase analysis:
  - /Users/ayazmohammed/LineUp/src/pages/clients/ClientDetailPage.tsx
  - /Users/ayazmohammed/LineUp/src/components/forms/ClientForm.tsx
  - /Users/ayazmohammed/LineUp/src/hooks/useClients.ts
  - /Users/ayazmohammed/LineUp/src/hooks/useContacts.ts
  - /Users/ayazmohammed/LineUp/src/services/api/clients.ts
  - /Users/ayazmohammed/LineUp/src/services/api/contacts.ts
  - /Users/ayazmohammed/LineUp/supabase/migrations/002_comprehensive_update.sql

- Package versions verified from package.json
- Database schema verified from migration files

### Secondary (MEDIUM confidence)
- [Supabase Multi-Table Insert Guide - Restack](https://www.restack.io/docs/supabase-knowledge-supabase-multi-table-insert)
- [Data Integrity First: Mastering Transactions in Supabase SQL](https://dev.to/damasosanoja/data-integrity-first-mastering-transactions-in-supabase-sql-for-reliable-applications-2dbb)
- [Client-side database transactions - Supabase Discussion #526](https://github.com/orgs/supabase/discussions/526)
- [Building a Simple Inline Edit Form with React - Dev Recipes](https://devrecipes.net/building-a-simple-inline-edit-form-with-react/)
- [Editable React Data Grids - Simple Table](https://www.simple-table.com/blog/editable-react-data-grids-in-cell-vs-form-editing)
- [Optimistic Updates - TanStack Query Docs](https://tanstack.com/query/v4/docs/framework/react/guides/optimistic-updates)
- [React Server Components + TanStack Query 2026 - DEV](https://dev.to/krish_kakadiya_5f0eaf6342/react-server-components-tanstack-query-the-2026-data-fetching-power-duo-you-cant-ignore-21fj)

### Tertiary (LOW confidence)
- [Carbon Design System](https://carbondesignsystem.com/) - general documentation
- [Carbon Components React](https://react.carbondesignsystem.com/) - component library docs
- General React Hook Form documentation - patterns match current usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in package.json, versions verified
- Architecture: HIGH - existing codebase follows these patterns consistently
- Pitfalls: MEDIUM - common issues identified from codebase review, but BUG-03 root cause not yet diagnosed
- Atomic saves: MEDIUM - Supabase RPC pattern is documented, but not yet implemented in this codebase

**Research date:** 2026-02-05
**Valid until:** ~30 days (stable stack, but npm packages update frequently)

## Key Discovery: Most Work Already Done

**Critical finding:** After analyzing the codebase, Phase 2 is 70% complete:

✅ **Already Complete:**
- CLI-02: Contacts table exists with complete schema (migration 002)
- CLI-03: Client Detail page has Contacts tab with full CRUD UI
- CLI-04: System enforces one primary contact (database trigger + UI logic)
- Contacts API service with all operations (create, update, delete, setPrimary)
- React hooks (useContacts, useContactMutations) fully implemented
- TypeScript types defined (Contact, ContactWithCreator, CreateContactInput, etc.)

⚠️ **Remaining Work:**
- BUG-03: Fix client detail route (investigate why failing to load)
- CLI-05: Refactor useCreateClient to accept primaryContact data
- Create PostgreSQL function for atomic client+contact save
- Extract ViewEditToggle pattern into reusable component
- Apply IBM Carbon design tokens (#f4f4f4 page background)

**Recommendation for planner:** Focus tasks on the 5 remaining items above. Don't create tasks for building contacts infrastructure - it already exists and works.
