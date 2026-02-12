import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Create a fresh client for each request to avoid stale connection issues
export function getSupabase(): SupabaseClient {
  const supabaseUrl = (process.env.SUPABASE_URL || 'https://pwktjywsyiliteuxspnt.supabase.co').trim()
  const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  return createClient(supabaseUrl, supabaseServiceKey, {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          cache: 'no-store',
        })
      },
    },
  })
}

// For backwards compatibility - use getSupabase() in new code
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as any)[prop]
  }
})

// Types
export interface Deal {
  id: string
  patient_name: string
  clinic: 'TR01' | 'TR02' | 'TR04'
  salesperson: string
  shared_with: string | null
  deal_type: string
  plan_total: number
  invoice_link: string
  notes: string
  deal_month: string
  status: 'verified' | 'partial' | 'unpaid' | 'flagged'
  ghl_contact_id: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  deal_id: string
  amount: number
  method: string
  payment_date: string
  verified: boolean
  verified_by: string
  verified_at: string
  source: string
  external_ref: string
  created_at: string
  updated_at: string
}

// Fetch all deals with payments - excludes test records
export async function getDeals(): Promise<(Deal & { collected: number; payments: Payment[] })[]> {
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })

  if (dealsError) throw dealsError

  // Filter out test records and specific test names
  const excludeNames = ['test', 'josh summers', 'joshua summers']
  const filteredDeals = (deals || []).filter(deal => {
    const nameLower = (deal.patient_name || '').toLowerCase()
    return !excludeNames.some(excluded => nameLower.includes(excluded))
  })

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('*')

  if (paymentsError) throw paymentsError

  return filteredDeals.map(deal => {
    const dealPayments = (payments || []).filter(p => p.deal_id === deal.id)
    const collected = dealPayments.reduce((sum, p) => sum + p.amount, 0)
    return { ...deal, collected, payments: dealPayments }
  })
}

// Find deal by patient name and clinic (for sync)
export async function findDeal(patientName: string, clinic: string): Promise<Deal | null> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .ilike('patient_name', patientName)
    .eq('clinic', clinic)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = not found
  return data
}

// Create a deal
export async function createDeal(deal: Omit<Deal, 'id' | 'created_at' | 'updated_at'>): Promise<Deal> {
  const { data, error } = await supabase
    .from('deals')
    .insert([deal])
    .select()
    .single()

  if (error) throw error
  return data
}

// Update a deal
export async function updateDeal(id: string, updates: Partial<Deal>): Promise<Deal> {
  console.log('supabase.updateDeal called:', { id, updates })
  
  const { data, error } = await supabase
    .from('deals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Supabase error:', error)
    throw new Error(error.message || JSON.stringify(error))
  }
  
  console.log('supabase.updateDeal result:', data)
  return data
}

// Fetch payments for a deal
export async function getPayments(dealId?: string): Promise<Payment[]> {
  let query = supabase.from('payments').select('*')
  
  if (dealId) {
    query = query.eq('deal_id', dealId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Create a payment
export async function createPayment(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert([payment])
    .select()
    .single()

  if (error) throw error
  
  // Update deal status
  await updateDealStatus(payment.deal_id)
  
  return data
}

// Verify a payment
export async function verifyPayment(id: string, verified: boolean, verifiedBy: string): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .update({
      verified,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  
  // Update deal status
  if (data?.deal_id) {
    await updateDealStatus(data.deal_id)
  }
  
  return data
}

// Delete a payment
export async function deletePayment(id: string): Promise<void> {
  // Get the payment first to know the deal_id
  const { data: payment } = await supabase
    .from('payments')
    .select('deal_id')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', id)

  if (error) throw error
  
  // Update deal status after deletion
  if (payment?.deal_id) {
    await updateDealStatus(payment.deal_id)
  }
}

// Update deal status based on payments
export async function updateDealStatus(dealId: string): Promise<void> {
  const { data: deal } = await supabase
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .single()

  if (!deal) return

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('deal_id', dealId)

  const totalCollected = (payments || []).reduce((sum, p) => sum + p.amount, 0)
  const allVerified = (payments || []).every(p => p.verified)

  let status: Deal['status'] = 'unpaid'
  if (totalCollected >= deal.plan_total && allVerified) {
    status = 'verified'
  } else if (totalCollected > 0 && totalCollected < deal.plan_total) {
    status = 'partial'
  } else if (totalCollected >= deal.plan_total && !allVerified) {
    status = 'partial'
  }

  await supabase
    .from('deals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', dealId)
}

// Get deal types by GHL contact IDs (for Pipeline view)
export async function getDealTypesByContactIds(contactIds: string[]): Promise<Record<string, string>> {
  if (contactIds.length === 0) return {}
  
  const { data, error } = await supabase
    .from('deals')
    .select('ghl_contact_id, deal_type')
    .in('ghl_contact_id', contactIds)
  
  if (error) throw error
  
  const result: Record<string, string> = {}
  for (const deal of data || []) {
    if (deal.ghl_contact_id && deal.deal_type) {
      result[deal.ghl_contact_id] = deal.deal_type
    }
  }
  return result
}

// Update deal type by GHL contact ID (for Pipeline → Deals sync)
export async function updateDealTypeByContactId(
  contactId: string, 
  dealType: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('deals')
    .update({ deal_type: dealType, updated_at: new Date().toISOString() })
    .eq('ghl_contact_id', contactId)
    .select()
  
  if (error) throw error
  return (data?.length || 0) > 0
}
