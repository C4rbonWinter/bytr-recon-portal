import { NextResponse } from 'next/server'
import { getTokenStatus } from '@/lib/ghl-oauth'

export const dynamic = 'force-dynamic'

// Friendly names for iMessage alerts
const COMPANY_NAMES: Record<string, string> = {
  vegas: 'Teeth+Robots Vegas',
  salesjet: 'SalesJet (SG + Irvine)',
}

// Check GHL token status - which companies need re-auth
export async function GET() {
  try {
    const status = await getTokenStatus()
    
    const needsReauth = Object.entries(status)
      .filter(([_, v]) => v.needsReauth)
      .map(([k, v]) => ({
        company: k,
        name: COMPANY_NAMES[k] || k,
        since: v.needsReauthAt,
        error: v.lastError,
      }))
    
    return NextResponse.json({
      ok: needsReauth.length === 0,
      needsReauth,
      status,
      reauthUrl: 'https://recon-portal-bytr.vercel.app/api/oauth/authorize',
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
