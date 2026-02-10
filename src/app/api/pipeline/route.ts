import { NextRequest, NextResponse } from 'next/server'
import { getSuperStageByName, CLINIC_CONFIG, SUPER_STAGES, SuperStage, getSalespersonName } from '@/lib/pipeline-config'

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
  assignedToId: string | null
  assignedTo: string  // Display name
  source: string
  daysInStage: number
  contactId: string
  email?: string
  phone?: string
  tags: string[]
  createdAt: string
}

interface GHLStage {
  id: string
  name: string
}

// Cache for stage ID → name mappings per clinic
const stageNameCache: Record<string, Record<string, string>> = {}

async function fetchStageNames(clinic: keyof typeof CLINIC_CONFIG): Promise<Record<string, string>> {
  if (stageNameCache[clinic]) {
    return stageNameCache[clinic]
  }
  
  const config = CLINIC_CONFIG[clinic]
  const token = GHL_TOKENS[clinic]
  
  if (!token) return {}
  
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${config.locationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      }
    )
    
    if (!response.ok) return {}
    
    const data = await response.json()
    const mapping: Record<string, string> = {}
    
    for (const pipeline of data.pipelines || []) {
      for (const stage of pipeline.stages || []) {
        mapping[stage.id] = stage.name
      }
    }
    
    stageNameCache[clinic] = mapping
    return mapping
  } catch (error) {
    console.error(`Failed to fetch stages for ${clinic}:`, error)
    return {}
  }
}

async function fetchGHLOpportunities(clinic: keyof typeof CLINIC_CONFIG): Promise<GHLOpportunity[]> {
  const config = CLINIC_CONFIG[clinic]
  const token = GHL_TOKENS[clinic]
  
  if (!token) {
    console.error(`No GHL token for ${clinic}`)
    return []
  }
  
  try {
    // Fetch both open and won opportunities
    const [openRes, wonRes] = await Promise.all([
      fetch(
        `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&status=open&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Version': '2021-07-28',
          },
        }
      ),
      fetch(
        `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&status=won&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Version': '2021-07-28',
          },
        }
      ),
    ])
    
    if (!openRes.ok || !wonRes.ok) {
      console.error(`GHL API error for ${clinic}: open=${openRes.status}, won=${wonRes.status}`)
      return []
    }
    
    const [openData, wonData] = await Promise.all([openRes.json(), wonRes.json()])
    return [...(openData.opportunities || []), ...(wonData.opportunities || [])]
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
    const salespersonFilter = searchParams.get('salesperson') // GHL user ID(s), comma-separated, or null for all
    const salespersonIds = salespersonFilter ? salespersonFilter.split(',') : null
    
    const clinicsToFetch = clinicFilter 
      ? [clinicFilter as keyof typeof CLINIC_CONFIG]
      : ['TR01', 'TR02', 'TR04'] as const
    
    // Fetch opportunities and stage names from all clinics in parallel
    const allData = await Promise.all(
      clinicsToFetch.map(async (clinic) => {
        const [opps, stageNames] = await Promise.all([
          fetchGHLOpportunities(clinic),
          fetchStageNames(clinic),
        ])
        return { clinic, opps, stageNames }
      })
    )
    
    // Flatten and transform to pipeline cards
    const cards: PipelineCard[] = []
    
    for (const { clinic, opps, stageNames } of allData) {
      for (const opp of opps) {
        // Get stage name from ID, then map to super stage
        const stageName = stageNames[opp.pipelineStageId] || ''
        const superStage = getSuperStageByName(stageName)
        
        // Skip if not in our pipeline stages
        if (!superStage) continue
        
        // Skip if salesperson filter is set and doesn't match any of the IDs
        if (salespersonIds && !salespersonIds.includes(opp.assignedTo)) continue
        
        cards.push({
          id: opp.id,
          name: opp.name,
          value: opp.monetaryValue || 0,
          clinic: clinic,
          stage: superStage,
          ghlStageId: opp.pipelineStageId,
          assignedToId: opp.assignedTo || null,
          assignedTo: getSalespersonName(opp.assignedTo),
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
      virtual: [],
      in_person: [],
      tx_plan: [],
      closing: [],
      financing: [],
      won: [],
      archive: [],
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
    
    // Get unique salespersons for filter dropdown
    const salespersons = Array.from(new Set(cards.map(c => c.assignedToId).filter(Boolean)))
      .map(id => ({ id, name: getSalespersonName(id as string) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    
    return NextResponse.json({ pipeline, totals, salespersons })
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
