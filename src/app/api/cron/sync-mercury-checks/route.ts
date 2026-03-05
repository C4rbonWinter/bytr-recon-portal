import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mercury API config
const MERCURY_ACCOUNTS = [
  { 
    token: process.env.MERCURY_API_TRCD!, 
    clinic: 'TR01', // California - San Gabriel primary
    accountId: 'fca5c63c-19ef-11f0-8728-c300c4cda99a',
    name: 'TRCalifornia ••5932'
  },
  { 
    token: process.env.MERCURY_API_TRND!, 
    clinic: 'TR04', // Nevada
    accountId: 'e97e7e68-b59f-11f0-b84f-a7298e40d0ef',
    name: 'TRNevada ••9407'
  }
]

interface MercuryTransaction {
  id: string
  amount: number
  counterpartyName: string | null
  kind: string
  postedAt: string
  bankDescription: string | null
}

interface Deal {
  id: string
  patient_name: string
  clinic: string
}

// Normalize name for comparison
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Check if names match (handles "First Last" vs "Last, First" etc)
function namesMatch(mercuryName: string, patientName: string): { match: boolean; confidence: number } {
  const norm1 = normalizeName(mercuryName)
  const norm2 = normalizeName(patientName)
  
  // Exact match
  if (norm1 === norm2) {
    return { match: true, confidence: 100 }
  }
  
  // Split into parts
  const parts1 = norm1.split(' ').filter(p => p.length > 1)
  const parts2 = norm2.split(' ').filter(p => p.length > 1)
  
  // Check if all parts of one name exist in the other
  const allParts1InParts2 = parts1.every(p => parts2.some(p2 => p2.includes(p) || p.includes(p2)))
  const allParts2InParts1 = parts2.every(p => parts1.some(p1 => p1.includes(p) || p.includes(p1)))
  
  if (allParts1InParts2 && allParts2InParts1 && parts1.length >= 2 && parts2.length >= 2) {
    return { match: true, confidence: 90 }
  }
  
  // Check for last name + first initial match
  if (parts1.length >= 2 && parts2.length >= 2) {
    const lastName1 = parts1[parts1.length - 1]
    const lastName2 = parts2[parts2.length - 1]
    const firstName1 = parts1[0]
    const firstName2 = parts2[0]
    
    if (lastName1 === lastName2 && firstName1[0] === firstName2[0]) {
      return { match: true, confidence: 80 }
    }
  }
  
  return { match: false, confidence: 0 }
}

async function fetchMercuryTransactions(token: string, accountId: string): Promise<MercuryTransaction[]> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startDate = thirtyDaysAgo.toISOString().split('T')[0]
  const endDate = new Date().toISOString().split('T')[0]
  
  const response = await fetch(
    `https://api.mercury.com/api/v1/account/${accountId}/transactions?start=${startDate}&end=${endDate}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )
  
  if (!response.ok) {
    throw new Error(`Mercury API error: ${response.status}`)
  }
  
  const data = await response.json()
  
  // Filter to check deposits and positive amounts only
  return (data.transactions || []).filter((t: MercuryTransaction) => 
    t.amount > 0 && 
    (t.kind === 'checkDeposit' || t.kind === 'wire') &&
    t.counterpartyName
  )
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {
    processed: 0,
    matched: 0,
    flagged: 0,
    skipped: 0,
    errors: [] as string[],
    matches: [] as { patient: string; amount: number; date: string; confidence: number }[]
  }

  try {
    // Get all deals for matching
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, patient_name, clinic')
    
    if (dealsError) throw dealsError
    if (!deals || deals.length === 0) {
      return NextResponse.json({ message: 'No deals found', results })
    }

    // Get existing Mercury payments to avoid duplicates
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('external_ref')
      .like('source', 'Mercury%')
    
    const existingRefs = new Set((existingPayments || []).map(p => p.external_ref).filter(Boolean))

    // Process each Mercury account
    for (const account of MERCURY_ACCOUNTS) {
      if (!account.token) continue
      
      try {
        const transactions = await fetchMercuryTransactions(account.token, account.accountId)
        
        for (const tx of transactions) {
          results.processed++
          
          // Skip if already processed
          const txRef = `mercury-${tx.id}`
          if (existingRefs.has(txRef)) {
            results.skipped++
            continue
          }
          
          // Try to match to a patient
          let bestMatch: { deal: Deal; confidence: number } | null = null
          
          for (const deal of deals) {
            const { match, confidence } = namesMatch(tx.counterpartyName!, deal.patient_name)
            if (match && (!bestMatch || confidence > bestMatch.confidence)) {
              bestMatch = { deal, confidence }
            }
          }
          
          if (bestMatch && bestMatch.confidence >= 80) {
            // High confidence match - auto-apply
            const paymentDate = tx.postedAt.split('T')[0]
            
            const { error: insertError } = await supabase
              .from('payments')
              .insert({
                deal_id: bestMatch.deal.id,
                amount: tx.amount,
                method: tx.kind === 'wire' ? 'ACH/Wire' : 'Check',
                payment_date: paymentDate,
                source: `Mercury ${account.name}`,
                external_ref: txRef,
                verified: bestMatch.confidence === 100 // Auto-verify exact matches
              })
            
            if (insertError) {
              results.errors.push(`Failed to insert payment for ${tx.counterpartyName}: ${insertError.message}`)
            } else {
              results.matched++
              results.matches.push({
                patient: bestMatch.deal.patient_name,
                amount: tx.amount,
                date: paymentDate,
                confidence: bestMatch.confidence
              })
            }
          } else if (tx.counterpartyName && tx.amount >= 1000) {
            // No match but significant amount - log for manual review
            results.flagged++
            console.log(`Unmatched Mercury deposit: ${tx.counterpartyName} - $${tx.amount} on ${tx.postedAt}`)
          }
        }
      } catch (err) {
        results.errors.push(`Error processing ${account.name}: ${err}`)
      }
    }

    return NextResponse.json({ 
      message: 'Mercury sync complete', 
      results 
    })

  } catch (error) {
    console.error('Mercury sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    )
  }
}
