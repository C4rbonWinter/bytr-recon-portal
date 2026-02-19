import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    // Log to webhook logs
    const supabase = getSupabase();
    await supabase.from('autobot_webhook_logs').insert({
      event_type: 'InboundMessage',
      payload: payload,
      received_at: new Date().toISOString(),
    });

    const { contactId, locationId, message, direction, messageType } = payload;
    
    console.log('[InboundMessage]', {
      contactId,
      locationId,
      direction,
      messageType,
      messagePreview: message?.substring(0, 100),
      timestamp: new Date().toISOString(),
    });
    
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[InboundMessage Error]', err);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}
