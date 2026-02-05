---
phase: 01-foundation-fixes
plan: 01
subsystem: database-infrastructure
status: complete
tags: [postgrest, schema-cache, database, migrations, bugfix]
created: 2026-02-05

dependency-graph:
  requires:
    - supabase/migrations/002_comprehensive_update.sql
  provides:
    - supabase/refresh-schema-cache.sql
    - Schema cache refresh documentation
  affects:
    - All future plans that modify database schema
    - Plan 01-02 (Client Details Page) - depends on working location field

tech-stack:
  added: []
  patterns:
    - PostgREST schema cache management via NOTIFY
    - Database verification queries in SQL scripts

key-files:
  created:
    - supabase/refresh-schema-cache.sql
  modified:
    - CLAUDE.md

decisions:
  - id: schema-refresh-process
    what: Created reusable SQL script for PostgREST cache refresh
    why: PostgREST caches schema, new columns from migrations aren't recognized
    impact: Future migrations will need to run this script in Supabase SQL Editor
    date: 2026-02-05

metrics:
  duration: ~1 minute
  tasks-completed: 2/2
  commits: 2
  completed: 2026-02-05
---

# Phase 01 Plan 01: PostgREST Schema Cache Fix Summary

**One-liner:** Created SQL script with NOTIFY pgrst command to refresh PostgREST schema cache after migrations, fixing "column does not exist" errors for newly added fields.

## What Was Built

### Problem
Migration 002 added new columns (`location`, `industry`, `overview`) to the clients table, but PostgREST was caching the old schema. This caused INSERT and SELECT operations to fail with "column does not exist" errors, even though the columns existed in the database.

### Solution
Created `supabase/refresh-schema-cache.sql` with:

1. **NOTIFY command** - Triggers PostgREST schema reload
2. **Verification queries** - Confirms new columns exist in clients and contacts tables
3. **Documentation** - Explains when and why to use the script

### Key Features

- **Idempotent script** - Safe to run multiple times
- **Verification included** - Returns expected column list after refresh
- **Clear documentation** - Comments explain purpose and usage
- **CLAUDE.md integration** - Added to Common Commands section

## Tasks Completed

| Task | Description | Commit | Key Changes |
|------|-------------|--------|-------------|
| 1 | Create PostgREST schema cache refresh script | 5909e0f | Created supabase/refresh-schema-cache.sql with NOTIFY pgrst |
| 2 | Document schema refresh process | 7b0a101 | Updated CLAUDE.md Common Commands section |

## Technical Implementation

### Script Structure

```sql
-- Trigger PostgREST reload
NOTIFY pgrst, 'reload schema';

-- Verify columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
AND column_name IN ('location', 'industry', 'overview', 'display_id', 'updated_by');
```

### Usage Pattern
1. Run database migration (ALTER TABLE, etc.)
2. Execute `supabase/refresh-schema-cache.sql` in Supabase SQL Editor
3. Verify output shows expected columns
4. Wait 5-10 seconds for cache to fully reload
5. Retry API operations

## Decisions Made

### 1. SQL Script over CLI Command
**Decision:** Provide SQL script to run in Supabase SQL Editor
**Rationale:**
- Direct database access available in Supabase dashboard
- No local CLI setup required
- Same pattern as migrations
- Can be version controlled

**Alternative considered:** Document CLI command `supabase db reset --linked`
**Why not:** Too destructive for production, requires local Supabase CLI

### 2. Include Verification Queries
**Decision:** Add SELECT queries after NOTIFY command
**Rationale:**
- Confirms columns actually exist before blaming cache
- Provides expected output for comparison
- Self-documenting verification process

## Deviations from Plan

None - plan executed exactly as written.

## File Changes

### Created
- `supabase/refresh-schema-cache.sql` - 46 lines, PostgREST cache refresh with verification

### Modified
- `CLAUDE.md` - Added schema refresh command to Common Commands section

## Next Phase Readiness

### Enables
- **Plan 01-02 (Client Details Page)** - Can now use location, industry, overview fields
- **All future schema changes** - Established pattern for cache refresh

### Dependencies Satisfied
- BUG-01 fix prepared (user will execute the script manually)
- PostgREST cache refresh process documented

### Blockers Removed
- Client creation will work once user runs the script
- SELECT queries will return new columns after refresh

### Open Items
- **User action required:** Must run `supabase/refresh-schema-cache.sql` in Supabase SQL Editor
- **Verification needed:** After running script, test client creation with location field

## Testing & Validation

### Verification Performed
- ✅ Script file exists at correct path
- ✅ Contains NOTIFY pgrst command
- ✅ Includes verification queries for clients table
- ✅ Documentation added to CLAUDE.md

### Expected Behavior After Script Execution
1. PostgREST schema cache clears
2. New columns recognized in API requests
3. INSERT operations with location/industry/overview succeed
4. SELECT queries return all fields including new ones

### Validation Steps for User
1. Open Supabase SQL Editor
2. Paste contents of `supabase/refresh-schema-cache.sql`
3. Execute script
4. Verify output shows 5 columns for clients table
5. Test client creation via app with location field

## Performance Impact

- **Script execution:** <1 second
- **Cache reload:** 5-10 seconds for full propagation
- **No performance degradation:** NOTIFY is lightweight, schema cache improves query performance

## Lessons Learned

### What Went Well
- Clear problem definition led to focused solution
- Verification queries catch migration issues vs cache issues
- Documentation in CLAUDE.md ensures future developers follow pattern

### Improvements for Next Time
- Could add automated test that verifies PostgREST recognizes new columns
- Consider if Supabase provides hooks to auto-refresh schema after migrations

### Pattern Established
- **After every DDL migration:** Run schema cache refresh
- **Before testing new columns:** Wait 5-10 seconds post-refresh
- **When API errors occur:** Check if schema cache needs refresh before debugging code

## References

- [PostgREST Schema Cache Documentation](https://postgrest.org/en/stable/schema_cache.html)
- Migration 002: `supabase/migrations/002_comprehensive_update.sql`
- BUG-01 issue (schema cache not refreshing after migration)
