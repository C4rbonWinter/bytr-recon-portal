import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { CLINIC_CONFIG, getSuperStageByName, getSalespersonName } from '@/lib/pipeline-config'

// Use static Private Integration tokens (don't rotate like OAuth)
function getStaticToken(clinic: string): string {
  switch (clinic) {
    case 'TR01': return process.env.GHL_TOKEN_SG || ''
    case 'TR02': return process.env.GHL_TOKEN_IRV || ''
    case 'TR04': return process.env.GHL_TOKEN_VEGAS || ''
    default: return ''
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for full sync

interface GHLOpportunity {
  id: string
  name: string
  monetaryValue: number
  pipelineStageId: string
  assignedTo: string
  status: string
  source: string
  createdAt: string
  updatedAt: string
  lastStageChangeAt: string
  contactId: string
  contact?: {
    id: string
    name: string
    email: string
    phone: string
    tags: string[]
  }
}

function calculateDaysInStage(lastStageChangeAt: string | null): number {
  if (!lastStageChangeAt) return 0
  const changeDate = new Date(lastStageChangeAt)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - changeDate.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

async function fetchClinicOpportunities(
  clinic: string,
  config: typeof CLINIC_CONFIG[keyof typeof CLINIC_CONFIG]
): Promise<{ opportunities: GHLOpportunity[]; stageNames: Record<string, string> }> {
  // Use static Private Integration token (stable, doesn't rotate)
  const accessToken = getStaticToken(clinic)
  if (!accessToken) {
    console.error(`No static token configured for ${clinic}`)
    return { opportunities: [], stageNames: {} }
  }
  
  // Fetch pipeline stages
  const pipelinesRes = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${config.locationId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28',
      },
    }
  )
  
  if (!pipelinesRes.ok) {
    console.error(`Failed to fetch pipelines for ${clinic}`)
    return { opportunities: [], stageNames: {} }
  }
  
  const pipelinesData = await pipelinesRes.json()
  const salesPipeline = (pipelinesData.pipelines || []).find(
    (p: { id: string }) => p.id === config.salesPipelineId
  )
  
  if (!salesPipeline) {
    console.error(`Sales pipeline not found for ${clinic}`)
    return { opportunities: [], stageNames: {} }
  }
  
  // Build stage ID → name map
  const stageNames: Record<string, string> = {}
  for (const stage of salesPipeline.stages || []) {
    stageNames[stage.id] = stage.name
  }
  
  // Fetch opportunities from sales pipeline (single batch, most recent)
  const url = new URL(`https://services.leadconnectorhq.com/opportunities/search`)
  url.searchParams.set('location_id', config.locationId)
  url.searchParams.set('pipeline_id', config.salesPipelineId)
  url.searchParams.set('limit', '100')
  
  const oppsRes = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-07-28',
    },
  })
  
  if (!oppsRes.ok) {
    console.error(`Failed to fetch opportunities for ${clinic}`)
    return { opportunities: [], stageNames }
  }
  
  const oppsData = await oppsRes.json()
  const opportunities = oppsData.opportunities || []
  
  return { opportunities, stageNames }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const supabase = getSupabase()
  
  // Allow syncing a single clinic via query param for faster execution
  const clinicParam = request.nextUrl.searchParams.get('clinic')
  
  try {
    const results: Record<string, { fetched: number; upserted: number; errors: number }> = {}
    
    // Determine which clinics to sync
    const clinicsToSync = clinicParam 
      ? { [clinicParam]: CLINIC_CONFIG[clinicParam as keyof typeof CLINIC_CONFIG] }
      : CLINIC_CONFIG
    
    // Fetch opportunities from selected clinics
    for (const [clinic, config] of Object.entries(clinicsToSync)) {
      if (!config) continue
      results[clinic] = { fetched: 0, upserted: 0, errors: 0 }
      console.log(`Syncing ${clinic}...`)
      
      const { opportunities, stageNames } = await fetchClinicOpportunities(clinic, config)
      results[clinic].fetched = opportunities.length
      
      // Fetch existing deal_type values so we don't overwrite them
      const oppIds = opportunities.map(opp => opp.id)
      const { data: existingRecords } = await supabase
        .from('opportunities')
        .select('id, deal_type')
        .in('id', oppIds)
      
      const existingDealTypes = new Map<string, string | null>(
        (existingRecords || []).map(r => [r.id, r.deal_type])
      )
      
      // Transform and upsert to Supabase
      const rows = opportunities
        .map(opp => {
          const stageName = stageNames[opp.pipelineStageId] || ''
          const superStage = getSuperStageByName(stageName)
          
          // Skip if not in our tracked stages
          if (!superStage) return null
          
          return {
            id: opp.id,
            name: opp.name,
            monetary_value: opp.monetaryValue || 0,
            clinic,
            super_stage: superStage,
            ghl_stage_id: opp.pipelineStageId,
            ghl_stage_name: stageName,
            assigned_to_id: opp.assignedTo || null,
            assigned_to_name: getSalespersonName(opp.assignedTo),
            source: opp.source || null,
            deal_type: existingDealTypes.get(opp.id) || null, // Preserve existing deal_type
            contact_id: opp.contactId || null,
            email: opp.contact?.email || null,
            phone: opp.contact?.phone || null,
            tags: opp.contact?.tags || [],
            days_in_stage: calculateDaysInStage(opp.lastStageChangeAt),
            last_stage_change_at: opp.lastStageChangeAt || null,
            created_at: opp.createdAt || null,
            synced_at: new Date().toISOString(),
          }
        })
        .filter(Boolean)
      
      if (rows.length > 0) {
        const { error } = await supabase
          .from('opportunities')
          .upsert(rows, { onConflict: 'id' })
        
        if (error) {
          console.error(`Upsert error for ${clinic}:`, error)
          results[clinic].errors++
        } else {
          results[clinic].upserted = rows.length
        }
      }
    }
    
    const duration = Date.now() - startTime
    
    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      results,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// Also support GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request)
}
