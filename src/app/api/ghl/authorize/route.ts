import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GHL OAuth authorization URL generator
export async function GET(request: NextRequest) {
  const clientId = process.env.GHL_OAUTH_CLIENT_ID
  
  if (!clientId) {
    return NextResponse.json({ error: 'Missing GHL_OAUTH_CLIENT_ID' }, { status: 500 })
  }
  
  // The redirect URI must match what's configured in the GHL app
  const redirectUri = 'https://recon-staging-bytr.vercel.app/api/ghl/callback'
  
  const scopes = [
    'opportunities.readonly',
    'opportunities.write',
    'contacts.readonly',
    'locations.readonly',
  ].join(' ')
  
  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`
  
  return NextResponse.json({
    message: 'Visit this URL to authorize the app for a GHL location:',
    authUrl,
    note: 'You will need to do this once for Vegas and once for SalesJet',
  })
}
