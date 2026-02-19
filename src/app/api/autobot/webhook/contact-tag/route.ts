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
      event_type: 'ContactTagUpdate',
      payload: payload,
      received_at: new Date().toISOString(),
    });

    // Extract tag info
    const { contactId, locationId, tags, type } = payload;
    
    console.log('[ContactTagUpdate]', {
      contactId,
      locationId,
      tags,
      type,
      timestamp: new Date().toISOString(),
    });

    // Check for AI Stop tags
    const aiStopTags = ['ai stop', 'ai discontinue', 'human takeover', 'stop ai'];
    const hasAiStopTag = tags?.some((tag: string) => 
      aiStopTags.some(stopTag => tag.toLowerCase().includes(stopTag))
    );

    if (hasAiStopTag) {
      console.log('[AI STOP TAG DETECTED]', { contactId, locationId, tags });
    }
    
    return NextResponse.json({ received: true, aiStopDetected: hasAiStopTag });
  } catch (err) {
    console.error('[ContactTagUpdate Error]', err);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}
