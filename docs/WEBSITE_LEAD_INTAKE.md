# Website lead intake

`supabase/functions/website-lead-intake` files requests from a business's public website in one LineUp tenant. First user: theonesquad.com, filing into the OneSquad tenant. A request is one of two kinds:

- **Free mock-up** (`kind: "mockup"`): someone wants a homepage mock-up. It becomes a Lead, its Contact, and a Task on the lead to make and send the mock-up.
- **Question** (`kind: "question"`): someone has a question. It becomes a Lead and its Contact, no task.

Either way, the tenant's new-lead recipients get a "New website request" email (template `lead.website`, migration 071). Recipients are set in LineUp under **Settings > Leads** (migration 072): the chosen team members' login emails plus any extra addresses, de-duplicated. When nobody is chosen there, the email goes to `INTAKE_NOTIFY_TO`.

The person who sent the request gets a confirmation email too (v4, template `lead.website.received`, migration 073), sent only from the tenant's own sender. See "Confirmation to the person who sent the request" below.

Leads added any other way (by hand, imports, automations) email the same recipients with the `lead.created` template, sent by the `notify_lead_created` database trigger (migration 072). Website leads are skipped by that trigger, so nobody gets two emails.

## What a request becomes

| Website form | LineUp |
| --- | --- |
| Business name (or the person's name for a question without one) | Lead name |
| Email, phone | Lead email and phone; the Contact's too |
| First and last name | Contact (primary, decision maker), linked through `lead_contacts` |
| Message or question | Lead description: sanitized rich text when `message_format` is `"html"`, otherwise the plain text as one paragraph per line |
| Kind, name, email, phone, business, what they need, mock-up due date, estimate, site | Lead notes (rich text: one `<p><strong>Label:</strong> value</p>` per fact, every value escaped) |
| The estimate's price | Lead estimated value |
| (fixed) | Source `website`, status `new`, "Created By" `Website form`, owner: `INTAKE_USER_ID`'s profile |

For a free mock-up, the Task (a requirement with `sales_lead_id` set and no client, migration 071):

- Title "Mock-up for {business}", with the person, contact details, needs, message, estimate and due date in its description (plain text: task descriptions are plain in LineUp).
- Assigned to the person picked under **Settings > Leads > Assign website mock-up tasks to**, or `INTAKE_USER_ID`'s profile when nobody is picked (or that person is no longer an active member). Assigning sends LineUp's usual `task.assigned` email.
- Urgency and importance high; starts today; due **one business day before** the mock-up is due to the client.
- Shows in the lead's Tasks tab, in My Work and in global tasks.

Website leads do **not** get the waitlist welcome email: `send-waitlist-welcome` skips leads whose `source_automation_name` is `Website form`.

## Set up

1. Apply migrations `071_tasks_on_leads.sql` (tasks on leads, the `lead.website` template), `072_lead_intake_settings.sql` (Settings > Leads, the `lead.created` template and its trigger) and `073_tenant_senders_and_contact_confirmation.sql` (per-tenant senders, the confirmation switch and the `lead.website.received` template). For the trigger's emails, set its Vault secrets and `WEBHOOK_SECRET` on `send-notification` (see "Emails for leads added in LineUp" below).
2. Deploy: `npx supabase functions deploy website-lead-intake --no-verify-jwt` (the function checks its own secret; there is no user JWT on a website form). For v4, apply migration 073 first, then deploy `send-notification` and `send-waitlist-welcome` (they pick the right sender once tenants can have their own), then `website-lead-intake`. An older `send-notification` ignores `require_tenant_sender`, so it must not run alongside the v4 intake.
3. Secrets on the function (Supabase Dashboard > Edge Functions > website-lead-intake > Secrets):
   - `INTAKE_SECRET`: a long random string (for example `openssl rand -hex 32`). Give the same value to the website as `LINEUP_INTAKE_SECRET`.
   - `INTAKE_TENANT_ID`: the tenant's id (`select id, name from tenants;`).
   - `INTAKE_USER_ID`: the login (auth) id of the team member recorded as creator and owner, and the default mock-up assignee.
   - `INTAKE_NOTIFY_TO`: fallback for who gets the new-request email (one address or a comma-separated list), used only when Settings > Leads names nobody.
   - `INTAKE_APP_URL` (optional): LineUp's address for the email's link. Default `https://www.lineupco.io`.
4. On the website (Vercel env vars): `LINEUP_INTAKE_URL=https://zsrtcthepydfxgruagvq.supabase.co/functions/v1/website-lead-intake` and `LINEUP_INTAKE_SECRET` (same as `INTAKE_SECRET`).

## Request

`POST` with `Content-Type: application/json` and `x-intake-secret: <INTAKE_SECRET>`:

```json
{
  "kind": "mockup",
  "first_name": "Maria",
  "last_name": "Lopez",
  "business": "Maple & Rye",
  "email": "maria@example.com",
  "phone": "219-555-0100",
  "needs": ["Website", "Logo"],
  "message": "<p>Our <strong>hours</strong> and a menu.</p>",
  "message_format": "html",
  "estimate": "Website, 1 page\nEstimated build: $1,275",
  "estimate_value": 1275,
  "mockup_due": "Tuesday, October 27",
  "mockup_due_date": "2026-10-27",
  "site": "theonesquad.com"
}
```

`business` is required for a mock-up; a question needs `message` instead. `kind` defaults to `mockup`.

`message_format` (v3) is `"html"` when `message` is rich text. The function keeps only `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `ul`, `ol`, `li`, with no attributes; scripts, styles and comments go with their content, every other tag is removed and its text kept, and the text is escaped again (`supabase/functions/website-lead-intake/richText.ts`, tests in `richText_test.ts`: `npx deno test --no-lock supabase/functions/website-lead-intake/`). The visible text is limited to 2,000 characters. The email gets a plain-text version (tags removed, entities decoded, list items as "- "). Without `message_format`, `message` is plain text, as before.

`201 {"lead_id": "...", "contact_linked": true, "task_id": "..." | null, "notified": 1, "confirmation": "sent" | "skipped" | "failed"}` on success; `400` for a missing or invalid field, `401` for a wrong secret, `429` when rate-limited, `503` when the function's secrets aren't set. A failed contact, task or email is logged and reported in the response but keeps the lead.

## Security

Server-to-server only, behind a constant-time secret check. The tenant and the user come from the function's own secrets and the recipients from the tenant's settings (or the function's secrets), never from the request, so the website can only add leads to its own tenant. Input is length-limited and validated again. Rich text is rebuilt from the allowlist above, and LineUp sanitizes it once more (DOMPurify) when it renders the lead; every value in the notes is escaped. `send-notification` escapes every variable that goes into the email.

## Confirmation to the person who sent the request

After the team's emails, the function sends the `lead.website.received` template to the request's `email`, through `send-notification` with `require_tenant_sender: true`:

| Kind | Subject | Headline | Next line |
| --- | --- | --- | --- |
| Free mock-up | Your free mock-up request is in | We got your request. | Your free homepage mock-up arrives by {mockup_due}. (Without a due date: We will email your free homepage mock-up soon.) |
| Question | We got your question | We got your question. | One of us will reply soon. |

The email says hi by first name, then lists what they sent (business, what they need, their message as plain text, escaped by `send-notification`), "Questions? Just reply to this email." and the tenant's name with the sender's reply-to address. It is black and white with one small accent and carries only the tenant's name: no LineUp branding.

- **Only from the tenant's own sender.** `send-notification` looks for an active `notification_email_config` row with the tenant's `tenant_id`. Without one it sends nothing, logs the attempt as `skipped` with `no_tenant_sender`, and the intake reports `"confirmation": "skipped"`. It never falls back to LineUp's global sender for this email.
- **Off switch.** Settings > Leads > "Email a confirmation to the person who sent the request" (`lead_intake_settings.confirm_to_contact`, on by default). Off: nothing is sent and the response says `skipped`.
- **Never fails the request.** A failed confirmation is logged and reported as `"confirmation": "failed"`; the lead, contact and task are already saved.

### Per-tenant senders

`notification_email_config` holds LineUp's global sender (`tenant_id` NULL, edited in SysAdmin > Notifications) and at most one active sender per tenant. When a tenant has an active sender, `send-notification` uses it for **all** of that tenant's email (new-request and new-lead emails, task emails, the confirmation); other tenants keep the global sender. `send-waitlist-welcome` always uses the global sender.

Senders are SysAdmin-only (RLS: every policy is `is_sys_admin()`; no tenant member, org admins included, can read or change one). There is no screen for tenant senders yet; a sysadmin adds one in the SQL editor.

**Before turning a sender on, verify its domain in the Resend account LineUp sends with** (Resend > Domains, add the domain and its DNS records, wait for "Verified"). Resend rejects mail from an unverified domain, and every email for that tenant would fail.

Add OneSquad's sender (off first, then on once theonesquad.com is verified in Resend):

```sql
insert into notification_email_config (tenant_id, from_name, from_email, reply_to_email, provider, is_active)
select id, 'OneSquad', 'team@theonesquad.com', 'team@theonesquad.com', 'resend', false
from tenants where name = 'OneSquad';

-- after theonesquad.com shows Verified in Resend:
update notification_email_config set is_active = true
where tenant_id = (select id from tenants where name = 'OneSquad');
```

Check it: `select t.name, c.from_name, c.from_email, c.reply_to_email, c.is_active from notification_email_config c left join tenants t on t.id = c.tenant_id;`. To stop using it, set `is_active = false`: the tenant's email goes back to the global sender, and confirmations are skipped.

## Emails for leads added in LineUp

`notify_lead_created` (migration 072) runs after every insert into `leads`. It skips website leads (`source_automation_name = 'Website form'`), tenants with no Settings > Leads row, and tenants that turned off "Email for leads added in LineUp too". It calls `send-notification` through `pg_net` with the shared webhook secret, never the service-role key. Secrets, in Supabase Vault (Dashboard > Integrations > Vault):

| Vault secret | Required | Value |
| --- | --- | --- |
| `lineup_supabase_url` | yes | `https://zsrtcthepydfxgruagvq.supabase.co` |
| `lineup_notification_webhook_secret` | yes | The same value as the `WEBHOOK_SECRET` secret on the `send-notification` function |
| `lineup_supabase_anon_key` | when `send-notification` verifies JWTs (the default) | The project's public anon key, sent as the bearer so the functions gateway lets the call through |
| `lineup_app_url` | no | LineUp's address for the email's link; default `https://www.lineupco.io` |

Without the required secrets the trigger logs a warning and sends nothing; the lead is always saved.
