import { NextRequest, NextResponse } from 'next/server'
import { queueMove } from '@/lib/sync-queue'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { opportunityId, clinic, fromStage, toStage } = await request.json()

    if (!opportunityId || !clinic || !fromStage || !toStage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await queueMove({
      opportunityId,
      clinic,
      fromStage,
      toStage,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Move queued for sync' })
  } catch (error) {
    console.error('Queue move error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
