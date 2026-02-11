import { NextRequest, NextResponse } from 'next/server'
import { getPendingMoves, markSynced, markFailed } from '@/lib/sync-queue'
import { getLocationToken } from '@/lib/ghl-oauth'
import { getSupabase } from '@/lib/supabase'
import { CLINIC_CONFIG, SuperStage, STAGE_NAME_TO_SUPER } from '@/lib/pipeline-config'

export const dynamic = 'force-dynamic'

// Service (deal type) custom field IDs per clinic
const SERVICE_FIELD_IDS: Record<string, string> = {
  TR01: 'QlA7Mso7jPC20Ng8wHyq',
  TR02: 'IdlYaG597ASHeuoFeIuk',
  TR04: 'fK1TUWuawPzN9pkkxEV7',
}

// Note: Contact updates now use OAuth tokens via getLocationToken()
// instead of private integration tokens (which lacked contacts.write scope)

// Target stage names for each super stage
const SUPER_TO_TARGET_STAGES: Record<SuperStage, string[]> = {
  virtual: ['Virtual Consult', 'Virtual', 'Virtual Show'],
  in_person: ['Office Appt', 'In Office', 'Office Show', 'Confirmed'],
  tx_plan: ['TX Plan Ready', 'Proposal Sent', 'Agreement Sent'],
  closing: ['Closing Call', 'Negotiation'],
  financing: ['Finance Link Sent', 'Approved', 'PP Processing', 'Cash Patient'],
  won: ['Signed', 'Down Payment', 'Won', 'Closed'],
  archive: ['Delayed Follow Up', 'Re Engage', 'Limbo'],
}

async function processDealTypeChange(move: { id: string; opportunityId: string; clinic: string; toStage: string }): Promise<{ success: boolean; error?: string }> {
  // opportunityId is actually contactId for deal type changes
  const contactId = move.opportunityId
  const dealType = move.toStage
  const fieldId = SERVICE_FIELD_IDS[move.clinic]
  
  if (!fieldId) {
    return { success: false, error: `No Service field ID for clinic ${move.clinic}` }
  }
  
  // Get clinic config for location ID
  const clinicConfig = CLINIC_CONFIG[move.clinic as keyof typeof CLINIC_CONFIG]
  if (!clinicConfig) {
    return { success: false, error: `Invalid clinic: ${move.clinic}` }
  }
  
  // Use OAuth token (has contacts.write scope) instead of private integration token
  const tokenResult = await getLocationToken('', clinicConfig.locationId)
  if (!tokenResult.success || !tokenResult.accessToken) {
    return { success: false, error: tokenResult.error || 'Failed to get GHL OAuth token for contact update' }
  }
  
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenResult.accessToken}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customFields: [{ id: fieldId, value: dealType }],
        }),
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `GHL contact update failed: ${response.status} - ${errorText}` }
    }
    
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function processMove(move: { id: string; opportunityId: string; clinic: string; fromStage: string; toStage: string; attempts: number }): Promise<{ success: boolean; error?: string }> {
  // Handle deal type changes separately
  if (move.fromStage === 'deal_type_change') {
    return processDealTypeChange(move)
  }
  
  const clinicConfig = CLINIC_CONFIG[move.clinic as keyof typeof CLINIC_CONFIG]
  if (!clinicConfig) {
    return { success: false, error: 'Invalid clinic' }
  }

  // Get OAuth token (auto-persists new refresh tokens)
  const tokenResult = await getLocationToken('', clinicConfig.locationId)
  if (!tokenResult.success || !tokenResult.accessToken) {
    return { success: false, error: tokenResult.error || 'Failed to get GHL token' }
  }
  const accessToken = tokenResult.accessToken

  try {
    // Fetch the specific sales pipeline stages
    const pipelinesRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${clinicConfig.locationId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
        },
      }
    )

    if (!pipelinesRes.ok) {
      return { success: false, error: `Failed to fetch pipelines: ${pipelinesRes.status}` }
    }

    const pipelinesData = await pipelinesRes.json()
    const pipelines = pipelinesData.pipelines || []
    
    // Find the sales pipeline specifically
    const salesPipeline = pipelines.find((p: { id: string }) => p.id === clinicConfig.salesPipelineId)
    if (!salesPipeline) {
      return { success: false, error: `Sales pipeline not found: ${clinicConfig.salesPipelineId}` }
    }

    // Find matching stage within the sales pipeline only
    let targetStageId: string | null = null
    const targetStageNames = SUPER_TO_TARGET_STAGES[move.toStage as SuperStage] || []
    const stages = salesPipeline.stages || []

    // First try exact match with target stage names
    for (const stage of stages) {
      const stageName = stage.name?.toLowerCase().trim()
      for (const targetName of targetStageNames) {
        if (stageName === targetName.toLowerCase()) {
          targetStageId = stage.id
          break
        }
      }
      if (targetStageId) break
    }

    // Fallback: check STAGE_NAME_TO_SUPER mapping
    if (!targetStageId) {
      for (const stage of stages) {
        const stageName = stage.name?.toLowerCase().trim()
        if (STAGE_NAME_TO_SUPER[stageName] === move.toStage) {
          targetStageId = stage.id
          break
        }
      }
    }

    if (!targetStageId) {
      // Archive has no GHL equivalent - just mark as synced (local-only move)
      if (move.toStage === 'archive') {
        console.log(`Archive move for ${move.opportunityId} - no GHL stage, marking synced locally`)
        return { success: true }
      }
      // Log available stages for debugging
      const availableStages = stages.map((s: { name: string }) => s.name).join(', ')
      return { success: false, error: `No matching stage for ${move.toStage}. Available: ${availableStages}` }
    }

    // Update the opportunity
    const updateRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/${move.opportunityId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pipelineStageId: targetStageId }),
      }
    )

    if (!updateRes.ok) {
      const errorText = await updateRes.text()
      return { success: false, error: `GHL update failed: ${updateRes.status} - ${errorText}` }
    }

    // GHL updated successfully - clear the local override since GHL now has the correct stage
    const supabase = getSupabase()
    await supabase
      .from('stage_overrides')
      .delete()
      .eq('opportunity_id', move.opportunityId)

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function POST(request: NextRequest) {
  // TODO: Add cron secret auth for production
  try {
    const pendingMoves = await getPendingMoves(10)
    
    if (pendingMoves.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No pending moves' })
    }

    let processed = 0
    let failed = 0

    for (const move of pendingMoves) {
      const result = await processMove(move)
      
      if (result.success) {
        await markSynced(move.id)
        processed++
      } else {
        await markFailed(move.id, result.error || 'Unknown error', move.attempts + 1)
        failed++
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed, 
      failed,
      remaining: pendingMoves.length - processed,
    })
  } catch (error) {
    console.error('Process sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Also support GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request)
}
