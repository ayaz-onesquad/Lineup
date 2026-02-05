# Testing Patterns

**Analysis Date:** 2026-02-05

## Test Framework

**Status:**
- No test framework currently configured
- No test files found in `src/` directory
- Testing is not yet implemented

**Recommended Patterns (for future implementation):**

The codebase uses:
- **React 19** with strict mode enabled
- **TypeScript** with strict type checking
- **TanStack Query v5** for server state
- **Zustand** for client state
- **React Hook Form + Zod** for form validation
- **shadcn/ui** with Radix UI primitives

A testing setup should account for these dependencies.

## Test File Organization

**Recommended Pattern:**
- Co-located tests next to implementation files
- File naming: `[Component|Hook].test.tsx` or `[module].test.ts`
- Test files in same directory as source

**Example Structure:**
```
src/
├── hooks/
│   ├── useClients.ts
│   └── useClients.test.ts
├── components/
│   ├── forms/
│   │   ├── ClientForm.tsx
│   │   └── ClientForm.test.tsx
├── services/
│   ├── api/
│   │   ├── clients.ts
│   │   └── clients.test.ts
```

## Testing Patterns to Implement

### API Service Testing

**Current Pattern** (from `src/services/api/clients.ts`):
- Direct Supabase client calls
- Error handling with Supabase error codes
- Soft delete pattern with `deleted_at IS NULL` filtering

**What to Test:**
1. Successful CRUD operations
2. Supabase error handling (code 'PGRST116' for missing single results)
3. Soft delete behavior (null check on deleted_at)
4. Tenant isolation (all queries filter by tenant_id)
5. Contact relationship resolution

**Pattern Example:**
```typescript
// Testing soft deletes
describe('clientsApi.delete', () => {
  it('should soft delete a client by setting deleted_at', async () => {
    // Mock supabase.from().update()
    // Verify deleted_at is set to current timestamp
  })

  it('should filter deleted clients in getAll', async () => {
    // Mock supabase with both active and deleted clients
    // Verify only non-deleted clients returned
  })
})

// Testing tenant isolation
describe('clientsApi.getAll', () => {
  it('should only return clients for specified tenant', async () => {
    // Mock supabase filtering
    // Verify .eq('tenant_id', tenantId) called
  })
})
```

### Hook Testing (useQuery/useMutation)

**Current Patterns** (from `src/hooks/useClients.ts`, `src/hooks/useAuth.ts`):
- Query keys use tenant context: `['clients', tenantId]`
- Mutations include onSuccess/onError toast notifications
- Query cache invalidation on mutation success
- Conditional enabling based on dependencies

**What to Test:**
1. Query enabled/disabled based on dependencies
2. Query key structure (includes tenant_id for isolation)
3. Mutation success handlers (cache invalidation, direct cache updates)
4. Error toast notifications
5. Loading states

**Pattern Example:**
```typescript
// Mock TanStack Query
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

describe('useClients', () => {
  const queryClient = new QueryClient()

  it('should disable query when tenantId is missing', () => {
    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    })

    // Mock useTenantStore to return null tenantId
    // Verify enabled: !!tenantId results in query disabled
  })

  it('should invalidate clients list on successful mutation', async () => {
    const { result } = renderHook(() => useClientMutations(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    })

    await waitFor(() => {
      result.current.createClient.mutate({...})
    })

    // Verify queryClient.invalidateQueries called with ['clients', tenantId]
  })
})
```

### Component Testing

**Current Patterns** (from `src/components/forms/ClientForm.tsx`):
- Props interface with optional callbacks
- Form state managed by React Hook Form
- Async submit handlers with error handling
- Loading state from mutation isPending

**What to Test:**
1. Form field rendering and labels
2. Form submission triggering mutations
3. onSuccess callback when form submits successfully
4. Form reset after successful submission
5. Error handling (partial success - contact creation fails but client succeeds)
6. Loading/disabled states during submission

**Pattern Example:**
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('ClientForm', () => {
  it('should render all form fields', () => {
    render(<ClientForm onSuccess={jest.fn()} />)

    expect(screen.getByLabelText('Client Name *')).toBeInTheDocument()
    expect(screen.getByLabelText('Industry')).toBeInTheDocument()
    expect(screen.getByLabelText('Overview')).toBeInTheDocument()
  })

  it('should submit form with valid data', async () => {
    const user = userEvent.setup()
    const onSuccess = jest.fn()

    render(<ClientForm onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText('Client Name *'), 'Acme Corp')
    await user.click(screen.getByRole('button', { name: /Create Client/ }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('should handle contact creation failure gracefully', async () => {
    // Mock createClient to succeed, createContact to fail
    // Verify client created but error logged
    // Verify toast shown for client creation success
  })

  it('should disable submit button while submitting', async () => {
    render(<ClientForm onSuccess={jest.fn()} />)

    const submitButton = screen.getByRole('button', { name: /Create Client/ })

    await userEvent.type(screen.getByLabelText('Client Name *'), 'Acme')
    await userEvent.click(submitButton)

    // Verify button disabled during submission
    expect(submitButton).toBeDisabled()
  })
})
```

### Provider Testing

**Current Patterns** (from `src/components/providers/AuthProvider.tsx`):
- StrictMode compatible initialization
- Mounted check to prevent state updates on unmounted components
- Session initialization and auth state listener subscription

**What to Test:**
1. Session initialization on mount
2. Auth state listener subscription/cleanup
3. Mounted check prevents memory leaks
4. Logout on auth state change

**Pattern Example:**
```typescript
describe('AuthProvider', () => {
  it('should initialize auth session on mount', async () => {
    const { getSession } = jest.spyOn(supabase.auth, 'getSession')

    render(
      <AuthProvider>
        <div>Test</div>
      </AuthProvider>
    )

    await waitFor(() => {
      expect(getSession).toHaveBeenCalled()
    })
  })

  it('should unsubscribe from auth listener on unmount', () => {
    const unsubscribe = jest.fn()
    jest.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
      data: { subscription: { unsubscribe } },
    })

    const { unmount } = render(
      <AuthProvider>
        <div>Test</div>
      </AuthProvider>
    )

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})
```

## Error Testing

**Current Error Patterns:**
- Supabase API errors checked: `if (error) throw error`
- Specific error code handling: `if (error.code !== 'PGRST116') throw error`
- Error type checking: `error instanceof Error ? error.message : fallback`

**Test Pattern:**
```typescript
describe('error handling', () => {
  it('should throw Supabase errors', async () => {
    const mockError = new Error('Database error')
    jest.spyOn(supabase.from('clients'), 'select').mockRejectedValue(mockError)

    await expect(clientsApi.getAll('tenant-1')).rejects.toThrow('Database error')
  })

  it('should handle PGRST116 not found error gracefully', async () => {
    const supabaseError = { code: 'PGRST116' }
    jest.spyOn(supabase.from('clients'), 'select').mockRejectedValue(supabaseError)

    const result = await clientsApi.getById('missing-id')

    expect(result).toBeNull()
  })

  it('should extract error message for user display', () => {
    const error = new Error('Invalid input')
    const message = error instanceof Error ? error.message : 'An error occurred'

    expect(message).toBe('Invalid input')
  })
})
```

## Mocking Strategy

**Framework Recommendations:**
- **Vitest** or **Jest** as test runner (Vitest preferred with ESM/Vite)
- **@testing-library/react** for component testing
- **@testing-library/user-event** for user interaction simulation
- **@vitest/ui** or **jest** reporters for test visualization

**What to Mock:**
1. **Supabase client** - All database calls (see `src/services/api/clients.ts`)
2. **TanStack Query** - QueryClient for hook testing
3. **Zustand stores** - Auth and tenant context
4. **useNavigate** - React Router navigation
5. **Toast notifications** - Error/success messages

**What NOT to Mock:**
1. **Zod validation** - Test actual validation behavior
2. **React Hook Form** - Test real form behavior
3. **shadcn/ui components** - Use real UI library
4. **Utility functions** - Test actual implementations (`cn`, `formatDate`, etc.)

**Example Mock Setup:**
```typescript
// Mock Supabase
jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
      update: jest.fn().mockResolvedValue({ data: {}, error: null }),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
    })),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}))

// Mock TanStack Query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: undefined, isLoading: true, error: null })),
  useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}))

// Mock Zustand stores
jest.mock('@/stores', () => ({
  useAuthStore: () => ({ user: null, profile: null, role: null }),
  useTenantStore: () => ({ currentTenant: { id: 'test-tenant' } }),
}))

// Mock toast
jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}))
```

## Test Coverage Gaps

**No tests currently exist** for:
- Any API service functions
- Any custom hooks
- Any components
- Authentication flow
- Authorization/role checking
- Tenant isolation in queries
- Multi-tenant data filtering
- Error recovery and retry logic
- Form validation edge cases
- Soft delete behavior
- Cache invalidation on mutations
- Component integration scenarios
- Navigation guards (AuthGuard, TenantGuard, AdminGuard)

**Recommended Priority (High → Low):**
1. API service layer (data integrity, tenant isolation)
2. Custom hooks (query setup, mutation cache updates)
3. Forms (validation, submission, error handling)
4. Authorization guards (role-based routing)
5. Components (UI rendering, user interactions)

## Suggested Test Runner Setup

**Recommended: Vitest with React Testing Library**

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/user-event @testing-library/jest-dom vitest-setup
```

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/main.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**vitest.setup.ts:**
```typescript
import '@testing-library/jest-dom'
import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
```

**package.json scripts:**
```json
{
  "test": "vitest",
  "test:ui": "vitest --ui",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage"
}
```

---

*Testing analysis: 2026-02-05*
