// Edge Function: Admin Create User
// Allows OrgAdmins and SysAdmins to create new users without affecting the current browser session.
// Uses the service_role key (server-side only) to call supabase.auth.admin.createUser(),
// which is the correct API for admin user creation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  email: string
  password: string
  fullName: string
  phone?: string
  timezone?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User client - for verifying the caller's identity and role
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verify the caller is authenticated
    const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser()
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if the caller is an org_admin or sys_admin
    const { data: callerRole, error: roleError } = await userClient.rpc('get_user_highest_role', {
      p_user_id: callerUser.id,
    })

    if (roleError) {
      console.error('Error checking role:', roleError)
      return new Response(
        JSON.stringify({ error: 'Failed to verify user role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (callerRole !== 'org_admin' && callerRole !== 'sys_admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only OrgAdmins and SysAdmins can create users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the request body
    const body: RequestBody = await req.json()
    const { email, password, fullName, phone, timezone } = body

    // Validate required inputs
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!password || typeof password !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid password' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!fullName || typeof fullName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid fullName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin client - uses service_role key to create users without session side effects
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Create the user using the admin API - this does NOT affect the caller's session
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // Mark email as confirmed - admin-created users skip email verification
      user_metadata: {
        full_name: fullName,
        phone: phone || null,
        timezone: timezone || null,
      },
    })

    if (createError) {
      console.error('Error creating user:', createError)
      // Map known Supabase admin API errors to user-friendly messages
      if (createError.message.includes('already been registered') || createError.message.includes('already exists')) {
        return new Response(
          JSON.stringify({ error: 'A user with this email already exists.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${createError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: 'User creation returned no user data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create the user profile using the admin client (bypasses RLS)
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .upsert({
        user_id: newUser.user.id,
        full_name: fullName,
      })
      .select()
      .single()

    if (profileError) {
      console.error('Failed to create user profile:', profileError)
      // User was created in auth but profile failed. Return the userId so the caller
      // can still add them to the tenant. The profile will be created on first login.
      return new Response(
        JSON.stringify({
          userId: newUser.user.id,
          profile: null,
          warning: 'User created but profile setup failed. Profile will be created on first login.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        userId: newUser.user.id,
        profile,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
