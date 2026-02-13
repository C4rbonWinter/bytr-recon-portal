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

// GHL API tokens - access lazily at runtime to ensure env vars are available
function getGHLToken(clinic: string): string {
  switch (clinic) {
    case 'TR01': return process.env.GHL_TOKEN_SG || ''
    case 'TR02': return process.env.GHL_TOKEN_IRV || ''
    case 'TR04': return process.env.GHL_TOKEN_VEGAS || ''
    default: return ''
  }
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

// Parse deal_month to a start-of-month date (more accurate than created_at which is import time)
function parseDealMonth(dm: string | null): Date | null {
  if (!dm) return null
  // Formats: "Jan 2026", "Dec 2025", "2026-02"
  const monthNames: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  }
  // Try "MMM YYYY" format
  const match1 = dm.match(/^([A-Za-z]{3})\s+(\d{4})$/)
  if (match1) {
    const month = monthNames[match1[1]]
    const year = parseInt(match1[2])
    if (month !== undefined) return new Date(year, month, 1)
  }
  // Try "YYYY-MM" format
  const match2 = dm.match(/^(\d{4})-(\d{2})$/)
  if (match2) {
    return new Date(parseInt(match2[1]), parseInt(match2[2]) - 1, 1)
  }
  return null
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

// Get date range for a time period filter
function getDateRange(period: string): { start: Date | null; end: Date | null } {
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()
  
  switch (period) {
    case 'this_month':
      return { start: new Date(thisYear, thisMonth, 1), end: null }
    case 'last_month':
      return { 
        start: new Date(thisYear, thisMonth - 1, 1), 
        end: new Date(thisYear, thisMonth, 0, 23, 59, 59, 999) 
      }
    case 'last_30':
      const d30 = new Date(now)
      d30.setDate(d30.getDate() - 30)
      d30.setHours(0, 0, 0, 0)
      return { start: d30, end: null }
    case 'last_90':
      const d90 = new Date(now)
      d90.setDate(d90.getDate() - 90)
      d90.setHours(0, 0, 0, 0)
      return { start: d90, end: null }
    case 'this_year':
      return { start: new Date(thisYear, 0, 1), end: null }
    case 'last_year':
      return { 
        start: new Date(thisYear - 1, 0, 1), 
        end: new Date(thisYear - 1, 11, 31, 23, 59, 59, 999) 
      }
    default: // 'all'
      return { start: null, end: null }
  }
}

// Check if a date falls within a range
function isInDateRange(date: Date | string | null, range: { start: Date | null; end: Date | null }): boolean {
  if (!range.start && !range.end) return true // No filter
  if (!date) return false
  
  const d = typeof date === 'string' ? new Date(date) : date
  if (range.start && d < range.start) return false
  if (range.end && d > range.end) return false
  return true
}

export async function GET(request: NextRequest) {
  // Get period filter from query params
  const period = request.nextUrl.searchParams.get('period') || 'all'
  const dateRange = getDateRange(period)
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
      .select('id, salesperson, status, created_at, updated_at, deal_month')
    
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
    const dealStartDate: Record<string, Date | null> = {}
    for (const deal of deals || []) {
      dealSalesperson[deal.id] = deal.salesperson
      // Use deal_month (when deal was worked) rather than created_at (when imported)
      dealStartDate[deal.id] = parseDealMonth(deal.deal_month)
    }

    // Calculate collections by salesperson from payments (filtered by date range)
    const collectionsBySalesperson: Record<string, number> = {}
    for (const payment of payments || []) {
      // Filter by payment_date within the selected period
      if (!isInDateRange(payment.payment_date, dateRange)) continue
      
      const sp = normalizeSalesperson(dealSalesperson[payment.deal_id])
      if (sp === 'Unassigned') continue
      if (!collectionsBySalesperson[sp]) collectionsBySalesperson[sp] = 0
      collectionsBySalesperson[sp] += payment.amount || 0
    }

    // Find first payment date per deal (only considering payments in date range)
    const firstPaymentByDeal: Record<string, string> = {}
    for (const payment of payments || []) {
      if (!payment.payment_date) continue
      // Only consider payments within the selected period for fastest closer
      if (!isInDateRange(payment.payment_date, dateRange)) continue
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
      
      // Calculate time to first payment (deal start month to first collection)
      const firstPayment = firstPaymentByDeal[deal.id]
      const dealStart = dealStartDate[deal.id]
      if (dealStart && firstPayment) {
        const collected = new Date(firstPayment)
        const diffMs = collected.getTime() - dealStart.getTime()
        // Allow 0 to 365 days (deal_month is start of month, payment may be same month)
        if (diffMs >= 0 && diffMs < 365 * 24 * 60 * 60 * 1000) {
          salesStats[sp].closeTimesMs.push(diffMs)
        }
      }
    }

    // 2. Get pipeline data from Supabase for biggest pipeline AND deals won
    // Fetch ALL opportunities to calculate both metrics
    const { data: allOpportunities, error: oppsError } = await supabase
      .from('opportunities')
      .select('assigned_to_name, super_stage')
    
    if (oppsError) {
      console.error('Opportunities error:', oppsError)
    }
    
    // Count opportunities in "won" stage per salesperson (Deals Won)
    const dealsWonByPerson: Record<string, number> = {}
    // Count OPEN opportunities (not won/archive) per salesperson (Biggest Pipeline)
    const pipelineCountByPerson: Record<string, number> = {}
    
    for (const opp of allOpportunities || []) {
      const sp = opp.assigned_to_name || 'Unassigned'
      if (sp === 'Unassigned') continue
      
      if (opp.super_stage === 'won') {
        if (!dealsWonByPerson[sp]) dealsWonByPerson[sp] = 0
        dealsWonByPerson[sp]++
      } else if (opp.super_stage !== 'cold') {
        if (!pipelineCountByPerson[sp]) pipelineCountByPerson[sp] = 0
        pipelineCountByPerson[sp]++
      }
    }
    
    // Override salesStats dealsWon with opportunity-based counts
    for (const [sp, count] of Object.entries(dealsWonByPerson)) {
      if (!salesStats[sp]) {
        salesStats[sp] = { dealsWon: 0, collections: 0, closeTimesMs: [] }
      }
      salesStats[sp].dealsWon = count
    }
    
    // For salespersons not in dealsWonByPerson, ensure dealsWon is 0
    for (const sp of Object.keys(salesStats)) {
      if (!dealsWonByPerson[sp]) {
        salesStats[sp].dealsWon = 0
      }
    }
    
    console.log('Leaderboard: dealsWonByPerson =', dealsWonByPerson)
    console.log('Leaderboard: pipelineCountByPerson =', pipelineCountByPerson)

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
    
    // Biggest Pipeline leader (by card count, not value)
    let pipelineLeader: LeaderboardEntry = { name: '—', value: 0, displayValue: '0' }
    for (const [name, count] of Object.entries(pipelineCountByPerson)) {
      if (count > pipelineLeader.value) {
        pipelineLeader = { name, value: count, displayValue: count.toString() }
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
    
    // Fastest Closer leader (lowest average time from lead assignment to first payment, minimum 1 close)
    let fastestCloser: LeaderboardEntry = { name: '—', value: 0, displayValue: '—' }
    let lowestAvgMs = Infinity
    for (const [name, stats] of Object.entries(salesStats)) {
      if (stats.closeTimesMs.length >= 1) {
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
