#!/usr/bin/env npx ts-node
/**
 * Invoice Change Detection & Sync
 * 
 * Detects invoices modified since last check, compares to portal,
 * and reports discrepancies for approval.
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const INVOICE_FOLDER_ID = '1ap__F9HsecKCoJrjyF9gJnqmZFWBrfIs';
const STATE_FILE = path.join(__dirname, '../.invoice-sync-state.json');

interface SyncState {
  lastCheckTime: string;
  lastRunAt: string;
}

interface InvoiceChange {
  patientName: string;
  invoiceId: string;
  invoiceLink: string;
  oldAmount: number | null;
  newAmount: number;
  dealId: string | null;
  modifiedTime: string;
}

async function getAuth() {
  // Try different env var names and formats
  let credentials: any;
  
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Base64 encoded JSON
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf-8');
    credentials = JSON.parse(decoded);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } else {
    throw new Error('No Google service account credentials found');
  }
  
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ]
  });
}

async function getModifiedInvoices(auth: any, since: string): Promise<any[]> {
  const drive = google.drive({ version: 'v3', auth });
  
  const query = `'${INVOICE_FOLDER_ID}' in parents and modifiedTime > '${since}' and mimeType = 'application/vnd.google-apps.spreadsheet'`;
  
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc'
  });
  
  return response.data.files || [];
}

function extractPatientName(fileName: string): string {
  // Format: "Invoice - Patient Name - Date"
  const match = fileName.match(/Invoice\s*-\s*(.+?)\s*-\s*\d/i);
  return match ? match[1].trim() : fileName;
}

async function extractTotalFromInvoice(auth: any, fileId: string): Promise<number | null> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: 'A1:E50'
    });
    
    const rows = response.data.values || [];
    const text = rows.map(r => r.join(' ')).join('\n');
    
    // Find TOTAL INVESTMENT line - get the LAST one (in case of BUY NOW DEAL)
    const matches = text.match(/TOTAL INVESTMENT[:\s]*\$?([\d,]+\.?\d*)/gi);
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const amountMatch = lastMatch.match(/\$?([\d,]+\.?\d*)/);
      if (amountMatch) {
        return parseFloat(amountMatch[1].replace(/,/g, ''));
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error reading invoice ${fileId}:`, error);
    return null;
  }
}

async function getPortalDeal(supabase: any, invoiceLink: string): Promise<any | null> {
  const { data } = await supabase
    .from('deals')
    .select('*')
    .ilike('invoice_link', `%${invoiceLink.split('/d/')[1]?.split('/')[0]}%`)
    .single();
  
  return data;
}

async function findDealByPatientName(supabase: any, patientName: string): Promise<any | null> {
  const { data } = await supabase
    .from('deals')
    .select('*')
    .ilike('patient_name', `%${patientName}%`);
  
  return data?.[0] || null;
}

function loadState(): SyncState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
  
  // Default: check last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return {
    lastCheckTime: yesterday.toISOString(),
    lastRunAt: new Date().toISOString()
  };
}

function saveState(state: SyncState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  const forceFullScan = process.argv.includes('--full');
  const dryRun = process.argv.includes('--dry-run');
  
  // Load environment
  require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const auth = await getAuth();
  
  // Load state
  const state = loadState();
  const checkSince = forceFullScan 
    ? new Date(0).toISOString() 
    : state.lastCheckTime;
  
  console.log(`🔍 Checking invoices modified since: ${checkSince}`);
  
  // Get modified invoices
  const modifiedFiles = await getModifiedInvoices(auth, checkSince);
  
  if (modifiedFiles.length === 0) {
    console.log('✅ No invoices modified since last check');
    saveState({ ...state, lastRunAt: new Date().toISOString() });
    return { changes: [], checked: 0 };
  }
  
  console.log(`📄 Found ${modifiedFiles.length} modified invoice(s)`);
  
  const changes: InvoiceChange[] = [];
  
  for (const file of modifiedFiles) {
    const patientName = extractPatientName(file.name);
    const invoiceLink = `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
    const newAmount = await extractTotalFromInvoice(auth, file.id);
    
    if (newAmount === null) {
      console.log(`⚠️  Could not extract amount from: ${file.name}`);
      continue;
    }
    
    // Find matching deal in portal
    let deal = await getPortalDeal(supabase, invoiceLink);
    if (!deal) {
      deal = await findDealByPatientName(supabase, patientName);
    }
    
    const oldAmount = deal?.plan_total || null;
    
    // Check for discrepancy (> $1 difference)
    if (deal && oldAmount !== null && Math.abs(oldAmount - newAmount) > 1) {
      changes.push({
        patientName,
        invoiceId: file.id,
        invoiceLink,
        oldAmount,
        newAmount,
        dealId: deal.id,
        modifiedTime: file.modifiedTime
      });
      
      console.log(`💰 ${patientName}: $${oldAmount.toLocaleString()} → $${newAmount.toLocaleString()}`);
    } else if (!deal) {
      console.log(`❓ ${patientName}: $${newAmount.toLocaleString()} (not in portal)`);
    } else {
      console.log(`✓  ${patientName}: $${newAmount.toLocaleString()} (matches)`);
    }
  }
  
  // Update state
  if (!dryRun) {
    saveState({
      lastCheckTime: new Date().toISOString(),
      lastRunAt: new Date().toISOString()
    });
  }
  
  // Output summary
  if (changes.length > 0) {
    console.log('\n📊 CHANGES DETECTED:');
    console.log('─'.repeat(60));
    for (const change of changes) {
      console.log(`${change.patientName}`);
      console.log(`  Portal: $${change.oldAmount?.toLocaleString()} → Invoice: $${change.newAmount.toLocaleString()}`);
      console.log(`  Diff: ${change.newAmount - (change.oldAmount || 0) > 0 ? '+' : ''}$${(change.newAmount - (change.oldAmount || 0)).toLocaleString()}`);
    }
    console.log('─'.repeat(60));
  }
  
  return { changes, checked: modifiedFiles.length };
}

// Export for use as module
export { main };
export type { InvoiceChange };

// Run if executed directly
if (require.main === module) {
  main()
    .then(result => {
      if (result.changes.length > 0) {
        console.log(`\n⚡ ${result.changes.length} invoice(s) need updating`);
        process.exit(2); // Exit code 2 = changes found
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
