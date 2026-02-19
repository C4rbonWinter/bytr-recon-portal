import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Debug: check env vars
  const clientId = process.env.AUTOBOT_CLIENT_ID;
  const clientSecret = process.env.AUTOBOT_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  
  if (!clientId || !clientSecret || !appUrl) {
    console.error('Missing env vars:', { clientId: !!clientId, clientSecret: !!clientSecret, appUrl: !!appUrl });
    return NextResponse.redirect(new URL('/autobot?error=missing_env_vars', request.url));
  }

  if (error) {
    console.error('OAuth error from GHL:', error);
    return NextResponse.redirect(new URL(`/autobot?error=ghl_${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/autobot?error=no_code', request.url));
  }

  try {
    const redirectUri = `${appUrl}/api/autobot/callback`;
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('Token exchange error:', tokens);
      return NextResponse.redirect(new URL(`/autobot?error=token_${tokens.error}&desc=${encodeURIComponent(tokens.error_description || '')}`, request.url));
    }
    
    if (!tokens.access_token) {
      console.error('No access token in response:', tokens);
      return NextResponse.redirect(new URL('/autobot?error=no_access_token', request.url));
    }

    // Decode the access token to get location/company info
    const tokenPayload = JSON.parse(
      Buffer.from(tokens.access_token.split('.')[1], 'base64').toString()
    );

    const locationId = tokenPayload.authClassId;
    const companyId = tokenPayload.oauthMeta?.companyId || tokenPayload.primaryAuthClassId;
    const scopes = tokenPayload.oauthMeta?.scopes || [];

    // Calculate expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store in autobot_tokens table
    const supabase = getSupabase();
    const { error: upsertError } = await supabase
      .from('autobot_tokens')
      .upsert({
        location_id: locationId,
        company_id: companyId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: expiresAt,
        scopes: scopes,
        updated_at: new Date().toISOString(),
        needs_reauth: false,
        last_error: null,
      }, {
        onConflict: 'location_id',
      });

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError);
      return NextResponse.redirect(new URL(`/autobot?error=db_error`, request.url));
    }

    return NextResponse.redirect(new URL(`/autobot?success=true&location=${locationId}`, request.url));
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/autobot?error=unknown', request.url));
  }
}
