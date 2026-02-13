# Technology Stack: Playwright Multi-Auth Testing

**Project:** LineUp E2E Testing with RBAC
**Researched:** 2026-02-11

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Playwright | Latest | E2E testing | Already in use, native auth support |
| TypeScript | 5.x | Type safety | Matches existing codebase |

### Test Configuration
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Setup Projects | Native | Auth state generation | Official Playwright pattern for multi-auth |
| Storage State | Native | Session persistence | Eliminates re-login per test |
| Project Dependencies | Native | Test ordering | Ensures setup runs before tests |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | Existing | Env vars | Load role credentials from .env |
| path | Native | File paths | Resolve auth state file locations |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth Storage | JSON files | In-memory | Files persist across workers, shareable |
| Setup Pattern | Single setup.ts | Per-role setup files | Single file is more maintainable |
| Role Isolation | Separate projects | test.use() per file | Projects scale better for CI parallelism |

## File Structure

```
tests/
  auth.setup.ts          # All role authentications
  sysadmin/
    admin-dashboard.spec.ts
    tenant-management.spec.ts
  org-admin/
    team-management.spec.ts
    client-management.spec.ts
  org-user/
    project-access.spec.ts
    requirement-editing.spec.ts
  client-user/
    portal-access.spec.ts
  security/
    rbac-forbidden.spec.ts
    redirect-unauthenticated.spec.ts

playwright/
  .auth/
    sysadmin.json        # sys_admin storage state
    admin.json           # org_admin storage state
    user.json            # org_user storage state
    client.json          # client_user storage state
```

## Environment Variables Required

```bash
# .env.test or .env
TEST_SYSADMIN_EMAIL=sysadmin@test.com
TEST_SYSADMIN_PASSWORD=secure_password

TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=secure_password

TEST_USER_EMAIL=user@test.com
TEST_USER_PASSWORD=secure_password

TEST_CLIENT_EMAIL=client@test.com
TEST_CLIENT_PASSWORD=secure_password
```

## Sources

- [Playwright Authentication](https://playwright.dev/docs/auth)
- [Playwright Solutions: Multiple Login States](https://playwrightsolutions.com/handling-multiple-login-states-between-different-tests-in-playwright/)
