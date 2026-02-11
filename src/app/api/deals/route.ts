import { NextRequest, NextResponse } from 'next/server'
import { getDeals, createDeal, updateDeal, findDeal } from '@/lib/supabase'

const SYNC_API_KEY = process.env.SYNC_API_KEY || 'recon-sync-2026'

function checkSyncAuth(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key')
  return apiKey === SYNC_API_KEY
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const patientName = searchParams.get('patient_name')
    const clinic = searchParams.get('clinic')
    
    // Lookup by patient name + clinic (for sync)
    if (patientName && clinic) {
      const deal = await findDeal(patientName, clinic)
      return NextResponse.json({ deal })
    }
    
    // Otherwise return all deals
    const deals = await getDeals()
    return NextResponse.json({ deals })
  } catch (error) {
    console.error('Failed to fetch deals:', error)
    return NextResponse.json(
      { error: 'Failed to fetch deals' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const deal = await createDeal({
      patient_name: body.patientName,
      clinic: body.clinic,
      salesperson: body.salesperson,
      shared_with: body.sharedWith || null,
      deal_type: body.dealType,
      plan_total: parseFloat(body.planTotal) || 0,
      invoice_link: body.invoiceLink || '',
      notes: body.notes || '',
      deal_month: body.dealMonth || new Date().toISOString().slice(0, 7),
      status: 'unpaid',
      ghl_contact_id: body.ghlContactId || '',
    })
    
    return NextResponse.json({ deal })
  } catch (error) {
    console.error('Failed to create deal:', error)
    return NextResponse.json(
      { error: 'Failed to create deal' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body
    
    if (!id) {
      return NextResponse.json({ error: 'Deal ID required' }, { status: 400 })
    }
    
    // Build update object - support both camelCase (UI) and snake_case (sync) 
    const updateData: Record<string, unknown> = {}
    
    if (updates.sharedWith !== undefined) updateData.shared_with = updates.sharedWith
    if (updates.shared_with !== undefined) updateData.shared_with = updates.shared_with
    if (updates.salesperson !== undefined) updateData.salesperson = updates.salesperson || null
    if (updates.plan_total !== undefined) updateData.plan_total = updates.plan_total
    if (updates.planTotal !== undefined) updateData.plan_total = updates.planTotal
    if (updates.status) updateData.status = updates.status
    if (updates.notes !== undefined) updateData.notes = updates.notes
    if (updates.invoice_link !== undefined) updateData.invoice_link = updates.invoice_link
    if (updates.invoiceLink !== undefined) updateData.invoice_link = updates.invoiceLink
    if (updates.deal_month) updateData.deal_month = updates.deal_month
    if (updates.dealMonth) updateData.deal_month = updates.dealMonth
    
    const deal = await updateDeal(id, updateData)
    
    return NextResponse.json({ deal })
  } catch (error) {
    console.error('Failed to update deal:', error)
    return NextResponse.json(
      { error: 'Failed to update deal' },
      { status: 500 }
    )
  }
}
