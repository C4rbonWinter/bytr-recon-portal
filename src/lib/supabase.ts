import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'https://pwktjywsyiliteuxspnt.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

// Fetch all deals with payments
export async function getDeals(): Promise<(Deal & { collected: number; payments: Payment[] })[]> {
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })

  if (dealsError) throw dealsError

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('*')

  if (paymentsError) throw paymentsError

  return (deals || []).map(deal => {
    const dealPayments = (payments || []).filter(p => p.deal_id === deal.id)
    const collected = dealPayments.reduce((sum, p) => sum + p.amount, 0)
    return { ...deal, collected, payments: dealPayments }
  })
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
  const { data, error } = await supabase
    .from('deals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
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
