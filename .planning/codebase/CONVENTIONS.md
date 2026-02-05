# Coding Conventions

**Analysis Date:** 2026-02-05

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `ClientForm.tsx`, `MainLayout.tsx`)
- Services/APIs: camelCase (e.g., `clientsApi.ts`, `authApi.ts`)
- Hooks: camelCase with `use` prefix (e.g., `useClients.ts`, `useAuth.ts`)
- Utilities: camelCase (e.g., `utils.ts`)
- Types: PascalCase (e.g., `database.ts` containing `interface Client`)
- Pages: PascalCase (e.g., `ClientDetailPage.tsx`, `DashboardPage.tsx`)

**Functions:**
- Component functions: PascalCase (e.g., `export function ClientForm()`)
- Regular functions: camelCase (e.g., `createClient`, `formatDate`, `getStatusColor`)
- Callbacks: camelCase with `on` prefix (e.g., `onSuccess`, `onError`, `onChange`)
- Custom hooks: camelCase with `use` prefix (e.g., `useClients`, `useAuth`)

**Variables:**
- Constants: UPPER_SNAKE_CASE (e.g., `INDUSTRY_OPTIONS`, `CONTACT_ROLE_OPTIONS`)
- Regular variables: camelCase (e.g., `tenantId`, `isLoading`, `currentTenant`)
- Boolean variables: `is`/`has` prefix (e.g., `isLoading`, `isAuthenticated`, `hasError`)

**Types:**
- Interfaces: PascalCase (e.g., `ClientFormData`, `AuthState`, `UserProfile`)
- Type aliases: PascalCase (e.g., `UserRole`, `ClientStatus`, `IndustryType`)
- Literal types: camelCase or snake_case depending on enum-like purpose (e.g., `'org_admin' | 'org_user'`)

## Code Style

**Formatting:**
- No explicit prettier config; appears to use default formatting
- Imports organized with clear separation between library imports and local imports
- Spread operator usage is consistent for prop forwarding in components

**Linting:**
- ESLint with TypeScript support enabled
- Config: `eslint.config.js` (ESLint 9 flat config format)
- Extends: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- Strict TypeScript enforcement: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`

## Import Organization

**Order:**
1. React imports (from 'react', 'react-dom', 'react-router-dom')
2. Third-party library imports (zustand, zod, lucide-react, etc.)
3. TanStack Query imports (@tanstack/react-query)
4. Local service/API imports (@/services)
5. Store imports (@/stores)
6. Component imports (@/components)
7. Utility imports (@/lib, @/hooks)
8. Type imports (explicit `import type`)

**Path Aliases:**
- `@/*` → `./src/*` (configured in `tsconfig.app.json`)
- All relative imports use the `@/` alias pattern
- Examples: `@/services/api`, `@/components/ui/button`, `@/stores`, `@/hooks`

## Error Handling

**Patterns:**
- Synchronous API calls wrap errors: `if (error) throw error` (see `src/services/api/clients.ts`)
- Try-catch blocks in async mutations for graceful fallback (see `src/components/forms/ClientForm.tsx`)
- Error instances checked with `error instanceof Error ? error.message : 'An error occurred'`
- Console error logging for non-critical failures: `console.error('Failed to create primary contact:', error)`
- Toast notifications for user-facing errors with title/description pattern

**Example from `src/components/forms/ClientForm.tsx`:**
```typescript
try {
  await createContact.mutateAsync({...})
} catch (error) {
  console.error('Failed to create primary contact:', error)
}
```

**Example from `src/pages/admin/AdminTenantDetailPage.tsx`:**
```typescript
catch (error) {
  toast({
    title: 'Failed to delete tenant',
    description: error instanceof Error ? error.message : 'An error occurred',
    variant: 'destructive',
  })
}
```

## Logging

**Framework:** Built-in `console` methods (no centralized logger)

**Patterns:**
- `console.error()` for caught exceptions and non-critical failures
- `console.log()` used in form submissions for temporary debugging (see `src/pages/settings/TeamPage.tsx`, `src/pages/settings/SettingsPage.tsx`)
- No INFO or WARN level logging observed
- Error logging includes context string for debugging

**Usage:**
```typescript
console.error('Failed to create primary contact:', error)
console.log('Invite:', inviteEmail, inviteRole)
```

## Comments

**When to Comment:**
- Function/hook purpose documented with JSDoc-style comments
- Logic reasoning for non-obvious behavior (see `src/services/api/clients.ts` line 33-34: "contacts table might not exist yet - that's ok")
- Fallback handling and temporary workarounds explained
- Schema validation rules with comments for clarity

**JSDoc/TSDoc:**
- Used for hook documentation (see `src/hooks/useAuth.ts`):
```typescript
/**
 * Hook for authentication operations
 * Auth state is managed by AuthProvider, this hook provides mutations
 */
export function useAuth() { ... }
```
- Not consistently applied across all functions
- Component and service function documentation is minimal

## Function Design

**Size:** Functions are focused and single-responsibility
- API service functions typically 5-30 lines
- Hook mutation handlers 20-40 lines including error/success handlers
- Component event handlers delegate to hooks/mutations

**Parameters:**
- API functions take explicit parameters: `(tenantId: string, userId: string, input: CreateClientInput)`
- Hooks accept minimal configuration objects
- Event handlers use standard React naming: `onSuccess?: () => void`

**Return Values:**
- API functions return typed objects or void for mutations
- Hooks return objects with multiple mutation/query properties: `{ createClient, updateClient, deleteClient }`
- Components return JSX elements

## Module Design

**Exports:**
- Barrel files for organization: `src/services/api/index.ts` exports all API modules
- Named exports preferred: `export { authApi } from './auth'`
- Default exports used for page components and layouts
- Store index (`src/stores/index.ts`) exports individual store hooks

**Barrel Files:**
- `src/services/api/index.ts`: Aggregates all API modules
- `src/stores/index.ts`: Exports all store hooks for convenience
- `src/components/ui/index.ts`: Re-exports shadcn components
- `src/hooks/index.ts`: Centralized hook exports

## TypeScript Patterns

**Type Safety:**
- Strict mode enabled: `strict: true`
- Type inference used where obvious
- Explicit return types on exported functions
- Type imports for database types: `import type { Client, ClientWithRelations }`

**Generics:**
- Used minimally; mostly in React hooks
- Query keys consistently typed: `useQuery<Client[]>({ queryKey: ['clients', tenantId], ... })`

## React Patterns

**Hooks:**
- Custom hooks extract API calls and state management: `useClients()`, `useAuth()`
- React Hook Form for form state: `useForm<ClientFormData>()`
- Zustand stores for global UI state: `useAuthStore()`, `useTenantStore()`, `useUIStore()`
- TanStack Query for server state: `useQuery()`, `useMutation()`

**Component Structure:**
- Functional components only
- Props interface defined above component: `interface ClientFormProps { onSuccess?: () => void }`
- Event handlers defined inside component function
- Conditional rendering with early returns for loading states

**Example from `src/components/forms/ClientForm.tsx`:**
```typescript
interface ClientFormProps {
  onSuccess?: () => void
}

export function ClientForm({ onSuccess }: ClientFormProps) {
  const { createClient } = useClientMutations()
  const form = useForm<ClientFormData>({...})

  const onSubmit = async (data: ClientFormData) => {...}

  return <Form>{...}</Form>
}
```

## UI Component Conventions

**shadcn Components:**
- Components imported from `@/components/ui/`
- Composed with `cn()` utility for className merging
- Use `React.forwardRef` for component forwarding (see `src/components/ui/alert-dialog.tsx`)
- `displayName` set on forwardRef components

**Example from `src/components/ui/button.tsx`:**
```typescript
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => (
    <Primitive.Root
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
      ref={ref}
    />
  )
)
Button.displayName = "Button"
```

## Form Patterns

**React Hook Form + Zod:**
- Schemas defined above form component: `const clientSchema = z.object({...})`
- Type inference: `type ClientFormData = z.infer<typeof clientSchema>`
- Form setup with resolver: `const form = useForm<ClientFormData>({ resolver: zodResolver(clientSchema), ... })`
- FormField render prop pattern for each field

**Validation:**
- Optional fields: `z.string().optional()`
- Email validation: `z.string().email('Invalid email format').optional().or(z.literal(''))`
- Message-driven error display via `<FormMessage />`

**Example from `src/components/forms/ClientForm.tsx`:**
```typescript
const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
})

type ClientFormData = z.infer<typeof clientSchema>

export function ClientForm({ onSuccess }: ClientFormProps) {
  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {...}
  })
}
```

---

*Convention analysis: 2026-02-05*
