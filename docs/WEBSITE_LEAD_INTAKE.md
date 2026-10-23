# Website lead intake

`supabase/functions/website-lead-intake` files requests from a business's public website in one LineUp tenant. First user: theonesquad.com, filing into the OneSquad tenant. A request is one of two kinds:

- **Free mock-up** (`kind: "mockup"`): someone wants a homepage mock-up. It becomes a Lead, its Contact, and a Task on the lead to make and send the mock-up.
- **Question** (`kind: "question"`): someone has a question. It becomes a Lead and its Contact, no task.

Either way, everyone in `INTAKE_NOTIFY_TO` gets a "New website request" email (template `lead.website`, migration 071).

## What a request becomes

| Website form | LineUp |
| --- | --- |
| Business name (or the person's name for a question without one) | Lead name |
| Email, phone | Lead email and phone; the Contact's too |
| First and last name | Contact (primary, decision maker), linked through `lead_contacts` |
| Message or question | Lead description (plain text) |
| Kind, name, email, phone, business, what they need, mock-up due date, estimate, site | Lead notes (plain text, one per line) |
| The estimate's price | Lead estimated value |
| (fixed) | Source `website`, status `new`, "Created By" `Website form`, owner and assignee: `INTAKE_USER_ID`'s profile |

For a free mock-up, the Task (a requirement with `sales_lead_id` set and no client, migration 071):

- Title "Mock-up for {business}", with the person, contact details, needs, message, estimate and due date in its description.
- Assigned to `INTAKE_USER_ID`'s profile, which sends LineUp's usual `task.assigned` email.
- Urgency and importance high; starts today; due **one business day before** the mock-up is due to the client.
- Shows in the lead's Tasks tab, in My Work and in global tasks.

Website leads do **not** get the waitlist welcome email: `send-waitlist-welcome` skips leads whose `source_automation_name` is `Website form`.

## Set up

1. Apply migration `071_tasks_on_leads.sql` (tasks on leads, the `lead.website` template).
2. Deploy: `npx supabase functions deploy website-lead-intake --no-verify-jwt` (the function checks its own secret; there is no user JWT on a website form).
3. Secrets on the function (Supabase Dashboard > Edge Functions > website-lead-intake > Secrets):
   - `INTAKE_SECRET`: a long random string (for example `openssl rand -hex 32`). Give the same value to the website as `LINEUP_INTAKE_SECRET`.
   - `INTAKE_TENANT_ID`: the tenant's id (`select id, name from tenants;`).
   - `INTAKE_USER_ID`: the login (auth) id of the team member who creates, owns and is assigned the work.
   - `INTAKE_NOTIFY_TO`: who gets the new-request email; one address or a comma-separated list.
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
  "message": "Our hours and a menu.",
  "estimate": "Website, 1 page\nEstimated build: $1,275",
  "estimate_value": 1275,
  "mockup_due": "Tuesday, October 27",
  "mockup_due_date": "2026-10-27",
  "site": "theonesquad.com"
}
```

`business` is required for a mock-up; a question needs `message` instead. `kind` defaults to `mockup`.

`201 {"lead_id": "...", "contact_linked": true, "task_id": "..." | null, "notified": 1}` on success; `400` for a missing or invalid field, `401` for a wrong secret, `429` when rate-limited, `503` when the function's secrets aren't set. A failed contact, task or email is logged and reported in the response but keeps the lead.

## Security

Server-to-server only, behind a constant-time secret check. The tenant, the user and the email recipients come from the function's own secrets, never from the request, so the website can only add leads to its own tenant. Input is length-limited and validated again; LineUp's fields are plain text, and `send-notification` escapes every variable that goes into the email.
