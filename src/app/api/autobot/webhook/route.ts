import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    // Log all webhooks to a table for debugging
    const supabase = getSupabase();
    await supabase.from('autobot_webhook_logs').insert({
      event_type: payload.type || 'unknown',
      payload: payload,
      received_at: new Date().toISOString(),
    });

    console.log('[Autobot Webhook]', JSON.stringify(payload, null, 2));
    
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Autobot Webhook Error]', err);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}
