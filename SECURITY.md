# Security and Deployment Runbook

Written for the engineer deploying this change and for whoever maintains the
Supabase project afterwards.

This release adds the Company Documents library, replaces the never-expiring
session with enforced idle and absolute timeouts, and closes a set of findings
from a review of migrations 002 to 068.

**Read the ordering section before you deploy. Two migrations must land before
the frontend, and one of them aborts unless Supabase Vault is enabled.**

---

## 1. Deployment order

```
1. Enable Supabase Vault        Dashboard > Integrations > Vault
2. Apply migrations 067 - 070   in numeric order
3. Run refresh-schema-cache.sql Supabase SQL Editor
4. Set the Edge Function env vars (section 3)
5. Redeploy the Edge Functions  (section 3)
6. Push the auth config         npx supabase config push
7. Deploy the frontend          vercel --prod
```

Migration 070 revokes `SELECT` on the password columns and moves the password
manager onto RPCs. Between step 2 and step 7 the **old** password-manager UI
will fail to load credentials. Keep the gap short, or deploy the frontend first
to a preview URL and promote it immediately after the migration.

Nothing else in the app is affected by the gap.

### Migrations in this release

| File | What it does | Reversible |
|---|---|---|
| `067_company_documents.sql` | New tables for the SOP / protocol library, version history, access log, acknowledgements | Yes, drop the four tables |
| `068_session_security.sql` | Per-tenant session policy, auth event log, `get_effective_session_policy()` | Yes |
| `069_security_hardening.sql` | `tenant_id` immutability triggers, role-escalation fixes, `search_path` pinning, grant revokes, storage limits | Partly. The `search_path` pinning and the revokes are safe to keep; the triggers can be dropped |
| `070_password_manager_encryption.sql` | Encrypts stored credentials, revokes column access, adds the credential access log | **No.** It destroys the plaintext. Take a database backup first |

### Before applying 070

Take a backup. The migration encrypts every credential and then sets the
plaintext column to `NULL`. If the Vault key is later lost, the credentials are
unrecoverable. That is the point of the change, but it means the key matters:

- The key lives in Vault as `lineup_password_manager_key`.
- Vault keeps it encrypted under a root key held outside Postgres, so a database
  dump on its own does not yield the credentials.
- Rotating the key requires re-encrypting every row. There is no helper for that
  yet.

If Vault is not enabled, migration 070 raises an exception and changes nothing,
rather than falling back to a key stored in an ordinary table, which would give
no protection at all.

---

## 2. Verifying the migrations

Each migration ends with verification queries. The ones that matter:

**069** — all four should return zero rows:

```sql
-- SECURITY DEFINER functions with an unpinned search_path
-- UPDATE policies with no WITH CHECK
-- tenant-scoped tables missing the immutability trigger
-- policies matching on role without status = 'active'
```

The fourth query is expected to return a handful of rows. See section 6.

**070** — the first two must be `0`, and the third must return no rows:

```sql
SELECT COUNT(*) FROM passwords WHERE password IS NOT NULL;                 -- 0
SELECT COUNT(*) FROM passwords
  WHERE deleted_at IS NULL AND password_encrypted IS NULL;                 -- 0
SELECT grantee, privilege_type, column_name
  FROM information_schema.column_privileges
  WHERE table_name = 'passwords'
    AND column_name IN ('password', 'password_encrypted')
    AND grantee IN ('authenticated', 'anon');                              -- no rows
```

Then confirm from the app that revealing a credential works and writes a row to
`password_access_log`.

---

## 3. Edge Function environment variables

Set these per function in Dashboard > Edge Functions > *function* > Secrets,
then redeploy.

| Variable | Functions | Required | Purpose |
|---|---|---|---|
| `ALLOWED_ORIGINS` | all four | Recommended | Comma-separated browser origins, e.g. `https://lineup.vercel.app`. **If unset, CORS falls back to `*` and logs a warning**, so the wildcard is not actually removed until you set this |
| `ALLOW_VERCEL_PREVIEWS` | all four | Optional | `true` also allows any `*.vercel.app` origin |
| `WEBHOOK_SECRET` | `send-notification`, `send-waitlist-welcome`, `run-lead-automation` | Optional | Only needed for a caller that cannot present the service-role key |
| `SUPABASE_ANON_KEY` | all four | Required | Used to build a caller-scoped client so RLS applies when verifying a user |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

Redeploy:

```bash
npx supabase functions deploy send-notification
npx supabase functions deploy send-waitlist-welcome
npx supabase functions deploy run-lead-automation
npx supabase functions deploy admin-create-user
npx supabase functions deploy admin-reset-password --no-verify-jwt
```

The authorization checks are inside the handlers and compare the bearer token
against the function's own copy of the service-role key, so they do not depend
on the platform's `verify_jwt` flag. `--no-verify-jwt` on
`admin-reset-password` therefore remains safe.

### Existing callers keep working

The database notification triggers (`pg_net`) and the lead-automation cron job
already send `Authorization: Bearer <service_role_key>`, which the new guards
accept as proof of a trusted internal caller. **No trigger or cron changes are
needed.** The public anon key does not satisfy the check, which is what closes
the hole.

---

## 4. Session behaviour

Sessions previously persisted in `localStorage` with silent token refresh, so a
signed-in browser stayed signed in indefinitely. Two limits now apply, both
coordinated across browser tabs:

- **Idle timeout**, default 30 minutes. Reset by mouse, keyboard, touch or focus
  activity in any tab.
- **Absolute lifetime**, default 12 hours from sign-in. Activity does **not**
  extend it. A token refresh does not extend it either, which was the specific
  behaviour that kept sessions alive forever.

A countdown dialog appears 60 seconds before sign-out. "Stay signed in" is
offered for the idle timeout and withheld for the absolute cap, because activity
cannot extend the latter.

Sign-out calls `signOut({ scope: 'global' })`, which revokes the refresh token
server-side, so a token copied out of the browser cannot be replayed afterwards.

An OrgAdmin changes the limits at **Settings > Security > Session Policy**.
Values are stored per tenant in `tenant_security_settings`. A user who belongs
to more than one tenant gets the strictest of their tenants' policies.

"Keep me signed in on this device" on the login page swaps the absolute cap for
`remember_device_days` (default 14). The idle timeout still applies. An OrgAdmin
can disable the option entirely.

`inactivity_timeout` and `timebox` in `supabase/config.toml` are the server-side
backstop, deliberately looser than the per-tenant policy. They cut off a stolen
refresh token being replayed by a script that never loads the client.

---

## 5. Company Documents

A tenant-level library for SOPs, protocols, processing guides and policies, at
`/company-documents`. It sits outside the Client > Project > Phase > Set
hierarchy because these documents belong to the company, not to a client.

**Visible to the whole team, not just admins.** That is deliberate: a protocol
nobody can open is not a protocol. Confidentiality is per document:

| Level | Who can read it |
|---|---|
| Public, Internal | Any active `org_admin` or `org_user` in the tenant |
| Restricted, Confidential | `org_admin`, `sys_admin`, the document owner, the author |

`client_user` (portal) accounts can never read company documents, at any level.

### View-only enforcement

Documents default to `allow_download = false`. For such a document:

- The file is fetched with a signed URL valid for 120 seconds, then held as an
  in-memory blob URL bound to that browser tab.
- PDFs render with the browser's viewer chrome suppressed (`#toolbar=0`), so the
  built-in download and print buttons are not presented.
- Right-click, drag, text selection, and Ctrl/Cmd+S and Ctrl/Cmd+P are
  intercepted.
- A print stylesheet blanks the viewer, so printing the page produces a notice
  instead of the document.
- An optional watermark overlays the reader's email address and the current time.
- No download URL is ever issued: `getDownloadUrl` throws before contacting
  storage.

**Be clear with users about what this is.** It is strong deterrence and a
complete audit trail, not DRM. Specifically:

- A screenshot or a phone camera still works. The watermark is what makes that
  attributable.
- Firefox's built-in PDF reader ignores `#toolbar=0` and shows its own download
  button. Chrome, Edge and Safari honour it.
- Someone with developer tools can reach the blob.

Removing those gaps entirely would mean rasterising each page server-side and
serving images, which is a much larger change. The access log is the control
that makes misuse detectable.

### Audit trail

`company_document_access_log` records every view, download, blocked download and
blocked print, with the user and the user agent. It has no `UPDATE` or `DELETE`
policy, so no tenant user can alter or erase it, including an OrgAdmin. The log
is on the document's **Access Log** tab.

Replacing a document's file automatically archives the previous file into
`company_document_versions`.

### Upload rules

Enforced in three places so the app's own validation cannot be bypassed:

- `src/lib/companyDocuments.ts` — client-side MIME and extension allowlist, with
  both signals required to agree, and a 50 MB cap.
- The `documents` bucket — `file_size_limit` and `allowed_mime_types` set in
  migration 069.
- Storage RLS — path must start with the caller's `tenant_id` (migration 029).

SVG and HTML are excluded on purpose: both execute script when served inline
from the storage origin. Object keys are generated UUIDs, so a crafted filename
cannot traverse out of the tenant folder.

---

## 6. Known remaining items

Honest list of what this release did **not** close.

### Policies matching on role without `status = 'active'`

A suspended or removed tenant member keeps the access these grant. The worst
case, a global `sys_admin` policy on `support_tickets` that ignored status, is
fixed. The remainder are within-tenant and are listed by the last verification
query in migration 069. The fix for each is to route the check through
`public.user_has_role_in_tenant()`, which is status-aware. They were left alone
rather than rewritten blind.

Affected migrations: `002`, `011`, `015`, `025`, `026`, `028`.

### `xlsx` has no patched release on npm

Used by the bulk upload and export features. The npm package is stuck at 0.18.5
with a prototype-pollution and ReDoS advisory; the maintained build is published
only on the SheetJS CDN. Options: install from the CDN tarball, or move
spreadsheet parsing server-side. Until then, treat spreadsheet upload as a
trusted-input path.

### Tailwind CSS advisory chain

`tailwindcss` 3.4.19 and its transitive `braces`, `chokidar`, `fast-glob` and
`micromatch` carry ReDoS advisories, resolvable only by upgrading to Tailwind
v4, which is a breaking change to every stylesheet. All four are **build-time
only** and do not ship in the bundle. Deliberately deferred.

### No rate limiting on the admin Edge Functions

`admin-create-user` and `admin-reset-password` authorise correctly but have no
per-caller budget, so a compromised admin session could enumerate or churn
users. The `checkRateLimit` helper in `supabase/functions/_shared/security.ts`
is ready to apply.

### Email-keyed login rate limiting can be used to lock someone out

`check_rate_limit` keys on the email address, so an attacker can deliberately
trip the limiter for a known address and block that person for the block window.
The self-service bypass is fixed (the function no longer clears failure history
on a client-asserted success), but keying on the address is inherent to the
design. The per-IP limits in `supabase/config.toml` are the mitigation.

### Password key rotation

There is no helper to rotate `lineup_password_manager_key` and re-encrypt. Write
one before it is needed.

### MFA is available but not required

`supabase/config.toml` enables TOTP enrolment. Nothing enforces it. Requiring it
for `org_admin` accounts is worth doing: those accounts hold the password manager
and the whole document library.

---

## 7. What changed, by file

### New

| Path | Purpose |
|---|---|
| `src/lib/sessionPolicy.ts` | Idle and absolute session limits, cross-tab markers |
| `src/hooks/useSessionTimeout.ts` | Enforcement loop |
| `src/hooks/useSessionPolicy.ts` | Reads the tenant's effective policy |
| `src/components/providers/SessionTimeoutProvider.tsx` | Countdown dialog |
| `src/components/settings/SessionPolicyCard.tsx` | OrgAdmin controls |
| `src/lib/sanitize.ts` | DOMPurify wrapper for stored rich text |
| `src/lib/urlSafety.ts` | `safeHttpUrl`, `escapePostgrestValue` |
| `src/lib/clipboard.ts` | `copySecret` with automatic clearing |
| `src/lib/companyDocuments.ts` | Upload validation and option lists |
| `src/services/api/companyDocuments.ts` | Company document API |
| `src/services/api/sessionSecurity.ts` | Session policy and auth audit API |
| `src/components/shared/SecureDocumentViewer.tsx` | In-app view-only viewer |
| `supabase/functions/_shared/security.ts` | Shared Edge Function guards |
| `supabase/config.toml` | Auth settings under version control |

### Changed, security-relevant

| Path | Change |
|---|---|
| `vercel.json` | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, CORP |
| `src/services/supabase.ts` | PKCE flow, guard against a service-role key in the browser bundle |
| `src/hooks/useAuth.ts` | Session start marker, hardened `returnTo`, login audit event |
| `src/components/providers/AuthProvider.tsx` | Expiry check on boot; a token refresh no longer extends the absolute lifetime |
| `src/services/api/auth.ts` | `signOut({ scope: 'global' })`, password-change audit event |
| `src/services/api/passwords.ts` | Secrets no longer sent to the browser; reveal is one row at a time and logged |
| `src/services/api/documents.ts` | MIME and size allowlist, 120-second signed URLs, `noopener` on the legacy download |
| `src/components/shared/RichTextEditor.tsx`, `NotesPanel.tsx` | Stored HTML sanitized before render |
| `src/components/shared/GlobalSearch.tsx`, `src/services/api/notifications.ts` | PostgREST filter values escaped |
| `src/pages/admin/AdminLoginPage.tsx` | Role read from `get_user_highest_role`, not a non-existent `profile.role` |

### CSP note

The policy in `vercel.json` pins `connect-src` to the project's Supabase
hostname. **If the Supabase project reference changes, update it or the app will
fail to reach the API.** `style-src` allows `'unsafe-inline'` because Tailwind
and Radix inject inline styles; `frame-src` allows `blob:` for the PDF viewer.
