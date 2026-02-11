import { NextRequest, NextResponse } from 'next/server'
import { getLocationToken } from '@/lib/ghl-oauth'
import { CLINIC_CONFIG } from '@/lib/pipeline-config'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const results: Record<string, { success: boolean; error?: string }> = {}
  
  for (const [clinic, config] of Object.entries(CLINIC_CONFIG)) {
    try {
      const result = await getLocationToken('', config.locationId)
      results[clinic] = { success: result.success, error: result.error }
    } catch (err) {
      results[clinic] = { success: false, error: String(err) }
    }
  }
  
  return NextResponse.json(results)
}
