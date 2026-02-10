import { google } from 'googleapis'

const SPREADSHEET_ID = '1gKKZJUWjgolSEx6geiCeG1RvfSkuDkba505JTGCSCqE'
const DEALS_SHEET = 'Deals'
const PAYMENTS_SHEET = 'Payments'

// Service account auth - credentials from env var
function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}')
  
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheets() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

// Deal type
export interface Deal {
  id: string
  patient_name: string
  clinic: 'TR01' | 'TR02' | 'TR04'
  salesperson: string
  deal_type: string
  plan_total: number
  invoice_link: string
  notes: string
  deal_month: string
  status: 'verified' | 'partial' | 'unpaid' | 'flagged'
  ghl_contact_id: string
  created_at: string
  updated_at: string
  shared_with: string
}

// Payment type
export interface Payment {
  id: string
  deal_id: string
  amount: number
  method: string
  payment_date: string
  verified: boolean
  verified_by: string
  verified_at: string
  source: string
  external_ref: string
  created_at: string
  updated_at: string
}

// Fetch all deals
export async function getDeals(): Promise<Deal[]> {
  const sheets = getSheets()
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${DEALS_SHEET}!A2:N`,
  })
  
  const rows = response.data.values || []
  
  return rows.map((row) => ({
    id: row[0] || '',
    patient_name: row[1] || '',
    clinic: row[2] as Deal['clinic'],
    salesperson: row[3] || '',
    deal_type: row[4] || '',
    plan_total: parseFloat(row[5]) || 0,
    invoice_link: row[6] || '',
    notes: row[7] || '',
    deal_month: row[8] || '',
    status: (row[9] || 'unpaid') as Deal['status'],
    ghl_contact_id: row[10] || '',
    created_at: row[11] || '',
    updated_at: row[12] || '',
    shared_with: row[13] || '',
  }))
}

// Create a deal
export async function createDeal(deal: Omit<Deal, 'id' | 'created_at' | 'updated_at'>): Promise<Deal> {
  const sheets = getSheets()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  
  const row = [
    id,
    deal.patient_name,
    deal.clinic,
    deal.salesperson,
    deal.deal_type,
    deal.plan_total.toString(),
    deal.invoice_link,
    deal.notes,
    deal.deal_month,
    deal.status,
    deal.ghl_contact_id,
    now,
    now,
    deal.shared_with || '',
  ]
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${DEALS_SHEET}!A:N`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  })
  
  return {
    ...deal,
    id,
    created_at: now,
    updated_at: now,
  }
}

// Fetch payments for a deal
export async function getPayments(dealId?: string): Promise<Payment[]> {
  const sheets = getSheets()
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PAYMENTS_SHEET}!A2:L`,
  })
  
  const rows = response.data.values || []
  
  const payments = rows.map((row) => ({
    id: row[0] || '',
    deal_id: row[1] || '',
    amount: parseFloat(row[2]) || 0,
    method: row[3] || '',
    payment_date: row[4] || '',
    verified: row[5] === 'true' || row[5] === 'TRUE',
    verified_by: row[6] || '',
    verified_at: row[7] || '',
    source: row[8] || 'manual',
    external_ref: row[9] || '',
    created_at: row[10] || '',
    updated_at: row[11] || '',
  }))
  
  if (dealId) {
    return payments.filter(p => p.deal_id === dealId)
  }
  
  return payments
}

// Create a payment
export async function createPayment(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
  const sheets = getSheets()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  
  const row = [
    id,
    payment.deal_id,
    payment.amount.toString(),
    payment.method,
    payment.payment_date,
    payment.verified.toString(),
    payment.verified_by,
    payment.verified_at,
    payment.source,
    payment.external_ref,
    now,
    now,
  ]
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PAYMENTS_SHEET}!A:L`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  })
  
  return {
    ...payment,
    id,
    created_at: now,
    updated_at: now,
  }
}

// Update deal status based on payments
export async function updateDealStatus(dealId: string): Promise<void> {
  const sheets = getSheets()
  
  // Get the deal
  const deals = await getDeals()
  const deal = deals.find(d => d.id === dealId)
  if (!deal) return
  
  // Get all payments for this deal
  const payments = await getPayments(dealId)
  
  // Calculate totals
  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0)
  const allVerified = payments.every(p => p.verified)
  
  // Determine status
  let status: Deal['status'] = 'unpaid'
  if (totalCollected >= deal.plan_total && allVerified) {
    status = 'verified'
  } else if (totalCollected > 0 && totalCollected < deal.plan_total) {
    status = 'partial'
  } else if (totalCollected >= deal.plan_total && !allVerified) {
    status = 'partial' // Fully paid but has unverified payments
  }
  
  // Find the row number for this deal (header is row 1, so data starts at row 2)
  const rowIndex = deals.findIndex(d => d.id === dealId) + 2
  
  // Update the status column (J) and updated_at (M)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${DEALS_SHEET}!J${rowIndex}:M${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[status, deal.ghl_contact_id, deal.created_at, new Date().toISOString()]],
    },
  })
}
