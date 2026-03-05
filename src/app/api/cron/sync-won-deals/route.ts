import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT, importPKCS8 } from 'jose'

// Verify cron secret
const CRON_SECRET = process.env.CRON_SECRET

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// GHL API tokens (read-only)
const GHL_TOKENS: Record<string, string> = {
  TR01: process.env.GHL_TOKEN_SG || '',
  TR02: process.env.GHL_TOKEN_IRV || '',
  TR04: process.env.GHL_TOKEN_VEGAS || '',
}

// Clinic configs
const CLINIC_CONFIG = {
  TR01: { 
    locationId: 'cl9YH8PZgv32HEz5pIXT',
    salesPipelineId: 'PI6UfhZ4zXZn9WsZMPtX',
    name: 'San Gabriel',
  },
  TR02: { 
    locationId: 'DJfIuAH1tTxRRBEufitL',
    salesPipelineId: '90QnJLnT6TeD8EXF0er5',
    name: 'Irvine',
  },
  TR04: { 
    locationId: '1isaYfEkvNkyLH3XepI5',
    salesPipelineId: 'pMZ709aQj5aN3OgeQebh',
    name: 'Las Vegas',
  },
}

// Tags that qualify a contact as a deal (any of these)
const DEAL_TAGS = ['txready', 'pt-agreement-signed']

// Invoice Link custom field IDs per location
const INVOICE_LINK_FIELD_IDS: Record<string, string> = {
  TR01: 'KRfLpJEPnmT4Tsb8ov9K', // San Gabriel
  TR02: 'IdlYaG597ASHeuoFeIuk', // Irvine (using Service field as fallback, may need update)
  TR04: 'sYpwniH0Hw7EdoJr8J4K', // Las Vegas
}

// Days of inactivity before dropping a deal (unless paid in full)
const INACTIVITY_DROP_DAYS = 90

// Google Service Account
function getServiceAccountCredentials() {
  const jsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!jsonBase64) return { email: '', key: '' }
  try {
    const json = JSON.parse(Buffer.from(jsonBase64, 'base64').toString('utf8'))
    return { email: json.client_email || '', key: json.private_key || '' }
  } catch {
    return { email: '', key: '' }
  }
}

const { email: GOOGLE_SERVICE_ACCOUNT_EMAIL, key: GOOGLE_PRIVATE_KEY } = getServiceAccountCredentials()

// Cache access token
let cachedAccessToken: string | null = null
let tokenExpiry = 0

async function getGoogleAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken
  }

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    return null
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    const privateKey = await importPKCS8(GOOGLE_PRIVATE_KEY, 'RS256')
    
    const jwt = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey)

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    if (!tokenRes.ok) return null

    const tokenData = await tokenRes.json()
    cachedAccessToken = tokenData.access_token
    tokenExpiry = Date.now() + (tokenData.expires_in * 1000)
    
    return cachedAccessToken
  } catch {
    return null
  }
}

// Invoice folder ID
const INVOICE_FOLDER_ID = '1ap__F9HsecKCoJrjyF9gJnqmZFWBrfIs'

async function findInvoiceByName(patientName: string): Promise<string | null> {
  const accessToken = await getGoogleAccessToken()
  if (!accessToken || !patientName) return null
  
  try {
    const searchQuery = encodeURIComponent(`name contains '${patientName}' and '${INVOICE_FOLDER_ID}' in parents`)
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name)`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    
    if (!searchRes.ok) return null
    
    const data = await searchRes.json()
    if (!data.files || data.files.length === 0) return null
    
    return data.files[0].id
  } catch {
    return null
  }
}

async function getInvoiceValueFromSpreadsheet(spreadsheetId: string): Promise<number | null> {
  const accessToken = await getGoogleAccessToken()
  if (!accessToken || !spreadsheetId) return null

  try {
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:D`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    
    if (!sheetRes.ok) return null
    
    const sheetData = await sheetRes.json()
    const values = sheetData.values || []
    
    let totalValue = 0
    for (const row of values) {
      for (let i = 0; i < row.length - 1; i++) {
        const cell = row[i]?.toString().toUpperCase() || ''
        if (cell.includes('TOTAL INVESTMENT')) {
          const valueStr = row[i + 1]?.toString().replace(/[$,]/g, '') || '0'
          const parsed = parseFloat(valueStr)
          if (!isNaN(parsed) && parsed > 0) {
            totalValue = parsed
          }
        }
      }
    }
    
    return totalValue > 0 ? totalValue : null
  } catch {
    return null
  }
}

// Extract spreadsheet ID from Google Docs/Sheets URL
function extractSpreadsheetId(url: string): string | null {
  if (!url) return null
  // Match patterns like /d/SPREADSHEET_ID/ or /spreadsheets/d/SPREADSHEET_ID
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

// Get invoice link from GHL contact custom fields
async function getInvoiceLinkFromGHL(
  contactId: string, 
  clinic: string, 
  token: string
): Promise<string | null> {
  if (!contactId || !token) return null
  
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      }
    )
    
    if (!res.ok) return null
    
    const data = await res.json()
    const customFields = data.contact?.customFields || []
    const invoiceFieldId = INVOICE_LINK_FIELD_IDS[clinic]
    
    // Find the invoice link field
    for (const field of customFields) {
      // Check by field ID
      if (field.id === invoiceFieldId && field.value) {
        return field.value
      }
      // Also check if any field value looks like a Google Sheets link
      if (typeof field.value === 'string' && 
          field.value.includes('docs.google.com/spreadsheets')) {
        return field.value
      }
    }
    
    return null
  } catch {
    return null
  }
}

async function getInvoiceValue(
  patientName: string, 
  contactId?: string, 
  clinic?: string, 
  token?: string
): Promise<{ value: number | null; link: string | null }> {
  // First, try to get invoice link from GHL custom fields (fast path)
  if (contactId && clinic && token) {
    const ghlInvoiceLink = await getInvoiceLinkFromGHL(contactId, clinic, token)
    if (ghlInvoiceLink) {
      const spreadsheetId = extractSpreadsheetId(ghlInvoiceLink)
      if (spreadsheetId) {
        const value = await getInvoiceValueFromSpreadsheet(spreadsheetId)
        // Return even if value is null - we found the link, just couldn't parse it
        return { value, link: ghlInvoiceLink }
      }
    }
  }
  
  // ONLY fall back to Drive folder search if GHL custom field was empty
  // This is slow, so we avoid it when possible
  const spreadsheetId = await findInvoiceByName(patientName)
  if (spreadsheetId) {
    const value = await getInvoiceValueFromSpreadsheet(spreadsheetId)
    return { value, link: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` }
  }
  
  return { value: null, link: null }
}

interface SyncResult {
  clinic: string
  txreadyContacts: number
  existingDeals: number
  newDealsCreated: number
  skippedNoInvoice: number
  errors: string[]
  created: Array<{ name: string; planTotal: number }>
}

interface DropResult {
  totalChecked: number
  dropped: number
  keptPaidInFull: number
  keptActive: number
  droppedNames: string[]
}

// Check if contact has any qualifying deal tag
function hasQualifyingTag(contact: any): boolean {
  const tags = contact?.tags || []
  return tags.some((tag: string) => 
    DEAL_TAGS.includes(tag.toLowerCase())
  )
}

async function syncClinic(clinic: keyof typeof CLINIC_CONFIG): Promise<SyncResult> {
  const result: SyncResult = {
    clinic,
    txreadyContacts: 0,
    existingDeals: 0,
    newDealsCreated: 0,
    skippedNoInvoice: 0,
    errors: [],
    created: [],
  }
  
  const token = GHL_TOKENS[clinic]
  const config = CLINIC_CONFIG[clinic]
  
  if (!token) {
    result.errors.push('No GHL token')
    return result
  }
  
  try {
    // Fetch ALL opportunities from sales pipeline (with pagination)
    const opportunities: any[] = []
    let startAfter: string | null = null
    let hasMore = true
    
    while (hasMore) {
      const url = new URL('https://services.leadconnectorhq.com/opportunities/search')
      url.searchParams.set('location_id', config.locationId)
      url.searchParams.set('limit', '100')
      url.searchParams.set('pipeline_id', config.salesPipelineId)
      if (startAfter) {
        url.searchParams.set('startAfter', startAfter)
      }
      
      const oppsRes = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      })
      
      if (!oppsRes.ok) {
        result.errors.push(`Failed to fetch opportunities: ${oppsRes.status}`)
        return result
      }
      
      const oppsData = await oppsRes.json()
      const pageOpps = oppsData.opportunities || []
      opportunities.push(...pageOpps)
      
      // Check for more pages
      if (pageOpps.length < 100 || !oppsData.meta?.nextPageUrl) {
        hasMore = false
      } else {
        startAfter = pageOpps[pageOpps.length - 1]?.id
        if (!startAfter) hasMore = false
      }
    }
    
    for (const opp of opportunities) {
      // Prefer contact.contactName over opp.name (opp.name is often incomplete)
      const patientName = opp.contact?.contactName || opp.contact?.name || opp.name || ''
      
      // Skip test records
      if (patientName?.toLowerCase().includes('test')) continue
      
      // Check for qualifying tag on contact (txready OR pt-agreement-signed)
      if (!hasQualifyingTag(opp.contact)) continue
      
      result.txreadyContacts++
      
      // Check if deal exists in Supabase (check both contact name and opp name)
      const { data: existingDeal } = await supabase
        .from('deals')
        .select('id, ghl_stage')
        .eq('clinic', clinic)
        .or(`patient_name.ilike.${patientName},patient_name.ilike.${opp.name}`)
        .limit(1)
        .single()
      
      if (existingDeal) {
        result.existingDeals++
        continue
      }
      
      // Get invoice value - REQUIRED for deal creation
      // First check GHL custom fields, then fall back to Drive folder
      const contactId = opp.contact?.id || opp.contactId || ''
      const { value: planTotal, link: invoiceLink } = await getInvoiceValue(
        patientName, 
        contactId, 
        clinic, 
        token
      )
      
      if (!planTotal || planTotal <= 0) {
        result.skippedNoInvoice++
        result.errors.push(`No invoice found for ${patientName}`)
        continue
      }
      
      // Create deal in Supabase
      const { error: insertError } = await supabase
        .from('deals')
        .insert({
          patient_name: patientName,
          clinic: clinic,
          salesperson: opp.assignedTo || '',
          shared_with: null,
          deal_type: 'full_arch', // default
          plan_total: planTotal,
          invoice_link: invoiceLink || '',
          notes: `Auto-created from GHL`,
          deal_month: new Date().toISOString().slice(0, 7), // YYYY-MM
          status: 'unpaid',
          ghl_contact_id: opp.contact?.id || opp.contactId || '',
          ghl_stage: '', // No longer tracking GHL stage
        })
      
      if (insertError) {
        result.errors.push(`Failed to create deal for ${patientName}: ${insertError.message}`)
      } else {
        result.newDealsCreated++
        result.created.push({ name: patientName, planTotal })
        console.log(`✓ Created deal: ${patientName} ($${planTotal})`)
      }
    }
    
    return result
  } catch (error) {
    result.errors.push(`Error: ${error}`)
    return result
  }
}

// Drop deals with no payment activity for 90+ days (unless paid in full)
async function dropInactiveDeals(): Promise<DropResult> {
  const result: DropResult = {
    totalChecked: 0,
    dropped: 0,
    keptPaidInFull: 0,
    keptActive: 0,
    droppedNames: [],
  }
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DROP_DAYS)
  const cutoffIso = cutoffDate.toISOString()
  
  // Get all deals
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, patient_name, clinic, plan_total, status, created_at')
  
  if (dealsError || !deals) {
    console.error('Failed to fetch deals for drop check:', dealsError)
    return result
  }
  
  // Get all payments
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('deal_id, payment_date, amount')
  
  if (paymentsError) {
    console.error('Failed to fetch payments for drop check:', paymentsError)
    return result
  }
  
  // Group payments by deal
  const paymentsByDeal: Record<string, typeof payments> = {}
  for (const payment of payments || []) {
    if (!paymentsByDeal[payment.deal_id]) {
      paymentsByDeal[payment.deal_id] = []
    }
    paymentsByDeal[payment.deal_id].push(payment)
  }
  
  for (const deal of deals) {
    result.totalChecked++
    
    const dealPayments = paymentsByDeal[deal.id] || []
    const totalCollected = dealPayments.reduce((sum, p) => sum + p.amount, 0)
    
    // Paid in full - never drop
    if (totalCollected >= deal.plan_total) {
      result.keptPaidInFull++
      continue
    }
    
    // Find most recent payment date (or deal creation if no payments)
    let lastActivityDate = deal.created_at
    for (const payment of dealPayments) {
      if (payment.payment_date > lastActivityDate) {
        lastActivityDate = payment.payment_date
      }
    }
    
    // Check if inactive for 90+ days
    if (lastActivityDate < cutoffIso) {
      // Drop the deal (soft delete - mark as archived)
      const { error: archiveError } = await supabase
        .from('deals')
        .update({ 
          status: 'archived' as any,
          notes: `${deal.patient_name} - Auto-archived: no payment activity for ${INACTIVITY_DROP_DAYS}+ days`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deal.id)
      
      if (!archiveError) {
        result.dropped++
        result.droppedNames.push(`${deal.patient_name} (${deal.clinic})`)
        console.log(`✗ Dropped: ${deal.patient_name} (${deal.clinic}) - inactive since ${lastActivityDate}`)
      }
    } else {
      result.keptActive++
    }
  }
  
  return result
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Optional clinic filter
  const clinicFilter = request.nextUrl.searchParams.get('clinic') as keyof typeof CLINIC_CONFIG | null
  const skipDrop = request.nextUrl.searchParams.get('skipDrop') === 'true'
  const clinics = clinicFilter ? [clinicFilter] : ['TR01', 'TR02', 'TR04'] as const
  
  console.log(`Starting deal sync (txready tag)... (clinics: ${clinics.join(', ')})`)
  
  const results: SyncResult[] = []
  
  for (const clinic of clinics) {
    const result = await syncClinic(clinic as keyof typeof CLINIC_CONFIG)
    results.push(result)
    console.log(`${clinic}: txready=${result.txreadyContacts}, existing=${result.existingDeals}, created=${result.newDealsCreated}, noInvoice=${result.skippedNoInvoice}`)
  }
  
  // Run drop check (unless skipped)
  let dropResult: DropResult | null = null
  if (!skipDrop) {
    console.log('Checking for inactive deals to drop...')
    dropResult = await dropInactiveDeals()
    console.log(`Drop check: ${dropResult.dropped} dropped, ${dropResult.keptPaidInFull} kept (paid), ${dropResult.keptActive} kept (active)`)
  }
  
  const summary = {
    timestamp: new Date().toISOString(),
    criteria: `txready tag + invoice amount`,
    dropCriteria: `${INACTIVITY_DROP_DAYS}+ days no payment (unless paid in full)`,
    totalTxreadyContacts: results.reduce((sum, r) => sum + r.txreadyContacts, 0),
    totalExistingDeals: results.reduce((sum, r) => sum + r.existingDeals, 0),
    totalNewDealsCreated: results.reduce((sum, r) => sum + r.newDealsCreated, 0),
    totalSkippedNoInvoice: results.reduce((sum, r) => sum + r.skippedNoInvoice, 0),
    results,
    dropResult,
  }
  
  console.log('Sync complete:', JSON.stringify(summary))
  
  return NextResponse.json(summary)
}
