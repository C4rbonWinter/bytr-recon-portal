import { NextRequest, NextResponse } from 'next/server'
import { queueMove } from '@/lib/sync-queue'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { opportunityId, clinic, fromStage, toStage } = await request.json()

    if (!opportunityId || !clinic || !fromStage || !toStage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    return NextResponse.json({ success: true, message: 'Move saved and queued for sync' })
  } catch (error) {
    console.error('Queue move error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
