# Phase 1: Foundation Fixes - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix critical blocking bugs (PostgREST schema cache, tenant isolation) and update ClientForm with Industry and Location fields. This phase makes clients creatable with complete information.

</domain>

<decisions>
## Implementation Decisions

### Bug Fixes (Execution Order)
- Fix schema cache error FIRST before any UI work
- PostgREST must recognize all columns on clients table (including location)
- Tenant isolation must auto-inject tenant_id from auth context on all INSERTs

### Industry Field
- Searchable dropdown using Combobox component
- Predefined list of common agency industries: SaaS, E-commerce, Healthcare, Fintech, Real Estate, Education
- Allow "Other" option with custom text entry if industry not listed
- Required field

### Location Field
- Single text field (not structured City/State/Country)
- Format hint: "City, Country" or "State, USA"
- Optional field (not required)

### Form Layout
- **Top Row:** Name and Status (side-by-side)
- **Middle Row:** Industry and Location (side-by-side)
- **Bottom:** Overview (full-width textarea)

### Tenant ID Handling
- Form auto-injects tenant_id from user's session during submission
- User never sees or selects tenant_id manually

### Claude's Discretion
- Exact Combobox implementation details
- Industry list can be extended if obvious gaps
- Field validation messages
- Loading states during submission

</decisions>

<specifics>
## Specific Ideas

- Industry dropdown should feel like a standard searchable select with typeahead
- Keep location simple — avoid over-engineering with autocomplete or structured fields
- Match existing form patterns in the codebase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-fixes*
*Context gathered: 2026-02-05*
