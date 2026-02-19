import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const clientId = process.env.AUTOBOT_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/autobot/callback`;
  
  // Match scopes from GHL marketplace app exactly
  const scopes = [
    'businesses.readonly',
    'businesses.write', 
    'calendars.readonly',
    'calendars.write',
    'calendars/events.readonly',
    'calendars/events.write',
    'campaigns.readonly',
    'conversations.readonly',
    'conversations.write',
    'conversations/message.readonly',
    'conversations/message.write',
    'contacts.write',
    'contacts.readonly',
    'courses.write',
    'courses.readonly',
    'forms.readonly',
    'forms.write',
    'invoices.readonly',
    'invoices.write',
    'locations.readonly',
    'locations/customValues.readonly',
    'locations/customValues.write',
    'locations/customFields.readonly',
    'locations/customFields.write',
    'locations/tasks.readonly',
    'locations/tasks.write',
    'locations/tags.readonly',
    'locations/tags.write',
    'oauth.write',
    'oauth.readonly',
    'opportunities.readonly',
    'opportunities.write',
    'payments/orders.readonly',
    'payments/orders.write',
    'surveys.readonly',
    'users.readonly',
    'workflows.readonly',
    'phonenumbers.read',
    'numberpools.read',
    'documents_contracts/list.readonly',
    'documents_contracts/sendLink.write',
    'documents_contracts_template/sendLink.write',
    'documents_contracts_template/list.readonly',
    'voice-ai-dashboard.readonly',
    'voice-ai-agents.readonly',
    'voice-ai-agents.write',
    'voice-ai-agent-goals.readonly',
    'voice-ai-agent-goals.write',
    'knowledge-bases.write',
    'knowledge-bases.readonly',
    'conversation-ai.readonly',
    'conversation-ai.write',
    'agent-studio.readonly',
    'agent-studio.write',
  ].join(' ');

  // Use gohighlevel.com domain (not leadconnectorhq.com)
  const authUrl = new URL('https://marketplace.gohighlevel.com/oauth/chooselocation');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('client_id', clientId!);
  authUrl.searchParams.set('scope', scopes);
  // version_id matches client_id for marketplace apps
  authUrl.searchParams.set('version_id', clientId!);

  return NextResponse.redirect(authUrl.toString());
}
