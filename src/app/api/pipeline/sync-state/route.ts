import { NextResponse } from 'next/server'
import { getSyncState } from '@/lib/sync-queue'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const state = await getSyncState()
    return NextResponse.json(state)
  } catch (error) {
    console.error('Sync state error:', error)
    return NextResponse.json({
      status: 'failed',
      pendingCount: 0,
      lastSyncAt: null,
      lastError: String(error),
    })
  }
}
