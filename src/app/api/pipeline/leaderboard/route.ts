import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSalespersonName, SALESPERSON_IDS, CLINIC_CONFIG } from '@/lib/pipeline-config'

// Force dynamic rendering (not static) so env vars are available at runtime
export const dynamic = 'force-dynamic'

// Create Supabase client lazily to avoid build-time errors
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  )
}

// GHL API tokens
const GHL_TOKENS: Record<string, string> = {
  TR01: process.env.GHL_TOKEN_SG || '',
  TR02: process.env.GHL_TOKEN_IRV || '',
  TR04: process.env.GHL_TOKEN_VEGAS || '',
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

// Normalize salesperson names from various formats
function normalizeSalesperson(value: string | null): string {
  if (!value) return 'Unassigned'
  
  // Check if it's a GHL ID
  for (const [name, ids] of Object.entries(SALESPERSON_IDS)) {
    if (ids.includes(value)) return name
  }
  
  // Check if it's already a known name
  const knownNames = Object.keys(SALESPERSON_IDS)
  if (knownNames.includes(value)) return value
  
  return value
}

export async function GET(request: NextRequest) {
  try {
    // Validate env vars
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase env vars')
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
    }
    
    const supabase = getSupabase()
    
    // 1. Get deals data from Supabase (with payments for collection totals)
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, salesperson, status, created_at, updated_at')
    
    if (dealsError) {
      console.error('Supabase error:', dealsError)
      return NextResponse.json({ error: 'Supabase query failed', details: dealsError.message }, { status: 500 })
    }

    // Get payments to calculate collections and close times
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('deal_id, amount, verified, payment_date')
      .eq('verified', true)
    
    if (paymentsError) {
      console.error('Payments error:', paymentsError)
      // Continue without payments data
    }

    // Build maps for deal data
    const dealSalesperson: Record<string, string> = {}
    const dealCreatedAt: Record<string, string> = {}
    for (const deal of deals || []) {
      dealSalesperson[deal.id] = deal.salesperson
      dealCreatedAt[deal.id] = deal.created_at
    }

    // Calculate collections by salesperson from payments
    const collectionsBySalesperson: Record<string, number> = {}
    for (const payment of payments || []) {
      const sp = normalizeSalesperson(dealSalesperson[payment.deal_id])
      if (sp === 'Unassigned') continue
      if (!collectionsBySalesperson[sp]) collectionsBySalesperson[sp] = 0
      collectionsBySalesperson[sp] += payment.amount || 0
    }

    // Find first payment date per deal
    const firstPaymentByDeal: Record<string, string> = {}
    for (const payment of payments || []) {
      if (!payment.payment_date) continue
      if (!firstPaymentByDeal[payment.deal_id] || payment.payment_date < firstPaymentByDeal[payment.deal_id]) {
        firstPaymentByDeal[payment.deal_id] = payment.payment_date
      }
    }

    // Calculate deals won, collections, and close times by salesperson
    const salesStats: Record<string, { dealsWon: number; collections: number; closeTimesMs: number[] }> = {}
    
    for (const deal of deals || []) {
      const sp = normalizeSalesperson(deal.salesperson)
      if (sp === 'Unassigned') continue
      
      if (!salesStats[sp]) {
        salesStats[sp] = { dealsWon: 0, collections: collectionsBySalesperson[sp] || 0, closeTimesMs: [] }
      }
      
      // Count verified deals as "won"
      if (deal.status === 'verified') {
        salesStats[sp].dealsWon++
      }
      
      // Calculate time to first payment (lead assignment to first collection)
      const firstPayment = firstPaymentByDeal[deal.id]
      if (deal.created_at && firstPayment) {
        const assigned = new Date(deal.created_at)
        const collected = new Date(firstPayment)
        const diffMs = collected.getTime() - assigned.getTime()
        if (diffMs >= 0 && diffMs < 365 * 24 * 60 * 60 * 1000) { // Sanity check: less than 1 year
          salesStats[sp].closeTimesMs.push(diffMs)
        }
      }
    }

    // 2. Get pipeline data from GHL for biggest pipeline
    // Fetch OPEN opportunities (active pipeline, not won/lost)
    const pipelineByPerson: Record<string, number> = {}
    
    for (const clinic of ['TR01', 'TR02', 'TR04'] as const) {
      const token = GHL_TOKENS[clinic]
      if (!token) {
        console.log(`Leaderboard: No GHL token for ${clinic}`)
        continue
      }
      
      const config = CLINIC_CONFIG[clinic]
      
      try {
        // Use GET method like the main pipeline route
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
          console.error(`Leaderboard: GHL API error for ${clinic}: ${response.status}`)
          continue
        }
        
        const data = await response.json()
        console.log(`Leaderboard: ${clinic} returned ${data.opportunities?.length || 0} opportunities`)
        
        for (const opp of data.opportunities || []) {
          const sp = getSalespersonName(opp.assignedTo)
          if (sp === 'Unassigned') continue
          
          if (!pipelineByPerson[sp]) pipelineByPerson[sp] = 0
          pipelineByPerson[sp] += opp.monetaryValue || 0
        }
      } catch (err) {
        console.error(`Leaderboard: Failed to fetch pipeline for ${clinic}:`, err)
      }
    }
    
    console.log('Leaderboard: pipelineByPerson =', pipelineByPerson)

    // 3. Find leaders for each category
    const formatCurrency = (n: number) => 
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    
    // Deals Won leader
    let dealsWonLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '0' }
    for (const [name, stats] of Object.entries(salesStats)) {
      if (stats.dealsWon > dealsWonLeader.value) {
        dealsWonLeader = { name, value: stats.dealsWon, displayValue: stats.dealsWon.toString() }
      }
    }
    
    // Collections leader
    let collectionsLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '$0' }
    for (const [name, stats] of Object.entries(salesStats)) {
      if (stats.collections > collectionsLeader.value) {
        collectionsLeader = { name, value: stats.collections, displayValue: formatCurrency(stats.collections) }
      }
    }
    
    // Biggest Pipeline leader
    let pipelineLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '$0' }
    for (const [name, value] of Object.entries(pipelineByPerson)) {
      if (value > pipelineLeader.value) {
        pipelineLeader = { name, value, displayValue: formatCurrency(value) }
      }
    }
    
    // Helper to format milliseconds as "Xd Yh Zm" or "Yh Zm" or "Zm"
    const formatTime = (ms: number): string => {
      const minutes = Math.floor(ms / (1000 * 60))
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)
      
      const remainingHours = hours % 24
      const remainingMinutes = minutes % 60
      
      if (days > 0) {
        return `${days}d ${remainingHours}h`
      } else if (hours > 0) {
        return `${hours}h ${remainingMinutes}m`
      } else {
        return `${minutes}m`
      }
    }
    
    // Fastest Closer leader (lowest average time from lead assignment to first payment, minimum 2 closes)
    let fastestCloser: LeaderboardEntry = { name: '—', value: 0, displayValue: '—' }
    let lowestAvgMs = Infinity
    for (const [name, stats] of Object.entries(salesStats)) {
      if (stats.closeTimesMs.length >= 2) {
        const avgMs = stats.closeTimesMs.reduce((a, b) => a + b, 0) / stats.closeTimesMs.length
        if (avgMs < lowestAvgMs) {
          lowestAvgMs = avgMs
          fastestCloser = { name, value: avgMs, displayValue: formatTime(avgMs) }
        }
      }
    }

    const result: LeaderboardStats = {
      dealsWon: dealsWonLeader,
      totalCollections: collectionsLeader,
      biggestPipeline: pipelineLeader,
      fastestCloser: fastestCloser,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    )
  }
}
