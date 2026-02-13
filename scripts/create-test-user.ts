/**
 * Script to create a test user for Playwright tests
 * Run with: npx tsx scripts/create-test-user.ts
 *
 * Creates: auth user + user_profile + tenant + tenant_user
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const TEST_EMAIL = 'playwright-test@lineup.local'
const TEST_PASSWORD = 'PlaywrightTest123!'
const TEST_ORG_NAME = 'Playwright Test Org'
const TEST_ORG_SLUG = 'playwright-test-org'

async function createTestUser() {
  console.log('Creating test user with full setup...')
  console.log(`Email: ${TEST_EMAIL}`)

  // Step 1: Sign up or sign in
  let userId: string | undefined

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    options: {
      data: {
        full_name: 'Playwright Test User',
      },
    },
  })

  if (signUpError) {
    if (signUpError.message.includes('already registered') || signUpError.message.includes('already exists')) {
      console.log('User already exists, signing in...')
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      })
      if (signInError) {
        console.error('Cannot sign in:', signInError.message)
        process.exit(1)
      }
      userId = signInData.user?.id
    } else {
      console.error('Error creating user:', signUpError.message)
      process.exit(1)
    }
  } else {
    userId = signUpData.user?.id
    console.log('✓ User created')
  }

  if (!userId) {
    console.error('No user ID found')
    process.exit(1)
  }
  console.log(`User ID: ${userId}`)

  // Step 2: Ensure user_profile exists
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (!existingProfile) {
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: userId,
        email: TEST_EMAIL,
        full_name: 'Playwright Test User',
      })
    if (profileError) {
      console.log('Profile creation note:', profileError.message)
    } else {
      console.log('✓ User profile created')
    }
  } else {
    console.log('✓ User profile exists')
  }

  // Step 3: Check if tenant exists
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', TEST_ORG_SLUG)
    .single()

  let tenantId: string

  if (!existingTenant) {
    // Create tenant
    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: TEST_ORG_NAME,
        slug: TEST_ORG_SLUG,
      })
      .select('id')
      .single()

    if (tenantError) {
      console.log('Tenant creation note:', tenantError.message)
      // Try to get existing tenant anyway
      const { data: retryTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', TEST_ORG_SLUG)
        .single()
      if (retryTenant) {
        tenantId = retryTenant.id
      } else {
        console.error('Cannot create or find tenant')
        process.exit(1)
      }
    } else {
      tenantId = newTenant.id
      console.log('✓ Tenant created')
    }
  } else {
    tenantId = existingTenant.id
    console.log('✓ Tenant exists')
  }

  console.log(`Tenant ID: ${tenantId}`)

  // Step 4: Link user to tenant
  const { data: existingLink } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!existingLink) {
    const { error: linkError } = await supabase
      .from('tenant_users')
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        role: 'org_admin',
      })
    if (linkError) {
      console.log('Tenant link note:', linkError.message)
    } else {
      console.log('✓ User linked to tenant as org_admin')
    }
  } else {
    console.log('✓ User already linked to tenant')
  }

  // Sign out
  await supabase.auth.signOut()

  // Update .env file
  const envPath = path.resolve(__dirname, '../.env')
  let envContent = fs.readFileSync(envPath, 'utf-8')

  if (envContent.includes('TEST_USER_EMAIL=')) {
    envContent = envContent.replace(/TEST_USER_EMAIL=.*/, `TEST_USER_EMAIL=${TEST_EMAIL}`)
  } else {
    envContent += `\nTEST_USER_EMAIL=${TEST_EMAIL}`
  }

  if (envContent.includes('TEST_USER_PASSWORD=')) {
    envContent = envContent.replace(/TEST_USER_PASSWORD=.*/, `TEST_USER_PASSWORD=${TEST_PASSWORD}`)
  } else {
    envContent += `\nTEST_USER_PASSWORD=${TEST_PASSWORD}`
  }

  fs.writeFileSync(envPath, envContent)

  console.log('\n✓ Setup complete!')
  console.log(`  TEST_USER_EMAIL=${TEST_EMAIL}`)
  console.log(`  TEST_USER_PASSWORD=${TEST_PASSWORD}`)
  console.log(`  Organization: ${TEST_ORG_NAME}`)
}

createTestUser().catch(console.error)
