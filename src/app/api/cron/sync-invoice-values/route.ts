import { NextRequest, NextResponse } from 'next/server'

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET

// GHL API tokens
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

// Google Sheets API
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || ''
const INVOICE_FOLDER_ID = '1ap__F9HsecKCoJrjyF9gJnqmZFWBrfIs'

interface SyncResult {
  clinic: string
  processed: number
  updated: number
  errors: string[]
}

async function getInvoiceValue(patientName: string): Promise<number | null> {
  if (!GOOGLE_API_KEY) {
    console.error('No Google API key configured')
    return null
  }

  try {
    // Search for invoice by patient name in the folder
    const searchQuery = encodeURIComponent(`name contains '${patientName}' and '${INVOICE_FOLDER_ID}' in parents`)
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&key=${GOOGLE_API_KEY}`
    )
    
    if (!searchRes.ok) {
      console.error(`Drive search failed: ${searchRes.status}`)
      return null
    }
    
    const searchData = await searchRes.json()
    if (!searchData.files || searchData.files.length === 0) {
      return null
    }
    
    // Get the first matching invoice
    const fileId = searchData.files[0].id
    
    // Fetch the spreadsheet values
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/A:B?key=${GOOGLE_API_KEY}`
    )
    
    if (!sheetRes.ok) {
      console.error(`Sheets fetch failed: ${sheetRes.status}`)
      return null
    }
    
    const sheetData = await sheetRes.json()
    const values = sheetData.values || []
    
    // Find "TOTAL INVESTMENT" row and get the value
    // Look for the LAST occurrence (in case there's a "BUY NOW DEAL" after)
    let totalValue = 0
    for (const row of values) {
      if (row[0] && row[0].toString().toUpperCase().includes('TOTAL INVESTMENT')) {
        const valueStr = row[1]?.toString().replace(/[$,]/g, '') || '0'
        const parsed = parseFloat(valueStr)
        if (!isNaN(parsed)) {
          totalValue = parsed
        }
      }
    }
    
    return totalValue > 0 ? totalValue : null
  } catch (error) {
    console.error(`Error fetching invoice for ${patientName}:`, error)
    return null
  }
}

async function updateOpportunityValue(
  clinic: keyof typeof CLINIC_CONFIG,
  opportunityId: string,
  value: number
): Promise<boolean> {
  const token = GHL_TOKENS[clinic]
  if (!token) return false
  
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/opportunities/${opportunityId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          monetaryValue: value,
        }),
      }
    )
    
    return res.ok
  } catch (error) {
    console.error(`Failed to update opportunity ${opportunityId}:`, error)
    return false
  }
}

async function syncClinic(clinic: keyof typeof CLINIC_CONFIG): Promise<SyncResult> {
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
    const opportunities = oppsData.opportunities || []
    
    for (const opp of opportunities) {
      const stageName = stageIdToName[opp.pipelineStageId] || ''
      
      // Only process target stages
      if (!TARGET_STAGES.has(stageName)) continue
      
      // Skip if already has a value
      if (opp.monetaryValue && opp.monetaryValue > 0) continue
      
      // Skip test records
      if (opp.name?.toLowerCase().includes('test')) continue
      
      result.processed++
      
      // Try to find invoice value
      const invoiceValue = await getInvoiceValue(opp.name)
      
      if (invoiceValue && invoiceValue > 0) {
        const updated = await updateOpportunityValue(clinic, opp.id, invoiceValue)
        if (updated) {
          result.updated++
          console.log(`Updated ${opp.name}: $${invoiceValue}`)
        } else {
          result.errors.push(`Failed to update ${opp.name}`)
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
  
  console.log('Starting invoice value sync...')
  
  const results: SyncResult[] = []
  
  for (const clinic of ['TR01', 'TR02', 'TR04'] as const) {
    const result = await syncClinic(clinic)
    results.push(result)
    console.log(`${clinic}: processed=${result.processed}, updated=${result.updated}`)
  }
  
  const summary = {
    timestamp: new Date().toISOString(),
    totalProcessed: results.reduce((sum, r) => sum + r.processed, 0),
    totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
    results,
  }
  
  console.log('Sync complete:', JSON.stringify(summary))
  
  return NextResponse.json(summary)
}
