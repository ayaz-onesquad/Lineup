import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Local aliases for use within this file
const supabaseUrl = SUPABASE_URL
const supabaseAnonKey = SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

/**
 * Guard against a service-role key ever reaching the browser bundle. A service
 * role JWT carries `"role":"service_role"` and bypasses every RLS policy, so
 * shipping one to the client would expose all tenants' data.
 */
function assertNotServiceRoleKey(key: string): void {
  try {
    const [, payload] = key.split('.')
    if (!payload) return
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (decoded?.role === 'service_role') {
      throw new Error(
        'VITE_SUPABASE_ANON_KEY contains a service_role key. This bypasses all RLS ' +
          'and must never be exposed to the browser. Use the anon/publishable key.'
      )
    }
  } catch (err) {
    // Re-throw our own assertion; ignore parse failures for non-JWT key formats
    // (Supabase publishable keys are not JWTs).
    if (err instanceof Error && err.message.includes('service_role')) throw err
  }
}

assertNotServiceRoleKey(supabaseAnonKey)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // PKCE keeps the authorization code useless without the client-held
    // verifier, which matters for the email magic-link / recovery flows.
    flowType: 'pkce',
    // NOTE: storageKey is deliberately left at the Supabase default. Changing
    // it would orphan existing token entries in localStorage (leaving valid
    // refresh tokens behind) and sign every user out on deploy.
  },
  global: {
    headers: {
      'x-application-name': 'lineup-web',
    },
  },
})

// Helper function to get current user
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Helper function to get current session
export const getCurrentSession = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
