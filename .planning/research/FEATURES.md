# Feature Landscape: Playwright Multi-Auth Testing

**Domain:** RBAC E2E Testing
**Researched:** 2026-02-11

## Table Stakes

Features users expect. Missing = test suite feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Login once per role | Standard Playwright pattern | Low | Setup project with storageState |
| Parallel role tests | CI efficiency | Low | Built into project configuration |
| Authenticated route access | Core RBAC testing | Low | Navigate + assert URL |
| Redirect to login for unauthenticated | Basic security | Low | `expect(page).toHaveURL('/login')` |
| Role-specific dashboards | Multi-tenant requirement | Medium | SysAdmin vs OrgAdmin vs User |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cross-role interaction tests | Real-world multi-user flows | High | Multiple browser contexts |
| API 403 response mocking | Edge case coverage | Medium | `page.route()` interception |
| Session expiration handling | Token refresh testing | Medium | Requires expired token setup |
| Tenant isolation verification | Multi-tenant security | High | Same user, different tenants |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Hardcoded credentials in tests | Security risk | Use environment variables |
| Re-authenticate every test | Slow, wasteful | Use storageState persistence |
| Test auth in every spec file | Duplication | Use setup project + dependencies |
| Modify shared auth state in tests | Session contamination | Create temp auth for logout tests |

## Feature Dependencies

```
Setup Project
  |
  +-- SysAdmin Tests (depends: sysadmin.json)
  |
  +-- OrgAdmin Tests (depends: admin.json)
  |
  +-- OrgUser Tests (depends: user.json)
  |
  +-- ClientUser Tests (depends: client.json)
  |
  +-- Security Tests (depends: all states + unauthenticated)
```

## MVP Recommendation

Prioritize:
1. **Multi-role auth.setup.ts** - Foundation for all RBAC tests
2. **Per-role project configuration** - Enables parallel execution
3. **Basic access assertions** - Can each role access their pages?
4. **Redirect assertions for forbidden access** - Security verification

Defer:
- Cross-role interaction tests: Complex, requires multi-context setup
- API mocking for 403s: App may redirect instead of return 403

## Sources

- [Playwright Authentication](https://playwright.dev/docs/auth)
- [TestLeaf: Playwright Storage State](https://www.testleaf.com/blog/playwright-storage-state-reuse-login-multiple-users/)
