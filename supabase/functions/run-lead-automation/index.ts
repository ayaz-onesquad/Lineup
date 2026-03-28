// Edge Function: Run Lead Automation
// Triggers an Apify Google Places scraper and creates leads from results

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  automation_id: string
  triggered_by: string
  trigger_type: 'manual' | 'scheduled'
}

interface LeadAutomation {
  id: string
  tenant_id: string
  name: string
  search_query: string
  location: string
  max_leads: number
  filter_no_website: boolean | null
  filter_website_required: boolean | null
  filter_min_rating: number | null
  filter_category: string | null
}

interface GooglePlacesResult {
  title: string
  description?: string
  phone?: string
  website?: string
  address?: string
  city?: string
  state?: string
  categoryName?: string
  totalScore?: number
  reviewsCount?: number
  placeId?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const apifyToken = Deno.env.get('APIFY_API_TOKEN')

  // Validate Apify token FIRST - before creating any records
  if (!apifyToken) {
    console.error('[run-lead-automation] APIFY_API_TOKEN not configured')
    return new Response(
      JSON.stringify({
        error: 'APIFY_API_TOKEN secret is not configured. ' +
               'Add it in Supabase Dashboard → Edge Functions → Secrets.'
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Admin client - uses service role key to bypass RLS
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

  let runId: string | null = null
  let automation: LeadAutomation | null = null

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the request body
    const body: RequestBody = await req.json()
    const { automation_id, triggered_by, trigger_type } = body

    // Validate inputs
    if (!automation_id) {
      return new Response(
        JSON.stringify({ error: 'Missing automation_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the automation config
    const { data: automationData, error: fetchError } = await adminClient
      .from('lead_automations')
      .select('*')
      .eq('id', automation_id)
      .is('deleted_at', null)
      .single()

    if (fetchError || !automationData) {
      console.error('[run-lead-automation] Error fetching automation:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Automation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    automation = automationData as LeadAutomation

    // Check if automation is active
    if (!automation) {
      return new Response(
        JSON.stringify({ error: 'Automation is inactive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create a run record
    const { data: runData, error: runError } = await adminClient
      .from('automation_runs')
      .insert({
        tenant_id: automation.tenant_id,
        automation_id: automation.id,
        trigger_type,
        triggered_by: triggered_by || null,
        status: 'running',
      })
      .select()
      .single()

    if (runError) {
      console.error('[run-lead-automation] Error creating run record:', runError)
      throw runError
    }
    runId = runData.id

    // Build the Apify input with correct website filter values
    // Apify compass~crawler-google-places accepts:
    // - "withWebsite" = only businesses that HAVE a website
    // - "withoutWebsite" = only businesses that do NOT have a website
    // - omit = no filter, return all
    const apifyInput: Record<string, unknown> = {
      searchStringsArray: [automation.search_query],
      locationQuery: automation.location,
      maxCrawledPlacesPerSearch: automation.max_leads,
      language: 'en',
      skipClosedPlaces: false,
    }

    // Website filter: pass the correct Apify enum value
    // "withoutWebsite" = businesses with no website (the agency's target)
    // "withWebsite" = businesses that already have a website
    if (automation.filter_no_website === true) {
      apifyInput.website = 'withoutWebsite'
    } else if (automation.filter_no_website === false && automation.filter_website_required === true) {
      apifyInput.website = 'withWebsite'
    }
    // If neither filter is set, omit the website field = show all

    // Optional filters
    if (automation.filter_min_rating) {
      apifyInput.minimumStars = automation.filter_min_rating
    }
    if (automation.filter_category) {
      apifyInput.categoryFilterWords = [automation.filter_category]
    }

    console.log('[run-lead-automation] Calling Apify with input:', JSON.stringify(apifyInput))
    console.log(
      '[run-lead-automation] Apify token loaded:',
      apifyToken ? `${apifyToken.substring(0, 8)}...` : 'NOT SET'
    )

    // Call Apify actor with 120s timeout (Supabase Edge Functions have 150s limit)
    const apifyResponse = await fetch(
      'https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?timeout=120',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apifyToken}`,
        },
        body: JSON.stringify(apifyInput),
      }
    )

    console.log('[run-lead-automation] Apify response status:', apifyResponse.status)

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text()
      console.error('[run-lead-automation] Apify error:', errorText)
      throw new Error(`Apify API error ${apifyResponse.status}: ${errorText}`)
    }

    const places: GooglePlacesResult[] = await apifyResponse.json()
    console.log(`[run-lead-automation] Apify returned ${places.length} results`)

    // Post-process: enforce no-website filter at application level too
    // This is a safety net - Apify occasionally returns a result that slips through
    const filtered = automation.filter_no_website
      ? places.filter(p => !p.website || p.website.trim() === '')
      : places

    console.log(`[run-lead-automation] After post-filter: ${filtered.length} results`)

    // Check for existing leads to avoid duplicates (by phone or placeId)
    const phones = filtered.map(p => p.phone).filter(Boolean)
    const { data: existingLeads } = await adminClient
      .from('leads')
      .select('phone')
      .eq('tenant_id', automation.tenant_id)
      .in('phone', phones)
      .is('deleted_at', null)

    const existingPhones = new Set((existingLeads || []).map(l => l.phone))

    // Create leads
    let leadsCreated = 0
    let leadsSkipped = 0

    for (const place of filtered) {
      // Skip if phone already exists
      if (place.phone && existingPhones.has(place.phone)) {
        leadsSkipped++
        continue
      }

      const leadData = {
        tenant_id: automation.tenant_id,
        lead_name: place.title,
        description: place.description || null,
        phone: place.phone || null,
        website: place.website || null,
        address: place.address || null,
        city: place.city || null,
        state: place.state || null,
        industry: place.categoryName || null,
        status: 'new',
        source: 'cold_outreach',
        notes: `Generated by automation: ${automation.name}. Rating: ${place.totalScore || 'N/A'}, Reviews: ${place.reviewsCount || 0}`,
      }

      const { error: insertError } = await adminClient
        .from('leads')
        .insert(leadData)

      if (insertError) {
        console.error('[run-lead-automation] Error inserting lead:', insertError)
        leadsSkipped++
      } else {
        leadsCreated++
        // Add phone to set to prevent duplicates within this run
        if (place.phone) existingPhones.add(place.phone)
      }
    }

    // Update run record
    await adminClient
      .from('automation_runs')
      .update({
        status: leadsCreated > 0 ? 'success' : (leadsSkipped > 0 ? 'partial' : 'success'),
        completed_at: new Date().toISOString(),
        leads_found: filtered.length,
        leads_created: leadsCreated,
        leads_skipped: leadsSkipped,
      })
      .eq('id', runId)

    // Update automation stats
    await adminClient
      .from('lead_automations')
      .update({
        last_run_at: new Date().toISOString(),
        total_leads_generated: adminClient.rpc('increment_leads_generated', {
          p_automation_id: automation.id,
          p_count: leadsCreated,
        }),
      })
      .eq('id', automation.id)

    // Simpler: just increment directly
    const { data: currentAutomation } = await adminClient
      .from('lead_automations')
      .select('total_leads_generated')
      .eq('id', automation.id)
      .single()

    await adminClient
      .from('lead_automations')
      .update({
        last_run_at: new Date().toISOString(),
        total_leads_generated: (currentAutomation?.total_leads_generated || 0) + leadsCreated,
      })
      .eq('id', automation.id)

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        leads_found: filtered.length,
        leads_created: leadsCreated,
        leads_skipped: leadsSkipped,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[run-lead-automation] Unhandled error:', error)

    // Update run record with error
    if (runId) {
      await adminClient
        .from('automation_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', runId)
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
