import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GHL OAuth callback - exchanges code for tokens and stores them
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  
  if (!code) {
    return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 })
  }
  
  const clientId = process.env.GHL_OAUTH_CLIENT_ID
  const clientSecret = process.env.GHL_OAUTH_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing OAuth credentials' }, { status: 500 })
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
      }),
    })
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      return NextResponse.json({ error: `Token exchange failed: ${error}` }, { status: 500 })
    }
    
    const tokens = await tokenResponse.json()
    
    // Determine which company this is based on the companyId in response
    const companyId = tokens.companyId
    let companyKey = 'unknown'
    
    if (companyId === 'wX6xVVyBQwLwMugrEdvR') {
      companyKey = 'vegas'
    } else if (companyId === 'VVkTNsveI02sHUrJ0gOM') {
      companyKey = 'salesjet'
    }
    
    // Store in Supabase and clear needs_reauth flag
    const supabase = getSupabase()
    await supabase
      .from('ghl_tokens')
      .upsert({
        id: companyKey,
        company_id: companyId,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        // Clear re-auth flags on successful auth
        needs_reauth: false,
        needs_reauth_at: null,
        last_error: null,
      })
    
    return new NextResponse(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>✅ Authorization Successful!</h1>
          <p>Company: <strong>${companyKey}</strong> (${companyId})</p>
          <p>Tokens have been saved to the database.</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
