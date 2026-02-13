import { NextRequest, NextResponse } from 'next/server'
import { seedTokensFromEnv } from '@/lib/ghl-oauth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const result = await seedTokensFromEnv()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
