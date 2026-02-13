import { NextRequest, NextResponse } from 'next/server'
import { queueMove } from '@/lib/sync-queue'
import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { opportunityId, clinic, fromStage, toStage, dealName } = await request.json()

    if (!opportunityId || !clinic || !fromStage || !toStage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user session for activity log
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('recon_session')
    let session: { id: string; name: string; role: string } | null = null
    try {
      if (sessionCookie?.value) {
        session = JSON.parse(sessionCookie.value)
      }
    } catch {}

    // Save stage override immediately (so it persists on refresh)
    const supabase = getSupabase()
    await supabase
      .from('stage_overrides')
      .upsert({
        opportunity_id: opportunityId,
        super_stage: toStage,
        updated_at: new Date().toISOString(),
      })

    // Also queue the move for GHL sync
    const result = await queueMove({
      opportunityId,
      clinic,
      fromStage,
      toStage,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Log activity (non-blocking)
    if (session) {
      logActivity({
        userId: session.id,
        userName: session.name,
        userRole: session.role,
        action: 'deal_move',
        entityType: 'deal',
        entityId: opportunityId,
        entityName: dealName || undefined,
        details: { from_stage: fromStage, to_stage: toStage },
        clinic,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch(err => console.error('Activity log error:', err))
    }

    return NextResponse.json({ success: true, message: 'Move saved and queued for sync' })
  } catch (error) {
    console.error('Queue move error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
