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

// Won stage names (case-insensitive matching)
const WON_STAGE_NAMES = new Set([
  'signed', 'signed ', 'down payment', 'down payment ', 'won', 'closed', 'sold'
])

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

async function getInvoiceValue(patientName: string): Promise<number | null> {
  const spreadsheetId = await findInvoiceByName(patientName)
  if (spreadsheetId) {
    return await getInvoiceValueFromSpreadsheet(spreadsheetId)
  }
  return null
}

interface SyncResult {
  clinic: string
  wonOpportunities: number
  existingDeals: number
  newDealsCreated: number
  errors: string[]
  created: Array<{ name: string; planTotal: number }>
}

async function syncClinic(clinic: keyof typeof CLINIC_CONFIG): Promise<SyncResult> {
  const result: SyncResult = {
    clinic,
    wonOpportunities: 0,
    existingDeals: 0,
    newDealsCreated: 0,
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
    const opportunities = oppsData.opportunities || []
    
    for (const opp of opportunities) {
      const stageName = stageIdToName[opp.pipelineStageId] || ''
      
      // Only process Won stages
      if (!WON_STAGE_NAMES.has(stageName)) continue
      
      // Skip test records
      if (opp.name?.toLowerCase().includes('test')) continue
      
      result.wonOpportunities++
      
      // Check if deal exists in Supabase
      const { data: existingDeal } = await supabase
        .from('deals')
        .select('id')
        .eq('patient_name', opp.name)
        .eq('clinic', clinic)
        .limit(1)
        .single()
      
      if (existingDeal) {
        result.existingDeals++
        continue
      }
      
      // Get invoice value
      const planTotal = await getInvoiceValue(opp.name) || opp.monetaryValue || 0
      
      if (planTotal <= 0) {
        result.errors.push(`No plan total for ${opp.name}`)
        continue
      }
      
      // Create deal in Supabase
      const { error: insertError } = await supabase
        .from('deals')
        .insert({
          patient_name: opp.name,
          clinic: clinic,
          salesperson: opp.assignedTo || '',
          shared_with: null,
          deal_type: 'full_arch', // default
          plan_total: planTotal,
          invoice_link: '',
          notes: `Auto-created from GHL Won opportunity`,
          deal_month: new Date().toISOString().slice(0, 7), // YYYY-MM
          status: 'unpaid',
          ghl_contact_id: opp.contact?.id || opp.contactId || '',
        })
      
      if (insertError) {
        result.errors.push(`Failed to create deal for ${opp.name}: ${insertError.message}`)
      } else {
        result.newDealsCreated++
        result.created.push({ name: opp.name, planTotal })
        console.log(`✓ Created deal: ${opp.name} ($${planTotal})`)
      }
    }
    
    return result
  } catch (error) {
    result.errors.push(`Error: ${error}`)
    return result
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Optional clinic filter
  const clinicFilter = request.nextUrl.searchParams.get('clinic') as keyof typeof CLINIC_CONFIG | null
  const clinics = clinicFilter ? [clinicFilter] : ['TR01', 'TR02', 'TR04'] as const
  
  console.log(`Starting Won deals sync... (clinics: ${clinics.join(', ')})`)
  
  const results: SyncResult[] = []
  
  for (const clinic of clinics) {
    const result = await syncClinic(clinic as keyof typeof CLINIC_CONFIG)
    results.push(result)
    console.log(`${clinic}: won=${result.wonOpportunities}, existing=${result.existingDeals}, created=${result.newDealsCreated}`)
  }
  
  const summary = {
    timestamp: new Date().toISOString(),
    totalWonOpportunities: results.reduce((sum, r) => sum + r.wonOpportunities, 0),
    totalExistingDeals: results.reduce((sum, r) => sum + r.existingDeals, 0),
    totalNewDealsCreated: results.reduce((sum, r) => sum + r.newDealsCreated, 0),
    results,
  }
  
  console.log('Sync complete:', JSON.stringify(summary))
  
  return NextResponse.json(summary)
}
