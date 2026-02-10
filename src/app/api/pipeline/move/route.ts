import { NextRequest, NextResponse } from 'next/server'
import { getLocationToken } from '@/lib/ghl-oauth'
import { CLINIC_CONFIG, STAGE_NAME_TO_SUPER, SuperStage } from '@/lib/pipeline-config'

// Target stage names for each super stage (first match will be used)
const SUPER_TO_TARGET_STAGES: Record<SuperStage, string[]> = {
  virtual: ['Virtual Consult', 'Virtual', 'Virtual Show'],
  in_person: ['Office Appt', 'In Office', 'Office Show', 'Confirmed'],
  tx_plan: ['TX Plan Ready', 'Proposal Sent', 'Agreement Sent'],
  closing: ['Closing Call', 'Negotiation'],
  financing: ['Finance Link Sent', 'Approved', 'PP Processing', 'Cash Patient'],
  won: ['Signed', 'Down Payment', 'Won', 'Closed'],
  archive: ['Delayed Follow Up', 'Re Engage', 'Limbo'],
}

export async function POST(request: NextRequest) {
  try {
    const { opportunityId, clinic, targetStage } = await request.json()

    if (!opportunityId || !clinic || !targetStage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const clinicConfig = CLINIC_CONFIG[clinic as keyof typeof CLINIC_CONFIG]
    if (!clinicConfig) {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 })
    }

    // Get location token via OAuth
    const companyId = clinic === 'TR04' 
      ? process.env.GHL_OAUTH_VEGAS_COMPANY_ID!
      : process.env.GHL_OAUTH_SALESJET_COMPANY_ID!
    
    const tokenResult = await getLocationToken(companyId, clinicConfig.locationId)
    if (!tokenResult.success || !tokenResult.accessToken) {
      return NextResponse.json({ error: 'Failed to get GHL token' }, { status: 500 })
    }

    const accessToken = tokenResult.accessToken

    // Fetch pipeline stages for this location
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
      console.error('Failed to fetch pipelines:', await pipelinesRes.text())
      return NextResponse.json({ error: 'Failed to fetch pipelines' }, { status: 500 })
    }

    const pipelinesData = await pipelinesRes.json()
    const pipelines = pipelinesData.pipelines || []

    // Find a matching stage in any pipeline
    let targetStageId: string | null = null
    const targetStageNames = SUPER_TO_TARGET_STAGES[targetStage as SuperStage] || []

    for (const pipeline of pipelines) {
      for (const stage of pipeline.stages || []) {
        const stageName = stage.name?.toLowerCase().trim()
        // Check if this stage name matches any of our target names
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

    if (!targetStageId) {
      // Fallback: find any stage that maps to this super stage
      for (const pipeline of pipelines) {
        for (const stage of pipeline.stages || []) {
          const stageName = stage.name?.toLowerCase().trim()
          if (STAGE_NAME_TO_SUPER[stageName] === targetStage) {
            targetStageId = stage.id
            break
          }
        }
        if (targetStageId) break
      }
    }

    if (!targetStageId) {
      return NextResponse.json({ 
        error: `No matching stage found for ${targetStage}`,
        availableStages: pipelines.flatMap((p: any) => p.stages?.map((s: any) => s.name) || [])
      }, { status: 400 })
    }

    // Update the opportunity
    const updateRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/${opportunityId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pipelineStageId: targetStageId,
        }),
      }
    )

    if (!updateRes.ok) {
      const errorText = await updateRes.text()
      console.error('Failed to update opportunity:', errorText)
      return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 })
    }

    const updatedOpp = await updateRes.json()

    return NextResponse.json({ 
      success: true, 
      opportunity: updatedOpp,
      newStageId: targetStageId,
    })

  } catch (error) {
    console.error('Pipeline move error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
