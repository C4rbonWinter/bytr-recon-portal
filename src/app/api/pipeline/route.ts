import { NextRequest, NextResponse } from 'next/server'
import { getSuperStage, CLINIC_CONFIG, SUPER_STAGES, SuperStage } from '@/lib/pipeline-config'

// GHL API tokens (in production, these would be env vars)
const GHL_TOKENS: Record<string, string> = {
  TR01: process.env.GHL_TOKEN_SG || '',
  TR02: process.env.GHL_TOKEN_IRV || '',
  TR04: process.env.GHL_TOKEN_VEGAS || '',
}

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

interface PipelineCard {
  id: string
  name: string
  value: number
  clinic: string
  stage: SuperStage
  ghlStageId: string
  assignedTo: string
  source: string
  daysInStage: number
  contactId: string
  email?: string
  phone?: string
  tags: string[]
  createdAt: string
}

async function fetchGHLOpportunities(clinic: keyof typeof CLINIC_CONFIG): Promise<GHLOpportunity[]> {
  const config = CLINIC_CONFIG[clinic]
  const token = GHL_TOKENS[clinic]
  
  if (!token) {
    console.error(`No GHL token for ${clinic}`)
    return []
  }
  
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&status=open&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      }
    )
    
    if (!response.ok) {
      console.error(`GHL API error for ${clinic}: ${response.status}`)
      return []
    }
    
    const data = await response.json()
    return data.opportunities || []
  } catch (error) {
    console.error(`Failed to fetch GHL opportunities for ${clinic}:`, error)
    return []
  }
}

function calculateDaysInStage(lastStageChangeAt: string): number {
  const changeDate = new Date(lastStageChangeAt)
  const now = new Date()
  const diffMs = now.getTime() - changeDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicFilter = searchParams.get('clinic') // TR01, TR02, TR04, or null for all
    
    const clinicsToFetch = clinicFilter 
      ? [clinicFilter as keyof typeof CLINIC_CONFIG]
      : ['TR01', 'TR02', 'TR04'] as const
    
    // Fetch opportunities from all clinics in parallel
    const allOpportunities = await Promise.all(
      clinicsToFetch.map(async (clinic) => {
        const opps = await fetchGHLOpportunities(clinic)
        return opps.map(opp => ({ ...opp, clinic }))
      })
    )
    
    // Flatten and transform to pipeline cards
    const cards: PipelineCard[] = []
    
    for (const clinicOpps of allOpportunities) {
      for (const opp of clinicOpps) {
        const superStage = getSuperStage(opp.pipelineStageId)
        
        // Skip if not in our pipeline stages
        if (!superStage) continue
        
        cards.push({
          id: opp.id,
          name: opp.name,
          value: opp.monetaryValue || 0,
          clinic: opp.clinic,
          stage: superStage,
          ghlStageId: opp.pipelineStageId,
          assignedTo: opp.assignedTo || 'Unassigned',
          source: opp.source || 'Unknown',
          daysInStage: calculateDaysInStage(opp.lastStageChangeAt),
          contactId: opp.contactId,
          email: opp.contact?.email,
          phone: opp.contact?.phone,
          tags: opp.contact?.tags || [],
          createdAt: opp.createdAt,
        })
      }
    }
    
    // Group by stage
    const pipeline: Record<SuperStage, PipelineCard[]> = {
      leads: [],
      virtual: [],
      in_person: [],
      tx_plan: [],
      closing: [],
      financing: [],
      won: [],
    }
    
    for (const card of cards) {
      pipeline[card.stage].push(card)
    }
    
    // Sort each stage by days in stage (oldest first = needs attention)
    for (const stage of SUPER_STAGES) {
      pipeline[stage].sort((a, b) => b.daysInStage - a.daysInStage)
    }
    
    // Calculate totals
    const totals = {
      count: cards.length,
      value: cards.reduce((sum, c) => sum + c.value, 0),
      byStage: Object.fromEntries(
        SUPER_STAGES.map(stage => [
          stage,
          {
            count: pipeline[stage].length,
            value: pipeline[stage].reduce((sum, c) => sum + c.value, 0),
          }
        ])
      ),
    }
    
    return NextResponse.json({ pipeline, totals })
  } catch (error) {
    console.error('Pipeline API error:', error)
    return NextResponse.json({ error: 'Failed to fetch pipeline' }, { status: 500 })
  }
}

// Move opportunity to a new stage
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { opportunityId, newStageId, clinic } = body
    
    if (!opportunityId || !newStageId || !clinic) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const token = GHL_TOKENS[clinic as keyof typeof GHL_TOKENS]
    if (!token) {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 })
    }
    
    const response = await fetch(
      `https://services.leadconnectorhq.com/opportunities/${opportunityId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pipelineStageId: newStageId,
        }),
      }
    )
    
    if (!response.ok) {
      const error = await response.text()
      console.error('GHL update error:', error)
      return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 })
    }
    
    const updated = await response.json()
    return NextResponse.json({ success: true, opportunity: updated })
  } catch (error) {
    console.error('Pipeline PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
