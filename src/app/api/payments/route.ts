import { NextRequest, NextResponse } from 'next/server'
import { getPayments, createPayment } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dealId = searchParams.get('dealId') || undefined
    
    const payments = await getPayments(dealId)
    
    return NextResponse.json({ payments })
  } catch (error) {
    console.error('Failed to fetch payments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const isCash = body.method === 'Cash'
    
    const payment = await createPayment({
      deal_id: body.dealId,
      amount: parseFloat(body.amount) || 0,
      method: body.method,
      payment_date: body.paymentDate || new Date().toISOString().split('T')[0],
      verified: !isCash,
      verified_by: isCash ? '' : 'system',
      verified_at: isCash ? '' : new Date().toISOString(),
      source: body.source || 'manual',
      external_ref: body.externalRef || '',
    })
    
    return NextResponse.json({ payment })
  } catch (error) {
    console.error('Failed to create payment:', error)
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    )
  }
}
