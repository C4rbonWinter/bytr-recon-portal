import { NextRequest, NextResponse } from 'next/server'
import { getSuperStageByName, CLINIC_CONFIG, SUPER_STAGES, SuperStage, getSalespersonName, STAGE_CONFIG } from '@/lib/pipeline-config'
import { getDealTypesByContactIds, getSupabase } from '@/lib/supabase'

// GHL API tokens (in production, these would be env vars)
const GHL_TOKENS: Record<string, string> = {
  TR01: process.env.GHL_TOKEN_SG || '',
  TR02: process.env.GHL_TOKEN_IRV || '',
  TR04: process.env.GHL_TOKEN_VEGAS || '',
}

// Service (deal type) custom field IDs per clinic
const SERVICE_FIELD_IDS: Record<string, string> = {
  TR01: 'QlA7Mso7jPC20Ng8wHyq',
  TR02: 'IdlYaG597ASHeuoFeIuk',
  TR04: 'fK1TUWuawPzN9pkkxEV7',
}

// Clean up deal type display (remove "Implants" as it's implied)
function formatDealType(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\s*Implants?$/i, '').trim()
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
  dealType: string    // From GHL "Service" custom field
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
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Version': '2021-07-28',
  }
  
  try {
    // Fetch from multiple sources to get full picture:
    // 1. Recent open opportunities (newest first)
    // 2. Sales pipeline specifically (has TX Plan, Closing, Signed stages)
    // 3. Won opportunities
    const fetchPromises = [
      // General open, newest first
      fetch(
        `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&status=open&limit=100&order=desc`,
        { headers }
      ),
      // Won opportunities
      fetch(
        `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&status=won&limit=100`,
        { headers }
      ),
    ]
    
    // Add sales pipeline query if configured
    if (config.salesPipelineId) {
      fetchPromises.push(
        fetch(
          `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&status=open&limit=100&pipeline_id=${config.salesPipelineId}`,
          { headers }
        )
      )
    }
    
    const responses = await Promise.all(fetchPromises)
    
    // Check for errors
    for (const res of responses) {
      if (!res.ok) {
        console.error(`GHL API error for ${clinic}: ${res.status}`)
      }
    }
    
    const dataArrays = await Promise.all(responses.map(r => r.json()))
    
    // Combine all opportunities and dedupe by ID
    const allOpps: GHLOpportunity[] = []
    for (const data of dataArrays) {
      if (data.opportunities) {
        allOpps.push(...data.opportunities)
      }
    }
    
    const seen = new Set<string>()
    return allOpps.filter(opp => {
      if (seen.has(opp.id)) return false
      seen.add(opp.id)
      return true
    })
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

// Calculate leaderboard stats from pipeline cards + Supabase data
interface LeaderboardEntry {
  name: string
  value: number
  displayValue: string
}

interface LeaderboardStats {
  dealsWon: LeaderboardEntry
  totalCollections: LeaderboardEntry
  biggestPipeline: LeaderboardEntry
  fastestCloser: LeaderboardEntry
}

async function calculateLeaderboard(
  allCards: { assignedTo: string; stage: string }[],
  pipeline: Record<string, { assignedTo: string }[]>
): Promise<LeaderboardStats> {
  const formatCurrency = (n: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  
  // 1. Deals Won = count of cards in "won" stage by salesperson
  const wonCards = pipeline['won'] || []
  const wonBySP: Record<string, number> = {}
  for (const card of wonCards) {
    const sp = card.assignedTo
    if (sp === 'Unassigned') continue
    wonBySP[sp] = (wonBySP[sp] || 0) + 1
  }
  
  let dealsWonLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '0' }
  for (const [name, count] of Object.entries(wonBySP)) {
    if (count > dealsWonLeader.value) {
      dealsWonLeader = { name, value: count, displayValue: count.toString() }
    }
  }
  
  // 2. Biggest Pipeline = count of ALL cards by salesperson (excluding won/archive)
  const activeBySP: Record<string, number> = {}
  for (const card of allCards) {
    const sp = card.assignedTo
    if (sp === 'Unassigned') continue
    // Exclude won and archive - we want active pipeline
    if (card.stage === 'won' || card.stage === 'archive') continue
    activeBySP[sp] = (activeBySP[sp] || 0) + 1
  }
  
  let biggestPipelineLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '0' }
  for (const [name, count] of Object.entries(activeBySP)) {
    if (count > biggestPipelineLeader.value) {
      biggestPipelineLeader = { name, value: count, displayValue: count.toString() }
    }
  }
  
  // 3 & 4. Collections and Fastest Closer from Supabase
  let collectionsLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '$0' }
  let fastestCloserLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '—' }
  
  try {
    const supabase = getSupabase()
    
    // Total Collections = sum of verified payments grouped by deal salesperson
    const { data: deals } = await supabase
      .from('deals')
      .select('id, salesperson, collected')
    
    if (deals) {
      const collectionsBySP: Record<string, number> = {}
      for (const deal of deals) {
        const sp = deal.salesperson
        if (!sp || sp === 'Unassigned') continue
        collectionsBySP[sp] = (collectionsBySP[sp] || 0) + (deal.collected || 0)
      }
      
      for (const [name, total] of Object.entries(collectionsBySP)) {
        if (total > collectionsLeader.value) {
          collectionsLeader = { name, value: total, displayValue: formatCurrency(total) }
        }
      }
    }
    
    // Fastest Closer = avg time from deal creation to first payment (min 2 deals)
    const { data: payments } = await supabase
      .from('payments')
      .select('deal_id, payment_date, verified')
      .eq('verified', true)
    
    if (deals && payments) {
      // Build map of deal_id -> salesperson and created_at
      const dealInfo: Record<string, { salesperson: string; createdAt: string }> = {}
      for (const deal of deals) {
        dealInfo[deal.id] = { salesperson: deal.salesperson, createdAt: (deal as any).created_at }
      }
      
      // Find first payment date per deal
      const firstPayment: Record<string, string> = {}
      for (const p of payments) {
        if (!firstPayment[p.deal_id] || p.payment_date < firstPayment[p.deal_id]) {
          firstPayment[p.deal_id] = p.payment_date
        }
      }
      
      // Calculate close times by salesperson
      const closeTimesBySP: Record<string, number[]> = {}
      for (const [dealId, paymentDate] of Object.entries(firstPayment)) {
        const info = dealInfo[dealId]
        if (!info || !info.salesperson || info.salesperson === 'Unassigned' || !info.createdAt) continue
        
        const created = new Date(info.createdAt)
        const paid = new Date(paymentDate)
        const diffMs = paid.getTime() - created.getTime()
        
        // Sanity check: positive and less than 1 year
        if (diffMs > 0 && diffMs < 365 * 24 * 60 * 60 * 1000) {
          if (!closeTimesBySP[info.salesperson]) closeTimesBySP[info.salesperson] = []
          closeTimesBySP[info.salesperson].push(diffMs)
        }
      }
      
      // Find fastest (lowest avg, min 2 closes)
      let lowestAvgMs = Infinity
      for (const [name, times] of Object.entries(closeTimesBySP)) {
        if (times.length >= 2) {
          const avgMs = times.reduce((a, b) => a + b, 0) / times.length
          if (avgMs < lowestAvgMs) {
            lowestAvgMs = avgMs
            const days = Math.floor(avgMs / (1000 * 60 * 60 * 24))
            const hours = Math.floor((avgMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
            const displayValue = days > 0 ? `${days}d ${hours}h` : `${hours}h`
            fastestCloserLeader = { name, value: avgMs, displayValue }
          }
        }
      }
    }
  } catch (err) {
    console.error('Leaderboard Supabase error:', err)
  }
  
  return {
    dealsWon: dealsWonLeader,
    totalCollections: collectionsLeader,
    biggestPipeline: biggestPipelineLeader,
    fastestCloser: fastestCloserLeader,
  }
}

// Fetch Service field value for a contact
async function fetchContactDealType(
  contactId: string,
  clinic: string,
  token: string
): Promise<string> {
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      }
    )
    
    if (!response.ok) return ''
    
    const data = await response.json()
    const serviceFieldId = SERVICE_FIELD_IDS[clinic]
    const customFields = data.contact?.customFields || []
    
    const serviceField = customFields.find((f: { id: string; value: string }) => f.id === serviceFieldId)
    return formatDealType(serviceField?.value)
  } catch {
    return ''
  }
}

// Batch fetch deal types for multiple contacts (with concurrency limit)
async function batchFetchDealTypes(
  contacts: { contactId: string; clinic: string }[],
  tokens: Record<string, string>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {}
  const BATCH_SIZE = 10 // Fetch 10 at a time to avoid rate limits
  
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async ({ contactId, clinic }) => {
        const token = tokens[clinic]
        if (!token) return { contactId, dealType: '' }
        const dealType = await fetchContactDealType(contactId, clinic, token)
        return { contactId, dealType }
      })
    )
    
    for (const { contactId, dealType } of batchResults) {
      results[contactId] = dealType
    }
  }
  
  return results
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
        
        // Skip test records
        if (opp.name.toLowerCase().includes('test')) continue
        
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
          dealType: '', // Will be populated below
          daysInStage: calculateDaysInStage(opp.lastStageChangeAt),
          contactId: opp.contactId,
          email: opp.contact?.email,
          phone: opp.contact?.phone,
          tags: opp.contact?.tags || [],
          createdAt: opp.createdAt,
        })
      }
    }
    
    // Fetch deal types from Supabase (faster than GHL)
    const contactIds = cards.map(c => c.contactId).filter(Boolean)
    const dealTypes = await getDealTypesByContactIds(contactIds)
    
    // Update cards with deal types
    for (const card of cards) {
      card.dealType = dealTypes[card.contactId] || ''
    }
    
    // Dedupe by contactId - keep the card furthest along in the pipeline
    const cardsByContact = new Map<string, PipelineCard>()
    for (const card of cards) {
      const existing = cardsByContact.get(card.contactId)
      if (!existing) {
        cardsByContact.set(card.contactId, card)
      } else {
        // Keep the one with higher stage order (furthest along)
        const existingOrder = STAGE_CONFIG[existing.stage].order
        const currentOrder = STAGE_CONFIG[card.stage].order
        if (currentOrder > existingOrder) {
          cardsByContact.set(card.contactId, card)
        }
      }
    }
    const dedupedCards = Array.from(cardsByContact.values())
    
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
    
    for (const card of dedupedCards) {
      pipeline[card.stage].push(card)
    }
    
    // Sort each stage by days in stage (oldest first = needs attention)
    for (const stage of SUPER_STAGES) {
      pipeline[stage].sort((a, b) => b.daysInStage - a.daysInStage)
    }
    
    // Calculate totals
    const totals = {
      count: dedupedCards.length,
      value: dedupedCards.reduce((sum, c) => sum + c.value, 0),
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
    const salespersons = Array.from(new Set(dedupedCards.map(c => c.assignedToId).filter(Boolean)))
      .map(id => ({ id, name: getSalespersonName(id as string) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    
    // Calculate leaderboard stats from pipeline data + Supabase
    const leaderboard = await calculateLeaderboard(dedupedCards, pipeline)
    
    return NextResponse.json({ pipeline, totals, salespersons, leaderboard })
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
