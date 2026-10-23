# Website lead intake

`supabase/functions/website-lead-intake` files free mock-up requests from a business's public website as Leads (with a primary Contact) in one LineUp tenant. First user: theonesquad.com, filing into the OneSquad tenant.

## What a request becomes

| Website form | LineUp |
| --- | --- |
| Business name | Lead name |
| Email, phone | Lead email and phone; the Contact's too |
| First and last name | Contact (primary, decision maker), linked through `lead_contacts` |
| Message | Lead description |
| What they need, the free mock-up's due date, the calculator's estimate | Lead notes |
| (fixed) | Source `website`, status `new`, "Created By" `Website form` |

New leads fire LineUp's usual lead notifications. They do **not** get the waitlist welcome email: `send-waitlist-welcome` skips leads whose `source_automation_name` is `Website form`.

## Set up

1. Deploy: `npx supabase functions deploy website-lead-intake --no-verify-jwt` (the function checks its own secret; there is no user JWT on a website form).
2. Secrets on the function (Supabase Dashboard > Edge Functions > website-lead-intake > Secrets):
   - `INTAKE_SECRET`: a long random string (for example `openssl rand -hex 32`). Give the same value to the website as `LINEUP_INTAKE_SECRET`.
   - `INTAKE_TENANT_ID`: the OneSquad tenant's id (`select id, name from tenants;`).
   - `INTAKE_USER_ID`: the user recorded as creator (a OneSquad team member, or a dedicated "Website" user in that tenant).
3. Redeploy `send-waitlist-welcome` so it skips website leads.
4. On the website (Vercel env vars): `LINEUP_INTAKE_URL=https://zsrtcthepydfxgruagvq.supabase.co/functions/v1/website-lead-intake` and `LINEUP_INTAKE_SECRET` (same as `INTAKE_SECRET`).

## Request

`POST` with `Content-Type: application/json` and `x-intake-secret: <INTAKE_SECRET>`:

```json
{
  "first_name": "Maria",
  "last_name": "Lopez",
  "business": "Maple & Rye",
  "email": "maria@example.com",
  "phone": "219-555-0100",
  "needs": ["Website", "Logo"],
  "message": "Our hours and a menu.",
  "estimate": "Static site, 1 page: $300\nPrice: $300",
  "mockup_due": "Friday, October 23",
  "site": "theonesquad.com"
}
```

`201 {"lead_id": "...", "contact_linked": true}` on success; `400` for a missing or invalid field, `401` for a wrong secret, `429` when rate-limited, `503` when the function's secrets aren't set.

## Security

Server-to-server only, behind a constant-time secret check. The tenant and the creating user come from the function's own secrets, never from the request, so the website can only add leads to its own tenant. Input is length-limited and validated again; text bound for rich-text fields is HTML-escaped.
