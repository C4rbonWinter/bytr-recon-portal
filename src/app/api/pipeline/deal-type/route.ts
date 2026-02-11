import { NextRequest, NextResponse } from 'next/server'

// GHL API tokens
const GHL_TOKENS: Record<string, string> = {
  TR01: process.env.GHL_TOKEN_SG || '',
  TR02: process.env.GHL_TOKEN_IRV || '',
  TR04: process.env.GHL_TOKEN_VEGAS || '',
}

// Service (deal type) custom field IDs per clinic
const SERVICE_FIELD_IDS: Record<string, string> = {
  TR01: 'QlA7Mso7jPC20Ng8wHyq',
  TR02: 'IdlYaG597ASHeuoFeIuk',
  TR04: 'fK1TUWuawPzN9pkkxEV7',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contactId, clinic, dealType } = body
    
    if (!contactId || !clinic) {
      return NextResponse.json({ error: 'Missing contactId or clinic' }, { status: 400 })
    }
    
    const token = GHL_TOKENS[clinic]
    const fieldId = SERVICE_FIELD_IDS[clinic]
    
    if (!token || !fieldId) {
      return NextResponse.json({ error: 'Invalid clinic configuration' }, { status: 400 })
    }
    
    // Update the contact's Service custom field
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
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Deal type update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
