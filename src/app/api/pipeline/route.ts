import { NextRequest, NextResponse } from 'next/server'
import { SUPER_STAGES, SuperStage, STAGE_CONFIG } from '@/lib/pipeline-config'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface PipelineCard {
  id: string
  name: string
  value: number
  clinic: string
  stage: SuperStage
  ghlStageId: string
  assignedToId: string | null
  assignedTo: string
  source: string
  dealType: string
  daysInStage: number
  contactId: string
  email?: string
  phone?: string
  tags: string[]
  createdAt: string
}

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const clinicFilter = searchParams.get('clinic')
  const salespersonIds = searchParams.get('salespersonIds')?.split(',').filter(Boolean)

  try {
    const supabase = getSupabase()
    
    // Build query for opportunities
    let query = supabase
      .from('opportunities')
      .select('*')
      .order('name')
    
    if (clinicFilter) {
      query = query.eq('clinic', clinicFilter)
    }
    
    if (salespersonIds && salespersonIds.length > 0) {
      query = query.in('assigned_to_id', salespersonIds)
    }
    
    const { data: opportunities, error } = await query
    
    if (error) {
      console.error('Supabase query error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    // Fetch stage overrides (local changes not yet synced)
    const { data: overrides } = await supabase
      .from('stage_overrides')
      .select('opportunity_id, super_stage')
    const stageOverrideMap = new Map<string, SuperStage>(
      (overrides || []).map(o => [o.opportunity_id, o.super_stage as SuperStage])
    )
    
    // Transform to pipeline cards
    const cards: PipelineCard[] = (opportunities || [])
      .filter(opp => !opp.name.toLowerCase().includes('test'))
      .map(opp => {
        // Use stage override if present, otherwise use stored stage
        const stage = stageOverrideMap.get(opp.id) || opp.super_stage as SuperStage
        
        return {
          id: opp.id,
          name: opp.name,
          value: opp.monetary_value || 0,
          clinic: opp.clinic,
          stage,
          ghlStageId: opp.ghl_stage_id || '',
          assignedToId: opp.assigned_to_id,
          assignedTo: opp.assigned_to_name || 'Unassigned',
          source: opp.source || 'Unknown',
          dealType: opp.deal_type || '',
          daysInStage: opp.days_in_stage || 0,
          contactId: opp.contact_id || '',
          email: opp.email,
          phone: opp.phone,
          tags: opp.tags || [],
          createdAt: opp.created_at,
        }
      })
    
    // Group by stage
    const pipeline: Record<SuperStage, PipelineCard[]> = {} as Record<SuperStage, PipelineCard[]>
    for (const stage of SUPER_STAGES) {
      pipeline[stage] = []
    }
    
    for (const card of cards) {
      if (pipeline[card.stage]) {
        pipeline[card.stage].push(card)
      }
    }
    
    // Calculate totals
    const totals = {
      count: cards.length,
      value: cards.reduce((sum, c) => sum + c.value, 0),
      byStage: {} as Record<SuperStage, { count: number; value: number }>,
    }
    
    for (const stage of SUPER_STAGES) {
      const stageCards = pipeline[stage]
      totals.byStage[stage] = {
        count: stageCards.length,
        value: stageCards.reduce((sum, c) => sum + c.value, 0),
      }
    }
    
    // Calculate leaderboard stats
    const leaderboard = await calculateLeaderboard(supabase)
    
    // Get list of unique salespersons
    const salespersonsMap = new Map<string, string>()
    for (const card of cards) {
      if (card.assignedToId && card.assignedTo && card.assignedTo !== 'Unassigned') {
        salespersonsMap.set(card.assignedToId, card.assignedTo)
      }
    }
    const salespersons = Array.from(salespersonsMap.entries()).map(([id, name]) => ({ id, name }))
    
    return NextResponse.json({
      pipeline,
      totals,
      salespersons,
      leaderboard,
    })
  } catch (error) {
    console.error('Pipeline error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function calculateLeaderboard(supabase: ReturnType<typeof getSupabase>): Promise<LeaderboardStats> {
  // Get deals won stats from deals table
  const { data: wonDeals } = await supabase
    .from('deals')
    .select('salesperson, plan_total')
  
  // Get payments for collections
  const { data: payments } = await supabase
    .from('payments')
    .select('deal_id, amount, deals!inner(salesperson)')
  
  // Calculate deals won by salesperson
  const dealsWonBySalesperson = new Map<string, number>()
  for (const deal of wonDeals || []) {
    const current = dealsWonBySalesperson.get(deal.salesperson) || 0
    dealsWonBySalesperson.set(deal.salesperson, current + (deal.plan_total || 0))
  }
  
  // Find top deals won
  let topDealsWon = { name: '-', value: 0 }
  Array.from(dealsWonBySalesperson.entries()).forEach(([name, value]) => {
    if (value > topDealsWon.value) {
      topDealsWon = { name, value }
    }
  })
  
  // Calculate collections by salesperson
  const collectionsBySalesperson = new Map<string, number>()
  for (const payment of payments || []) {
    const dealInfo = payment.deals as unknown as { salesperson: string } | null
    const salesperson = dealInfo?.salesperson
    if (salesperson) {
      const current = collectionsBySalesperson.get(salesperson) || 0
      collectionsBySalesperson.set(salesperson, current + (payment.amount || 0))
    }
  }
  
  // Find top collections
  let topCollections = { name: '-', value: 0 }
  Array.from(collectionsBySalesperson.entries()).forEach(([name, value]) => {
    if (value > topCollections.value) {
      topCollections = { name, value }
    }
  })
  
  // Get biggest pipeline from opportunities
  const { data: pipelineOpps } = await supabase
    .from('opportunities')
    .select('assigned_to_name, monetary_value')
    .not('super_stage', 'eq', 'won')
  
  const pipelineBySalesperson = new Map<string, number>()
  for (const opp of pipelineOpps || []) {
    if (opp.assigned_to_name) {
      const current = pipelineBySalesperson.get(opp.assigned_to_name) || 0
      pipelineBySalesperson.set(opp.assigned_to_name, current + (opp.monetary_value || 0))
    }
  }
  
  let topPipeline = { name: '-', value: 0 }
  Array.from(pipelineBySalesperson.entries()).forEach(([name, value]) => {
    if (value > topPipeline.value) {
      topPipeline = { name, value }
    }
  })
  
  // Fastest closer (placeholder - would need deal close dates)
  const fastestCloser = { name: '-', value: 0, displayValue: '-' }
  
  return {
    dealsWon: {
      ...topDealsWon,
      displayValue: formatCurrency(topDealsWon.value),
    },
    totalCollections: {
      ...topCollections,
      displayValue: formatCurrency(topCollections.value),
    },
    biggestPipeline: {
      ...topPipeline,
      displayValue: formatCurrency(topPipeline.value),
    },
    fastestCloser,
  }
}
