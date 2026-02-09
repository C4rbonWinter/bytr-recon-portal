import { NextRequest, NextResponse } from 'next/server'

// GHL Location configs
const locations = [
  { id: 'cl9YH8PZgv32HEz5pIXT', clinic: 'TR01', name: 'San Gabriel', token: process.env.GHL_TOKEN_SG },
  { id: 'DJfIuAH1tTxRRBEufitL', clinic: 'TR02', name: 'Irvine', token: process.env.GHL_TOKEN_IRV },
  { id: '1isaYfEkvNkyLH3XepI5', clinic: 'TR04', name: 'Las Vegas', token: process.env.GHL_TOKEN_VEGAS },
]

interface GHLContact {
  id: string
  firstName?: string
  lastName?: string
  contactName?: string
  email?: string
  phone?: string
  customFields?: Array<{ id: string; key?: string; field_key?: string; value: string }>
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const clinicFilter = searchParams.get('clinic') // Optional: TR01, TR02, TR04
  
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const results: Array<{
    id: string
    name: string
    clinic: string
    clinicName: string
    email?: string
    phone?: string
    invoiceLink?: string
    planTotal?: number
  }> = []

  // Filter locations if clinic specified
  const locationsToSearch = clinicFilter 
    ? locations.filter(loc => loc.clinic === clinicFilter)
    : locations

  // Search locations in parallel
  const searches = locationsToSearch.map(async (loc) => {
    if (!loc.token) return []
    
    try {
      const response = await fetch(
        `https://services.leadconnectorhq.com/contacts/?query=${encodeURIComponent(query)}&locationId=${loc.id}&limit=10`,
        {
          headers: {
            'Authorization': `Bearer ${loc.token}`,
            'Version': '2021-07-28',
          },
        }
      )
      
      if (!response.ok) return []
      
      const data = await response.json()
      const contacts: GHLContact[] = data.contacts || []
      
      return contacts.map((contact) => {
        // Look for invoice link in custom fields (field ID varies by location)
        const invoiceLinkField = contact.customFields?.find(
          (f) => f.key === 'contact.invoice_link' || 
                 f.field_key === 'contact.invoice_link' ||
                 f.id === 'KRfLpJEPnmT4Tsb8ov9K' // SG invoice link field
        )
        
        // Build name from available fields
        const name = contact.contactName || 
          `${contact.firstName || ''} ${contact.lastName || ''}`.trim() ||
          'Unknown'
        
        return {
          id: contact.id,
          name,
          clinic: loc.clinic,
          clinicName: loc.name,
          email: contact.email,
          phone: contact.phone,
          invoiceLink: invoiceLinkField?.value,
        }
      })
    } catch (error) {
      console.error(`GHL search error for ${loc.name}:`, error)
      return []
    }
  })

  const searchResults = await Promise.all(searches)
  results.push(...searchResults.flat())

  return NextResponse.json({ results })
}
