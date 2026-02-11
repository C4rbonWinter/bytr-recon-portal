import { NextRequest, NextResponse } from 'next/server'
import { getPendingMoves, markSynced, markFailed } from '@/lib/sync-queue'
import { getLocationToken } from '@/lib/ghl-oauth'
import { CLINIC_CONFIG, SuperStage, STAGE_NAME_TO_SUPER } from '@/lib/pipeline-config'

export const dynamic = 'force-dynamic'

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

async function processMove(move: { id: string; opportunityId: string; clinic: string; toStage: string; attempts: number }): Promise<{ success: boolean; error?: string }> {
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
    // Fetch pipeline stages
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

    // Find matching stage
    let targetStageId: string | null = null
    const targetStageNames = SUPER_TO_TARGET_STAGES[move.toStage as SuperStage] || []

    for (const pipeline of pipelines) {
      for (const stage of pipeline.stages || []) {
        const stageName = stage.name?.toLowerCase().trim()
        for (const targetName of targetStageNames) {
          if (stageName === targetName.toLowerCase()) {
            targetStageId = stage.id
            break
          }
        }
        if (targetStageId) break
      }
      if (targetStageId) break
    }

    // Fallback: check STAGE_NAME_TO_SUPER mapping
    if (!targetStageId) {
      for (const pipeline of pipelines) {
        for (const stage of pipeline.stages || []) {
          const stageName = stage.name?.toLowerCase().trim()
          if (STAGE_NAME_TO_SUPER[stageName] === move.toStage) {
            targetStageId = stage.id
            break
          }
        }
        if (targetStageId) break
      }
    }

    if (!targetStageId) {
      return { success: false, error: `No matching stage for ${move.toStage}` }
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

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function POST(request: NextRequest) {
  // Optional: verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
