import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, importPKCS8 } from 'jose'
import { updateOpportunityValue as ghlOAuthUpdate } from '@/lib/ghl-oauth'

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET

// GHL API tokens (read-only, from Private Integrations)
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
  },
  TR02: { 
    locationId: 'DJfIuAH1tTxRRBEufitL',
    salesPipelineId: '90QnJLnT6TeD8EXF0er5',
  },
  TR04: { 
    locationId: '1isaYfEkvNkyLH3XepI5',
    salesPipelineId: 'pMZ709aQj5aN3OgeQebh',
  },
}

// Target stages (lowercase for matching)
const TARGET_STAGES = new Set([
  'tx plan ready',
  'closing call',
  'agreement sent',
  'signed',
  'signed ',
  'down payment',
  'down payment ',
])

// Google Service Account (base64 encoded JSON)
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
  // Return cached token if still valid (with 5 min buffer)
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken
  }

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error('Missing Google service account credentials', {
      hasEmail: !!GOOGLE_SERVICE_ACCOUNT_EMAIL,
      hasKey: !!GOOGLE_PRIVATE_KEY,
      keyLength: GOOGLE_PRIVATE_KEY?.length
    })
    return null
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    let privateKey
    try {
      privateKey = await importPKCS8(GOOGLE_PRIVATE_KEY, 'RS256')
    } catch (importError) {
      const msg = importError instanceof Error ? importError.message : String(importError)
      console.error('importPKCS8 failed:', msg)
      ;(global as unknown as Record<string, string>).__lastTokenError = `importPKCS8 failed: ${msg}`
      return null
    }
    
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

    if (!tokenRes.ok) {
      const error = await tokenRes.text()
      console.error('Token exchange failed:', error)
      ;(global as unknown as Record<string, string>).__lastTokenError = `Token exchange failed: ${tokenRes.status} ${error}`
      return null
    }

    const tokenData = await tokenRes.json()
    cachedAccessToken = tokenData.access_token
    tokenExpiry = Date.now() + (tokenData.expires_in * 1000)
    
    return cachedAccessToken
  } catch (error) {
    console.error('Failed to get Google access token:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('Error details:', errorMsg)
    // Store error for debug endpoint
    ;(global as unknown as Record<string, string>).__lastTokenError = errorMsg
    return null
  }
}

interface Suggestion {
  name: string
  opportunityId: string
  contactId: string
  currentValue: number
  invoiceValue: number
  ghlLink: string
}

interface SyncResult {
  clinic: string
  processed: number
  updated: number
  errors: string[]
  suggestions?: Suggestion[]
}

// Extract spreadsheet ID from Google Sheets URL
function extractSpreadsheetId(url: string): string | null {
  // Handles: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

// Invoice folder ID
const INVOICE_FOLDER_ID = '1ap__F9HsecKCoJrjyF9gJnqmZFWBrfIs'

// Search Drive folder for invoice by patient name
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
    
    // Return the spreadsheet ID of the first match
    return data.files[0].id
  } catch {
    return null
  }
}

// Get invoice value from spreadsheet ID
async function getInvoiceValueFromSpreadsheet(spreadsheetId: string): Promise<number | null> {
  const accessToken = await getGoogleAccessToken()
  if (!accessToken || !spreadsheetId) return null

  try {
    // Fetch the spreadsheet values (columns A through D to handle different formats)
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:D`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    )
    
    if (!sheetRes.ok) {
      console.error(`Sheets fetch failed: ${sheetRes.status}`)
      return null
    }
    
    const sheetData = await sheetRes.json()
    const values = sheetData.values || []
    
    // Find "TOTAL INVESTMENT" in any column and get the value from the next column
    // Look for the LAST occurrence (in case there's a "BUY NOW DEAL" after)
    let totalValue = 0
    for (const row of values) {
      for (let i = 0; i < row.length - 1; i++) {
        const cell = row[i]?.toString().toUpperCase() || ''
        if (cell.includes('TOTAL INVESTMENT')) {
          // Get value from next column
          const valueStr = row[i + 1]?.toString().replace(/[$,]/g, '') || '0'
          const parsed = parseFloat(valueStr)
          if (!isNaN(parsed) && parsed > 0) {
            totalValue = parsed
          }
        }
      }
    }
    
    return totalValue > 0 ? totalValue : null
  } catch (error) {
    console.error(`Error fetching invoice spreadsheet ${spreadsheetId}:`, error)
    return null
  }
}

// Get invoice value - tries Invoice Link first, then falls back to name search
async function getInvoiceValue(invoiceLink: string | null, patientName: string): Promise<number | null> {
  // Try Invoice Link first
  if (invoiceLink) {
    const spreadsheetId = extractSpreadsheetId(invoiceLink)
    if (spreadsheetId) {
      const value = await getInvoiceValueFromSpreadsheet(spreadsheetId)
      if (value) return value
    }
  }
  
  // Fall back to name search
  const spreadsheetId = await findInvoiceByName(patientName)
  if (spreadsheetId) {
    return await getInvoiceValueFromSpreadsheet(spreadsheetId)
  }
  
  return null
}

// Fetch Invoice Link from GHL contact
async function getContactInvoiceLink(
  clinic: keyof typeof CLINIC_CONFIG,
  contactId: string
): Promise<string | null> {
  const token = GHL_TOKENS[clinic]
  if (!token || !contactId) return null
  
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
    const contact = data.contact
    
    // Invoice Link custom field key
    const invoiceLink = contact?.customFields?.find(
      (f: { id?: string; key?: string }) => 
        f.id === 'KRfLpJEPnmT4Tsb8ov9K' || f.key === 'contact.invoice_link'
    )?.value
    
    return invoiceLink || null
  } catch (error) {
    console.error(`Error fetching contact ${contactId}:`, error)
    return null
  }
}

// Update opportunity using OAuth (write-enabled) tokens
async function updateOpportunityValue(
  clinic: keyof typeof CLINIC_CONFIG,
  opportunityId: string,
  value: number
): Promise<boolean> {
  const config = CLINIC_CONFIG[clinic]
  
  try {
    const result = await ghlOAuthUpdate(config.locationId, opportunityId, value)
    if (!result.success) {
      console.error(`Failed to update opportunity ${opportunityId}:`, result.error)
    }
    return result.success
  } catch (error) {
    console.error(`Failed to update opportunity ${opportunityId}:`, error)
    return false
  }
}

async function syncClinic(clinic: keyof typeof CLINIC_CONFIG, dryRun: boolean = false, maxOpps: number = 100): Promise<SyncResult> {
  const result: SyncResult = {
    clinic,
    processed: 0,
    updated: 0,
    errors: [],
  }
  
  const token = GHL_TOKENS[clinic]
  const config = CLINIC_CONFIG[clinic]
  
  if (!token) {
    result.errors.push('No GHL token')
    return result
  }
  
  try {
    // Fetch stages to get stage names
    const stagesRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${config.locationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      }
    )
    
    if (!stagesRes.ok) {
      result.errors.push(`Failed to fetch stages: ${stagesRes.status}`)
      return result
    }
    
    const stagesData = await stagesRes.json()
    const stageIdToName: Record<string, string> = {}
    for (const pipeline of stagesData.pipelines || []) {
      for (const stage of pipeline.stages || []) {
        stageIdToName[stage.id] = stage.name.toLowerCase().trim()
      }
    }
    
    // Fetch opportunities from sales pipeline
    const oppsRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&status=open&limit=100&pipeline_id=${config.salesPipelineId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
        },
      }
    )
    
    if (!oppsRes.ok) {
      result.errors.push(`Failed to fetch opportunities: ${oppsRes.status}`)
      return result
    }
    
    const oppsData = await oppsRes.json()
    const allOpportunities = oppsData.opportunities || []
    // Apply limit
    const opportunities = allOpportunities.slice(0, maxOpps)
    
    for (const opp of opportunities) {
      const stageName = stageIdToName[opp.pipelineStageId] || ''
      
      // Only process target stages
      if (!TARGET_STAGES.has(stageName)) continue
      
      // Skip if already has a value
      if (opp.monetaryValue && opp.monetaryValue > 0) continue
      
      // Skip test records
      if (opp.name?.toLowerCase().includes('test')) continue
      
      result.processed++
      
      // Try to get Invoice Link from contact (optional)
      const invoiceLink = await getContactInvoiceLink(clinic, opp.contact?.id || opp.contactId)
      
      // Get invoice value - tries Invoice Link first, then name search
      const invoiceValue = await getInvoiceValue(invoiceLink, opp.name)
      
      if (invoiceValue && invoiceValue > 0) {
        result.suggestions = result.suggestions || []
        result.suggestions.push({
          name: opp.name,
          opportunityId: opp.id,
          contactId: opp.contact?.id || opp.contactId,
          currentValue: opp.monetaryValue || 0,
          invoiceValue: invoiceValue,
          ghlLink: `https://app.gohighlevel.com/v2/location/${config.locationId}/contacts/detail/${opp.contact?.id || opp.contactId}`
        })
        
        if (dryRun) {
          // Dry run - just report, don't update
          result.updated++
          console.log(`[DRY RUN] Would update: ${opp.name} → $${invoiceValue}`)
        } else {
          // Attempt to update GHL opportunity with OAuth
          const updated = await updateOpportunityValue(clinic, opp.id, invoiceValue)
          
          if (updated) {
            result.updated++
            console.log(`✓ Updated: ${opp.name} → $${invoiceValue}`)
          } else {
            result.errors.push(`Failed to update ${opp.name}`)
            console.log(`✗ Failed: ${opp.name} → $${invoiceValue}`)
          }
        }
      }
    }
    
    return result
  } catch (error) {
    result.errors.push(`Error: ${error}`)
    return result
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Debug mode - test service account auth
  const testMode = request.nextUrl.searchParams.get('test')
  if (testMode) {
    console.log('Testing service account auth')
    console.log('Service account email:', GOOGLE_SERVICE_ACCOUNT_EMAIL || 'NOT SET')
    console.log('Private key length:', GOOGLE_PRIVATE_KEY?.length || 0)
    
    const accessToken = await getGoogleAccessToken()
    if (!accessToken) {
      return NextResponse.json({ 
        error: 'No access token',
        hasEmail: !!GOOGLE_SERVICE_ACCOUNT_EMAIL,
        hasKey: !!GOOGLE_PRIVATE_KEY,
        keyLength: GOOGLE_PRIVATE_KEY?.length,
        tokenError: (global as unknown as Record<string, string>).__lastTokenError || 'unknown'
      }, { status: 500 })
    }
    
    // Test with a sample invoice link if provided
    const invoiceLink = request.nextUrl.searchParams.get('link')
    if (invoiceLink) {
      const spreadsheetId = extractSpreadsheetId(decodeURIComponent(invoiceLink))
      const value = spreadsheetId ? await getInvoiceValueFromSpreadsheet(spreadsheetId) : null
      return NextResponse.json({
        success: true,
        invoiceLink,
        spreadsheetId,
        invoiceValue: value,
      })
    }
    
    // Test name search
    const testName = request.nextUrl.searchParams.get('name')
    if (testName) {
      const spreadsheetId = await findInvoiceByName(testName)
      const value = spreadsheetId ? await getInvoiceValueFromSpreadsheet(spreadsheetId) : null
      return NextResponse.json({
        success: true,
        testName,
        spreadsheetId,
        invoiceValue: value,
      })
    }
    
    return NextResponse.json({
      success: true,
      message: 'Service account auth working',
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    })
  }
  
  // Check for dry run mode
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'
  
  // Optional clinic filter for testing
  const clinicFilter = request.nextUrl.searchParams.get('clinic') as keyof typeof CLINIC_CONFIG | null
  const clinics = clinicFilter ? [clinicFilter] : ['TR01', 'TR02', 'TR04'] as const
  
  // Optional limit for testing (default 100)
  const limitParam = request.nextUrl.searchParams.get('limit')
  const maxOpps = limitParam ? parseInt(limitParam, 10) : 100
  
  console.log(`Starting invoice value sync... (dryRun: ${dryRun}, clinics: ${clinics.join(', ')}, limit: ${maxOpps})`)
  
  const results: SyncResult[] = []
  
  for (const clinic of clinics) {
    const result = await syncClinic(clinic as keyof typeof CLINIC_CONFIG, dryRun, maxOpps)
    results.push(result)
    console.log(`${clinic}: processed=${result.processed}, updated=${result.updated}`)
  }
  
  const summary = {
    timestamp: new Date().toISOString(),
    dryRun,
    totalProcessed: results.reduce((sum, r) => sum + r.processed, 0),
    totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
    results,
  }
  
  console.log('Sync complete:', JSON.stringify(summary))
  
  return NextResponse.json(summary)
}
