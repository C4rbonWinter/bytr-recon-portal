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
  const salespersonName = searchParams.get('salespersonName')

  try {
    const supabase = getSupabase()
    
    // Build query for opportunities (explicit columns to avoid PostgREST caching issues)
    let query = supabase
      .from('opportunities')
      .select('id, name, monetary_value, clinic, super_stage, ghl_stage_id, ghl_stage_name, assigned_to_id, assigned_to_name, source, deal_type, contact_id, email, phone, tags, days_in_stage, last_stage_change_at, created_at, synced_at, updated_at')
      .order('name')
    
    if (clinicFilter) {
      query = query.eq('clinic', clinicFilter)
    }
    
    // Filter by salesperson name - preferred for "View As" feature
    // TODO: Add shared_with filter once column is added to opportunities table
    if (salespersonName) {
      query = query.eq('assigned_to_name', salespersonName)
    }
    // Fallback: filter by GHL user IDs (legacy)
    else if (salespersonIds && salespersonIds.length > 0) {
      query = query.in('assigned_to_id', salespersonIds)
    }
    
    const { data: opportunities, error } = await query
    
    if (error) {
      console.error('Supabase query error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    // DEBUG: Log specific opportunity
    const marilu = (opportunities || []).find(o => o.name?.toLowerCase().includes('marilu'))
    console.log('DEBUG Marilu raw:', JSON.stringify(marilu, null, 2))
    
    // DEBUG: Log opportunities with deal_type
    const withDealType = (opportunities || []).filter(o => o.deal_type)
    console.log('Opportunities with deal_type:', withDealType.map(o => ({ id: o.id, name: o.name, deal_type: o.deal_type })))
    
    // Fetch stage overrides (local changes not yet synced)
    const { data: overrides } = await supabase
      .from('stage_overrides')
      .select('opportunity_id, super_stage')
    
    const stageOverrideMap = new Map<string, SuperStage>(
      (overrides || []).map(o => [o.opportunity_id, o.super_stage as SuperStage])
    )
    
    // Transform to pipeline cards - filter out test records
    const excludeNames = ['test', 'josh summers', 'joshua summers', 'blake sales']
    const cards: PipelineCard[] = (opportunities || [])
      .filter(opp => {
        const nameLower = (opp.name || '').toLowerCase()
        return !excludeNames.some(excluded => nameLower.includes(excluded))
      })
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
    // Fetch leaderboard from dedicated endpoint for consistency
    // Use absolute URL to ensure it works in serverless environment
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : request.nextUrl.origin
    
    let leaderboard
    try {
      const leaderboardRes = await fetch(`${baseUrl}/api/pipeline/leaderboard`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (leaderboardRes.ok) {
        leaderboard = await leaderboardRes.json()
      } else {
        console.error('Leaderboard fetch failed:', leaderboardRes.status)
        leaderboard = await calculateLeaderboard(supabase)
      }
    } catch (err) {
      console.error('Leaderboard fetch error:', err)
      leaderboard = await calculateLeaderboard(supabase)
    }
    
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
  
  // Get biggest pipeline from opportunities (count of cards, not value)
  const { data: pipelineOpps } = await supabase
    .from('opportunities')
    .select('assigned_to_name')
    .not('super_stage', 'in', '("won","cold")')
  
  const pipelineCountBySalesperson = new Map<string, number>()
  for (const opp of pipelineOpps || []) {
    if (opp.assigned_to_name) {
      const current = pipelineCountBySalesperson.get(opp.assigned_to_name) || 0
      pipelineCountBySalesperson.set(opp.assigned_to_name, current + 1)
    }
  }
  
  let topPipeline = { name: '-', value: 0 }
  Array.from(pipelineCountBySalesperson.entries()).forEach(([name, count]) => {
    if (count > topPipeline.value) {
      topPipeline = { name, value: count }
    }
  })
  
  // Fastest closer - average time from deal_month to first payment
  const { data: dealsWithPayments, error: dealsError } = await supabase
    .from('deals')
    .select('salesperson, deal_month, payments(amount, payment_date)')
    .not('deal_month', 'is', null)
  
  console.log('Deals with payments:', dealsWithPayments?.length, 'Error:', dealsError)
  
  const closeTimes = new Map<string, number[]>()
  const monthNames: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  }
  
  let processedCount = 0
  for (const deal of dealsWithPayments || []) {
    if (!deal.salesperson || !deal.deal_month) continue
    const payments = deal.payments as { amount: number; payment_date: string }[] | null
    if (!payments || payments.length === 0) continue
    
    // Parse deal_month (e.g., "Jan 2026")
    const match = deal.deal_month.match(/^([A-Za-z]{3})\s+(\d{4})$/)
    if (!match) {
      console.log('Deal month no match:', deal.deal_month)
      continue
    }
    const dealDate = new Date(parseInt(match[2]), monthNames[match[1]] || 0, 1)
    processedCount++
    
    // Find first payment date
    const firstPayment = payments.sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    )[0]
    if (!firstPayment?.payment_date) continue
    
    const paymentDate = new Date(firstPayment.payment_date)
    const diffMs = paymentDate.getTime() - dealDate.getTime()
    if (diffMs < 0) continue // Skip if payment before deal month
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const times = closeTimes.get(deal.salesperson) || []
    times.push(diffDays)
    closeTimes.set(deal.salesperson, times)
  }
  
  // Find salesperson with fastest average close time
  let fastestCloser = { name: '-', value: Infinity, displayValue: '-' }
  Array.from(closeTimes.entries()).forEach(([name, times]) => {
    if (times.length === 0) return
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    if (avg < fastestCloser.value) {
      const days = Math.floor(avg)
      const hours = Math.floor((avg - days) * 24)
      fastestCloser = { 
        name, 
        value: avg, 
        displayValue: `${days}d ${hours}h`
      }
    }
  })
  
  if (fastestCloser.value === Infinity) {
    fastestCloser = { name: '-', value: 0, displayValue: '-' }
  }
  
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
      displayValue: topPipeline.value.toString(),
    },
    fastestCloser,
  }
}
