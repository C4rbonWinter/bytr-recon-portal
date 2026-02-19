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
    
    // Log to webhook logs
    const supabase = getSupabase();
    await supabase.from('autobot_webhook_logs').insert({
      event_type: 'OpportunityStageUpdate',
      payload: payload,
      received_at: new Date().toISOString(),
    });

    const { opportunityId, locationId, pipelineId, stageId, stageName, contactId } = payload;
    
    console.log('[OpportunityStageUpdate]', {
      opportunityId,
      locationId,
      pipelineId,
      stageId,
      stageName,
      contactId,
      timestamp: new Date().toISOString(),
    });
    
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[OpportunityStageUpdate Error]', err);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}
