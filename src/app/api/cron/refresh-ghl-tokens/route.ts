import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Location mappings
const LOCATIONS = {
  vegas: {
    companyId: 'wX6xVVyBQwLwMugrEdvR',
    locationId: '1isaYfEkvNkyLH3XepI5',
    envVar: 'GHL_TOKEN_VEGAS',
  },
  sg: {
    companyId: 'VVkTNsveI02sHUrJ0gOM',
    locationId: 'cl9YH8PZgv32HEz5pIXT',
    envVar: 'GHL_TOKEN_SG',
    companyKey: 'salesjet',
  },
  irv: {
    companyId: 'VVkTNsveI02sHUrJ0gOM',
    locationId: 'DJfIuAH1tTxRRBEufitL',
    envVar: 'GHL_TOKEN_IRV',
    companyKey: 'salesjet',
  },
}

interface TokenRow {
  id: string
  company_id: string
  refresh_token: string
  access_token: string
  access_token_expires_at: string
}

async function refreshCompanyToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    console.error('Refresh failed:', await response.text())
    return null
  }

  return response.json()
}

async function getLocationToken(
  companyToken: string,
  companyId: string,
  locationId: string
): Promise<string | null> {
  const response = await fetch('https://services.leadconnectorhq.com/oauth/locationToken', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${companyToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Version': '2021-07-28',
    },
    body: new URLSearchParams({
      companyId,
      locationId,
    }),
  })

  if (!response.ok) {
    console.error(`Location token failed for ${locationId}:`, await response.text())
    return null
  }

  const data = await response.json()
  return data.access_token || null
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // Allow if no secret configured (dev) or secret matches
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = process.env.GHL_OAUTH_CLIENT_ID
  const clientSecret = process.env.GHL_OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing OAuth credentials' }, { status: 500 })
  }

  const supabase = getSupabase()
  const results: Record<string, string> = {}

  try {
    // Fetch all stored tokens
    const { data: tokens, error: fetchError } = await supabase
      .from('ghl_tokens')
      .select('*')

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`)
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ 
        error: 'No tokens found in database. Run OAuth flow first.',
        authUrl: '/api/ghl/authorize'
      }, { status: 400 })
    }

    const tokenMap: Record<string, TokenRow> = {}
    for (const t of tokens) {
      tokenMap[t.id] = t
    }

    // Refresh Vegas company token
    if (tokenMap['vegas']) {
      console.log('Refreshing Vegas company token...')
      const newTokens = await refreshCompanyToken(
        tokenMap['vegas'].refresh_token,
        clientId,
        clientSecret
      )

      if (newTokens) {
        // Save new company tokens
        await supabase.from('ghl_tokens').upsert({
          id: 'vegas',
          company_id: LOCATIONS.vegas.companyId,
          refresh_token: newTokens.refresh_token,
          access_token: newTokens.access_token,
          access_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })

        // Get Vegas location token
        const vegasLocToken = await getLocationToken(
          newTokens.access_token,
          LOCATIONS.vegas.companyId,
          LOCATIONS.vegas.locationId
        )

        if (vegasLocToken) {
          // Save location token to Supabase for the portal to use
          await supabase.from('ghl_location_tokens').upsert({
            id: 'TR04',
            location_id: LOCATIONS.vegas.locationId,
            access_token: vegasLocToken,
            updated_at: new Date().toISOString(),
          })
          results['vegas'] = '✅ refreshed'
        } else {
          results['vegas'] = '⚠️ company refreshed but location token failed'
        }
      } else {
        results['vegas'] = '❌ refresh failed - need re-auth'
      }
    }

    // Refresh SalesJet company token (for SG + Irvine)
    if (tokenMap['salesjet']) {
      console.log('Refreshing SalesJet company token...')
      const newTokens = await refreshCompanyToken(
        tokenMap['salesjet'].refresh_token,
        clientId,
        clientSecret
      )

      if (newTokens) {
        // Save new company tokens
        await supabase.from('ghl_tokens').upsert({
          id: 'salesjet',
          company_id: LOCATIONS.sg.companyId,
          refresh_token: newTokens.refresh_token,
          access_token: newTokens.access_token,
          access_token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })

        // Get SG location token
        const sgLocToken = await getLocationToken(
          newTokens.access_token,
          LOCATIONS.sg.companyId,
          LOCATIONS.sg.locationId
        )

        if (sgLocToken) {
          await supabase.from('ghl_location_tokens').upsert({
            id: 'TR01',
            location_id: LOCATIONS.sg.locationId,
            access_token: sgLocToken,
            updated_at: new Date().toISOString(),
          })
          results['sg'] = '✅ refreshed'
        } else {
          results['sg'] = '⚠️ company refreshed but location token failed'
        }

        // Get Irvine location token
        const irvLocToken = await getLocationToken(
          newTokens.access_token,
          LOCATIONS.irv.companyId,
          LOCATIONS.irv.locationId
        )

        if (irvLocToken) {
          await supabase.from('ghl_location_tokens').upsert({
            id: 'TR02',
            location_id: LOCATIONS.irv.locationId,
            access_token: irvLocToken,
            updated_at: new Date().toISOString(),
          })
          results['irv'] = '✅ refreshed'
        } else {
          results['irv'] = '⚠️ company refreshed but location token failed'
        }
      } else {
        results['sg'] = '❌ refresh failed - need re-auth'
        results['irv'] = '❌ refresh failed - need re-auth'
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Token refresh completed',
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Token refresh error:', err)
    return NextResponse.json({
      success: false,
      error: String(err),
      results,
    }, { status: 500 })
  }
}
