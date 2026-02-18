import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getPayments, createPayment, deletePayment, verifyPayment, getDeal } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

// Admins can auto-verify cash payments
const ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai', 'cole@teethandrobots.com', 'josh@bytr.ai', 'chris@teethandrobots.com']
const ALLOWED_DOMAINS = ['@teethandrobots.com', '@bytr.ai']

// Display name mapping for activity log
const USER_NAMES: Record<string, string> = {
  'cole@bytr.ai': 'Cole Summers',
  'cole@teethandrobots.com': 'Cole Summers',
  'rick@bytr.ai': 'Rick',
  'josh@bytr.ai': 'Josh',
  'chris@teethandrobots.com': 'Chris Traina',
  'ctraina@teethandrobots.com': 'Chris Traina',
}

function getDisplayName(email: string): string {
  return USER_NAMES[email.toLowerCase()] || email.split('@')[0].replace(/^\w/, c => c.toUpperCase())
}

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
    
    const userEmail = body.userEmail || ''
    const source = body.source || 'manual'
    
    // Manual payments start UNVERIFIED (editable)
    // Only system/API payments (from ReconBot) start verified
    const isSystemSource = source === 'system' || source === 'api' || source === 'sync'
    
    const payment = await createPayment({
      deal_id: body.dealId,
      amount: parseFloat(body.amount) || 0,
      method: body.method,
      payment_date: body.paymentDate || new Date().toISOString().split('T')[0],
      verified: isSystemSource,
      verified_by: isSystemSource ? 'system' : null,
      verified_at: isSystemSource ? new Date().toISOString() : null,
      source: source,
      external_ref: body.externalRef || null,
    })
    
    // Log activity (non-blocking)
    try {
      const deal = await getDeal(body.dealId)
      logActivity({
        userId: auth.email || 'unknown',
        userName: getDisplayName(auth.email || ''),
        userRole: ADMIN_EMAILS.includes(auth.email || '') ? 'admin' : 'user',
        action: 'payment_added',
        entityType: 'payment',
        entityId: payment.id,
        entityName: deal?.patient_name || 'Unknown',
        details: {
          amount: payment.amount,
          method: payment.method,
          dealId: body.dealId,
        },
        clinic: deal?.clinic,
      }).catch(err => console.error('Activity log error:', err))
    } catch (logErr) {
      console.error('Activity logging failed:', logErr)
    }
    
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
    
    // Log activity (non-blocking, best effort)
    try {
      logActivity({
        userId: auth.email || 'unknown',
        userName: getDisplayName(auth.email || ''),
        userRole: ADMIN_EMAILS.includes(auth.email || '') ? 'admin' : 'user',
        action: 'payment_deleted',
        entityType: 'payment',
        entityId: id,
        entityName: 'Payment',
        details: { paymentId: id },
      }).catch(err => console.error('Activity log error:', err))
    } catch (logErr) {
      console.error('Activity logging failed:', logErr)
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete payment:', error)
    return NextResponse.json(
      { error: 'Failed to delete payment' },
      { status: 500 }
    )
  }
}
