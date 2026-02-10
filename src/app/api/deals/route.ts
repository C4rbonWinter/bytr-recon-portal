import { NextRequest, NextResponse } from 'next/server'
import { getDeals, createDeal, updateDeal } from '@/lib/supabase'

export async function GET() {
  try {
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
    
    const deal = await updateDeal(id, {
      ...(updates.sharedWith !== undefined && { shared_with: updates.sharedWith }),
      ...(updates.salesperson && { salesperson: updates.salesperson }),
    })
    
    return NextResponse.json({ deal })
  } catch (error) {
    console.error('Failed to update deal:', error)
    return NextResponse.json(
      { error: 'Failed to update deal' },
      { status: 500 }
    )
  }
}
