import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { CLINIC_CONFIG, determineSuperStage, getSalespersonName } from '@/lib/pipeline-config'

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
export const maxDuration = 300 // Allow up to 5 minutes for historical sync

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
  
  // Fetch ALL opportunities from sales pipeline (paginate until Nov 1, 2025)
  const cutoffDate = new Date('2025-11-01T00:00:00Z')
  const allOpportunities: GHLOpportunity[] = []
  let startAfterId: string | null = null
  let pageCount = 0
  const maxPages = 20 // Safety limit: 20 pages * 100 = 2000 opportunities max
  
  while (pageCount < maxPages) {
    const url = new URL(`https://services.leadconnectorhq.com/opportunities/search`)
    url.searchParams.set('location_id', config.locationId)
    url.searchParams.set('pipeline_id', config.salesPipelineId)
    url.searchParams.set('limit', '100')
    if (startAfterId) {
      url.searchParams.set('startAfterId', startAfterId)
    }
    
    const oppsRes = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28',
      },
    })
    
    if (!oppsRes.ok) {
      console.error(`Failed to fetch opportunities for ${clinic} (page ${pageCount})`)
      break
    }
    
    const oppsData = await oppsRes.json()
    const opportunities = oppsData.opportunities || []
    
    if (opportunities.length === 0) break
    
    allOpportunities.push(...opportunities)
    pageCount++
    
    // Check if we've reached opportunities older than cutoff
    const lastOpp = opportunities[opportunities.length - 1]
    const lastCreatedAt = new Date(lastOpp.createdAt)
    
    // Get the next page cursor
    startAfterId = oppsData.meta?.startAfterId || lastOpp.id
    
    // Stop if oldest in this batch is before cutoff OR no more pages
    if (lastCreatedAt < cutoffDate || !oppsData.meta?.nextPageUrl) {
      break
    }
  }
  
  console.log(`${clinic}: Fetched ${allOpportunities.length} opportunities across ${pageCount} pages`)
  
  return { opportunities: allOpportunities, stageNames }
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
      
      // Fetch existing deal_type values so we don't overwrite them (batch to avoid URL length limits)
      const oppIds = opportunities.map(opp => opp.id)
      const existingDealTypes = new Map<string, string | null>()
      const LOOKUP_BATCH_SIZE = 100
      for (let i = 0; i < oppIds.length; i += LOOKUP_BATCH_SIZE) {
        const batchIds = oppIds.slice(i, i + LOOKUP_BATCH_SIZE)
        const { data: existingRecords } = await supabase
          .from('opportunities')
          .select('id, deal_type')
          .in('id', batchIds)
        
        for (const r of existingRecords || []) {
          existingDealTypes.set(r.id, r.deal_type)
        }
      }
      
      // Transform and upsert to Supabase
      const rows = opportunities
        .map(opp => {
          const stageName = stageNames[opp.pipelineStageId] || ''
          const tags = opp.contact?.tags || []
          const monetaryValue = opp.monetaryValue || 0
          
          // Determine super stage with Won validation (requires invoice)
          const superStage = determineSuperStage(
            stageName,
            tags,
            opp.lastStageChangeAt,
            monetaryValue
          )
          
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
      
      // Batch upserts in groups of 100 to avoid Supabase limits
      const BATCH_SIZE = 100
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error } = await supabase
          .from('opportunities')
          .upsert(batch, { onConflict: 'id' })
        
        if (error) {
          console.error(`Upsert error for ${clinic} (batch ${i}):`, error)
          results[clinic].errors++
        } else {
          results[clinic].upserted += batch.length
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
