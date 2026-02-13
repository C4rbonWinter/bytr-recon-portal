import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getPayments, createPayment, deletePayment, verifyPayment } from '@/lib/supabase'

// Admins can auto-verify cash payments
const ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai', 'cole@teethandrobots.com', 'josh@bytr.ai', 'chris@teethandrobots.com']
const ALLOWED_DOMAINS = ['@teethandrobots.com', '@bytr.ai']

async function requireAuth(): Promise<{ authorized: boolean; email?: string }> {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return { authorized: false }
  }
  
  const email = session.user.email.toLowerCase()
  if (!ALLOWED_DOMAINS.some(domain => email.endsWith(domain))) {
    return { authorized: false }
  }
  
  return { authorized: true, email }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
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
  const auth = await requireAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const body = await request.json()
    
    const isCash = body.method === 'Cash'
    const userEmail = body.userEmail || ''
    const isAdmin = ADMIN_EMAILS.includes(userEmail)
    
    // Cash needs verification UNLESS added by an admin
    const needsVerification = isCash && !isAdmin
    
    const payment = await createPayment({
      deal_id: body.dealId,
      amount: parseFloat(body.amount) || 0,
      method: body.method,
      payment_date: body.paymentDate || new Date().toISOString().split('T')[0],
      verified: !needsVerification,
      verified_by: needsVerification ? '' : (isAdmin ? userEmail : 'system'),
      verified_at: needsVerification ? '' : new Date().toISOString(),
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

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const body = await request.json()
    const { id, verified, verifiedBy } = body
    
    if (!id) {
      return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
    }
    
    const payment = await verifyPayment(id, verified, verifiedBy)
    
    return NextResponse.json({ payment })
  } catch (error) {
    console.error('Failed to verify payment:', error)
    return NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
    }
    
    await deletePayment(id)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete payment:', error)
    return NextResponse.json(
      { error: 'Failed to delete payment' },
      { status: 500 }
    )
  }
}
