import { NextRequest, NextResponse } from 'next/server'
import { updateDealTypeByContactId, getSupabase } from '@/lib/supabase'
import { CLINIC_CONFIG } from '@/lib/pipeline-config'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, clinic, dealType } = body
    
    if (!contactId || !clinic) {
      return NextResponse.json({ error: 'Missing contactId or clinic' }, { status: 400 })
    }
    
    const config = CLINIC_CONFIG[clinic as keyof typeof CLINIC_CONFIG]
    if (!config) {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 })
    }
    
    const supabase = getSupabase()
    
    // 1. Update Supabase opportunities table immediately (for instant UI)
    const { data: updateResult, error: oppError } = await supabase
      .from('opportunities')
      .update({ deal_type: dealType || null, updated_at: new Date().toISOString() })
      .eq('contact_id', contactId)
      .select('id, name, deal_type')
    
    console.log('Deal type update result:', { contactId, dealType, updateResult, oppError })
    
    if (oppError) {
      console.error('Opportunities update error:', oppError)
      return NextResponse.json({ error: oppError.message }, { status: 500 })
    }
    
    if (!updateResult || updateResult.length === 0) {
      console.error('No opportunity found for contactId:', contactId)
      return NextResponse.json({ error: 'No opportunity found for contact' }, { status: 404 })
    }
    
    // 2. Queue the GHL sync for background processing
    const { error: queueError } = await supabase
      .from('pipeline_moves')
      .insert({
        opportunity_id: contactId, // Using contactId as the key
        clinic,
        from_stage: 'deal_type_change',
        to_stage: dealType || '',
        status: 'pending',
        attempts: 0,
      })
    
    if (queueError) {
      console.error('Failed to queue deal type sync:', queueError)
      // Don't fail the request - Supabase is updated, GHL sync can retry
    }
    
    // 3. Also update deals table if matching record exists
    try {
      await updateDealTypeByContactId(contactId, dealType || '')
    } catch (err) {
      console.error('Deals sync error (non-fatal):', err)
    }
    
    return NextResponse.json({ success: true, queued: !queueError })
  } catch (error) {
    console.error('Deal type update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
