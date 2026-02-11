import { NextRequest, NextResponse } from 'next/server'
import { updateDealTypeByContactId, getSupabase } from '@/lib/supabase'
import { CLINIC_CONFIG } from '@/lib/pipeline-config'

// Service (deal type) custom field IDs per clinic
const SERVICE_FIELD_IDS: Record<string, string> = {
  TR01: 'QlA7Mso7jPC20Ng8wHyq',
  TR02: 'IdlYaG597ASHeuoFeIuk',
  TR04: 'fK1TUWuawPzN9pkkxEV7',
}

// Per-location API tokens (private integrations with full access)
const LOCATION_TOKENS: Record<string, string> = {
  TR01: process.env.GHL_TOKEN_TR01 || '',
  TR02: process.env.GHL_TOKEN_TR02 || '',
  TR04: process.env.GHL_TOKEN_TR04 || '',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, clinic, dealType } = body
    
    if (!contactId || !clinic) {
      return NextResponse.json({ error: 'Missing contactId or clinic' }, { status: 400 })
    }
    
    const config = CLINIC_CONFIG[clinic as keyof typeof CLINIC_CONFIG]
    const fieldId = SERVICE_FIELD_IDS[clinic]
    const token = LOCATION_TOKENS[clinic]
    
    if (!config || !fieldId) {
      return NextResponse.json({ error: 'Invalid clinic configuration' }, { status: 400 })
    }
    
    if (!token) {
      console.error(`Missing GHL_TOKEN_${clinic} env var`)
      return NextResponse.json({ error: 'Missing API token for clinic' }, { status: 500 })
    }
    
    // Update the contact's Service custom field using per-location token
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customFields: [
            {
              id: fieldId,
              value: dealType || '',
            }
          ],
        }),
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('GHL update error:', errorText)
      return NextResponse.json({ error: 'Failed to update deal type in GHL' }, { status: 500 })
    }
    
    // Update Supabase opportunities table (for pipeline display)
    const supabase = getSupabase()
    try {
      await supabase
        .from('opportunities')
        .update({ deal_type: dealType || null })
        .eq('contact_id', contactId)
    } catch (err) {
      console.error('Opportunities update error (non-fatal):', err)
    }
    
    // Also update Supabase deals table (if matching deal exists)
    try {
      await updateDealTypeByContactId(contactId, dealType || '')
    } catch (err) {
      console.error('Deals sync error (non-fatal):', err)
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Deal type update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
