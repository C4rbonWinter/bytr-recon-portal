import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const clientId = process.env.AUTOBOT_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/autobot/callback`;
  
  // Build OAuth URL with all scopes
  const scopes = [
    'businesses.readonly',
    'businesses.write', 
    'calendars.readonly',
    'calendars.write',
    'calendars/events.readonly',
    'calendars/events.write',
    'campaigns.readonly',
    'contacts.readonly',
    'contacts.write',
    'conversations.readonly',
    'conversations.write',
    'conversations/message.readonly',
    'conversations/message.write',
    'forms.readonly',
    'invoices.readonly',
    'invoices.write',
    'locations.readonly',
    'locations.write',
    'locations/customFields.readonly',
    'locations/customFields.write',
    'locations/customValues.readonly',
    'locations/customValues.write',
    'locations/tags.readonly',
    'locations/tags.write',
    'locations/tasks.readonly',
    'locations/tasks.write',
    'oauth.readonly',
    'oauth.write',
    'opportunities.readonly',
    'opportunities.write',
    'payments/orders.readonly',
    'surveys.readonly',
    'users.readonly',
    'workflows.readonly',
  ].join(' ');

  const authUrl = new URL('https://marketplace.leadconnectorhq.com/oauth/chooselocation');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId!);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);

  return NextResponse.redirect(authUrl.toString());
}
