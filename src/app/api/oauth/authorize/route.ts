import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GHL OAuth authorization URL generator
export async function GET(request: NextRequest) {
  const clientId = process.env.GHL_OAUTH_CLIENT_ID
  
  if (!clientId) {
    return NextResponse.json({ error: 'Missing GHL_OAUTH_CLIENT_ID' }, { status: 500 })
  }
  
  // The redirect URI must match what's configured in the GHL app
  const redirectUri = 'https://sales.teethandrobots.com/api/oauth/callback'
  
  const scopes = [
    'contacts.readonly',
    'contacts.write',
    'opportunities.readonly',
    'opportunities.write',
    'locations.readonly',
    'locations/customFields.readonly',
    'locations/customFields.write',
    'locations/customValues.readonly',
    'locations/customValues.write',
  ].join(' ')
  
  // Extract version_id (app ID without the suffix)
  const versionId = clientId.split('-')[0]
  
  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&version_id=${versionId}`
  
  return NextResponse.json({
    message: 'Visit this URL to authorize the app for a GHL location:',
    authUrl,
    note: 'You will need to do this once for Vegas and once for SalesJet',
  })
}
