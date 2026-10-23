import type { BrowserContext } from '@playwright/test'

/**
 * Mock Supabase for layout tests.
 *
 * Seeds a fake session in localStorage and answers every Supabase request
 * from fixture rows, so authenticated pages render without a real account or
 * network. Names, emails and URLs are deliberately long: the point is to
 * provoke overflow, not to look realistic.
 *
 * Rows are generic (one shape for every table, with the fields most pages
 * read). Pages that need a more specific shape may hit their error boundary;
 * the spec reports that as a skip rather than a layout pass.
 */

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const MOCK_IDS = {
  tenant: U(1),
  user: U(2),
  profile: U(3),
  client: U(10),
  project: U(20),
  phase: U(30),
  sets: [U(40), U(41), U(42)],
  pitches: [U(50), U(51)],
  requirements: [U(60), U(61), U(62), U(63)],
  generic: (n: number) => U(900 + n),
}

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

const LONG = 'Quarterly Brand Refresh Campaign for Northwind Regional Healthcare Partners'

export async function installSupabaseMock(context: BrowserContext, supabaseUrl: string) {
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  const { tenant: TENANT, user: USER, profile: PROFILE, client: CLIENT, project: PROJECT, phase: PHASE } = MOCK_IDS
  const SETS = MOCK_IDS.sets
  const PITCHES = MOCK_IDS.pitches

  const exp = Math.floor(Date.now() / 1000) + 86400 * 30
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, exp, role: 'authenticated', tenant_id: TENANT })}.sig`
  const user = {
    id: USER,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'pat.example@agency-example.com',
    app_metadata: { tenant_id: TENANT },
    user_metadata: { full_name: 'Pat Example' },
    created_at: day(-100),
  }
  const session = { access_token: jwt, refresh_token: 'mock', token_type: 'bearer', expires_in: 86400 * 30, expires_at: exp, user }

  const tenant = { id: TENANT, name: 'Acme Creative Agency International', slug: 'acme', status: 'active', created_at: day(-300) }
  const profile = {
    id: PROFILE, user_id: USER, full_name: 'Pat Example', first_name: 'Pat', last_name: 'Example',
    email: user.email, avatar_url: null, role: 'org_admin', tenant_id: TENANT, is_active: true,
  }
  const client = { id: CLIENT, name: 'Northwind Regional Healthcare Partners Group', company_name: 'Northwind Regional Healthcare Partners Group' }
  const STATUSES = ['active', 'on_deck', 'past_due', 'future']

  const row = (id: string, i: number, extra: Record<string, unknown> = {}) => ({
    id, display_id: 1000 + i, tenant_id: TENANT,
    name: `${LONG} ${i + 1}`, title: `${LONG} — deliverable ${i + 1}`,
    description: '<p>Long description text that keeps going so wrapping behaviour shows on phones.</p>',
    status: STATUSES[i % 4], computed_status: STATUSES[i % 4],
    priority: (i % 3) + 1, is_task: true, completion_percentage: 40,
    expected_start_date: day(-10), expected_end_date: day(20), expected_due_date: day(i % 2 ? -3 : 12), actual_due_date: null,
    key_start_date: day(-10), key_end_date: day(20), key_due_date: day(12),
    client_id: CLIENT, project_id: PROJECT, phase_id: PHASE, clients: client, client, client_name: client.name,
    projects: { id: PROJECT, name: 'Website Redesign and Platform Migration Programme' },
    project_name: 'Website Redesign and Platform Migration Programme',
    phases: { id: PHASE, name: 'Discovery and Research Phase' },
    lead_id: PROFILE, pm_id: PROFILE, assigned_to_id: PROFILE, assigned_to: profile, lead: profile, pm: profile,
    created_by: PROFILE, updated_by: PROFILE, created_by_profile: profile, creator: profile,
    created_at: day(-30), updated_at: day(-1), deleted_at: null,
    email: 'very.long.contact.address@northwind-regional-healthcare.example.com', phone: '+1 (555) 010-2030',
    url: 'https://portal.northwind-regional-healthcare.example.com/a/very/long/path',
    website: 'https://northwind-regional-healthcare.example.com',
    company_name: 'Northwind Regional Healthcare Partners Group',
    first_name: 'Alexandria', last_name: 'Montgomery-Wellington', full_name: 'Alexandria Montgomery-Wellington',
    application_name: 'Google Workspace Admin Console', username: 'admin.account@northwind.example.com', category: 'Infrastructure',
    amount: 125000.5, content: 'A discussion message long enough to wrap across several lines on a phone screen.',
    entity_type: 'set', entity_id: SETS[0], file_name: 'Northwind-brand-guidelines-final-v12-approved.pdf',
    file_size: 2048000, mime_type: 'application/pdf',
    role: 'org_admin', user_id: USER, tenants: tenant, tenant, user_profiles: profile, user_profile: profile,
    health: 'on_track', requirement_type: 'deliverable', note_type: 'meeting',
    lead_name: 'Northwind Regional Healthcare Partners Group', industry: 'Healthcare and Life Sciences', threat_level: 'high',
    stage: 'qualified', type: 'general', severity: 'medium', source: 'referral', visibility: 'internal', reason: 'other',
    subject: 'Cannot export the quarterly report to PDF from the financials page',
    tags: ['branding', 'q3', 'healthcare'], sets: [], pitches: [], requirements: [], contacts: [], documents: [], notes: [],
    triggers: [], channels: ['in_app', 'email'], settings: {}, metadata: {},
    ...extra,
  })

  const tables: Record<string, Record<string, unknown>[]> = {
    tenants: [tenant],
    tenant_users: [row(U(5), 0, { user_id: USER, role: 'org_admin', tenants: tenant, tenant })],
    user_profiles: [profile],
    clients: [0, 1, 2].map((i) => row(U(10 + i), i, { name: `${client.name} ${i + 1}` })),
    sets: SETS.map((id, i) => row(id, i)),
    pitches: PITCHES.map((id, i) => row(id, i, { set_id: SETS[0], sets: { id: SETS[0], name: `${LONG} 1`, clients: client } })),
    requirements: MOCK_IDS.requirements.map((id, i) =>
      row(id, i, {
        pitch_id: i < 2 ? PITCHES[0] : null,
        set_id: i < 3 ? SETS[0] : SETS[1],
        sets: { id: SETS[0], name: `${LONG} 1`, client_id: CLIENT, clients: client },
        pitches: { id: PITCHES[0], name: `${LONG} 1` },
      })
    ),
    support_tickets: [0, 1, 2].map((i) =>
      row(U(80 + i), i, { status: ['open', 'in_progress', 'open'][i], type: ['incident', 'information', 'improvement'][i] })
    ),
  }
  tables.my_work_items = [
    ...tables.sets.map((s) => ({ ...s, item_type: 'set' })),
    ...tables.pitches.map((p) => ({ ...p, item_type: 'pitch' })),
    ...tables.requirements.map((r) => ({ ...r, item_type: 'requirement', name: r.title })),
  ]

  const rpc: Record<string, unknown> = {
    get_user_highest_role: 'org_admin',
    is_sys_admin: false,
    check_tenant_access: true,
    get_effective_session_policy: { idle_timeout_minutes: 600, absolute_timeout_hours: 72 },
  }

  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        /* storage blocked: the app will show the login page */
      }
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const
  )

  await context.route(`${supabaseUrl}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-9/10', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' },
        body: JSON.stringify(body),
      })

    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
      })
    }
    if (path.startsWith('/auth/v1/user')) return json(user)
    if (path.startsWith('/auth/v1/token')) return json(session)
    if (path.startsWith('/auth/v1/')) return json({})
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.split('/').pop() as string
      return json(name in rpc ? rpc[name] : [])
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/').pop() as string
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return json(single ? row(U(999), 0) : [])
      let rows = tables[table] || [0, 1, 2].map((i) => row(U(900 + i * 7 + table.length), i))
      const idFilter = url.searchParams.get('id')
      if (idFilter?.startsWith('eq.')) {
        const id = idFilter.slice(3)
        rows = rows.filter((r) => r.id === id)
        if (rows.length === 0) rows = [row(id, 0)]
      }
      return json(single ? (rows[0] ?? null) : rows)
    }
    return json(path.startsWith('/storage/') ? [] : {})
  })
}
