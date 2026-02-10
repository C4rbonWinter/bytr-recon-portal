// Pipeline Stage Configuration
// Maps GHL stage IDs to our simplified super stages

export const SUPER_STAGES = ['virtual', 'in_person', 'tx_plan', 'closing', 'financing', 'won'] as const
export type SuperStage = typeof SUPER_STAGES[number]

export const STAGE_CONFIG: Record<SuperStage, { name: string; color: string; order: number }> = {
  virtual: { name: 'Virtual', color: 'bg-blue-100 dark:bg-blue-900/30', order: 0 },
  in_person: { name: 'In-Person', color: 'bg-purple-100 dark:bg-purple-900/30', order: 1 },
  tx_plan: { name: 'TX Plan', color: 'bg-amber-100 dark:bg-amber-900/30', order: 2 },
  closing: { name: 'Closing', color: 'bg-orange-100 dark:bg-orange-900/30', order: 3 },
  financing: { name: 'Financing', color: 'bg-cyan-100 dark:bg-cyan-900/30', order: 4 },
  won: { name: 'Won', color: 'bg-green-100 dark:bg-green-900/30', order: 5 },
}

// Stage NAME → Super Stage mapping (works across all clinics)
// Each clinic has different stage IDs but same names
export const STAGE_NAME_TO_SUPER: Record<string, SuperStage> = {
  // Virtual
  'virtual': 'virtual',
  'virtual consult': 'virtual',
  'virtual show': 'virtual',
  'approved virtual': 'virtual',
  
  // In-Person
  'in office': 'in_person',
  'office appt': 'in_person',
  'office show': 'in_person',
  'office consult': 'in_person',
  
  // TX Plan
  'tx plan ready': 'tx_plan',
  'proposal sent': 'tx_plan',
  'agreement sent': 'tx_plan',
  
  // Closing
  'closing call': 'closing',
  'negotiation': 'closing',
  
  // Financing
  'finance link sent': 'financing',
  'approved': 'financing',
  'pp processing': 'financing',
  'pp approved': 'financing',
  'cash patient': 'financing',
  'finance option yes': 'financing',
  
  // Won
  'signed': 'won',
  'signed ': 'won',  // Note: some have trailing space
  'down payment': 'won',
  'down payment ': 'won',
  'won': 'won',
  'closed': 'won',
  'sold': 'won',
}

// Stage names to exclude (lost, too early, or post-close)
export const EXCLUDED_STAGE_NAMES = new Set([
  // Lost/stalled
  'lost', 'not interested', 'fico dnq', 'pp dnq', 'un qualified', 'limbo',
  'no show', 'no show oc', 'no show cc', 'rescheduled',
  // Too early
  'activated', 'new lead from lp', 'new lead', 'lead created', 'un scheduled',
  // Post-close (already a Deal)
  'smile design', 'financials completed', 'pre surgery', 'surgery', 
  'surgery completed', 'after care', 'recall', 'testimonial',
  // Other exclusions
  'uncategorized', 'delayed follow up', 're engage',
])

// Get super stage from stage NAME (case-insensitive)
export function getSuperStageByName(stageName: string): SuperStage | null {
  const normalized = stageName.toLowerCase().trim()
  if (EXCLUDED_STAGE_NAMES.has(normalized)) {
    return null
  }
  return STAGE_NAME_TO_SUPER[normalized] || null
}

// Clinic configs
export const CLINIC_CONFIG = {
  TR01: { locationId: 'cl9YH8PZgv32HEz5pIXT', name: 'San Gabriel', tokenKey: 'ghl-api-sg' },
  TR02: { locationId: 'DJfIuAH1tTxRRBEufitL', name: 'Irvine', tokenKey: 'ghl-api-irv' },
  TR04: { locationId: '1isaYfEkvNkyLH3XepI5', name: 'Las Vegas', tokenKey: 'ghl-api-vegas' },
} as const

// GHL User ID → Salesperson Name mapping
// Two GHL instances: Sales Jet (SG + Irvine) and Teeth+Robots (Vegas)
export const GHL_USER_MAPPING: Record<string, string> = {
  // Sales Jet instance (TR01 SG + TR02 Irvine)
  'xGHzefX0G70ObVhtULtS': 'Josh',
  'W02cGzjo8DOEvq3EnNH5': 'Chris',
  '40OKojJlHK1QGWxobiFB': 'Molly',
  'R2lQOlnfA2u3ozRUIA5a': 'Scot',
  'dIYBT07Gjs2KnrHqSWiH': 'Jake',
  'DRr7a8bJ3SYfc7Uaonle': 'Blake',
  'MIiKkoPZmR9h4ueKFjoY': '(Unknown)',  // TODO: Cole to identify
  
  // Teeth+Robots instance (TR04 Vegas)
  'cnHNqiEGjpOOWVzsZnJe': 'Josh',
  'MH14SnZ7liJIMIBd2mge': 'Chris',
  'OYwn6OtVac85ljn26qle': 'Molly',
  'qdkCS02nCbZhGmn0R8zE': 'Scot',
  '1pShLvH7qVgRjaMVp80p': 'Jake',
  'drbfnr6OcLkSfSSxgev0': 'Blake',
}

// Salesperson name → all their GHL user IDs (for filtering across instances)
export const SALESPERSON_IDS: Record<string, string[]> = {
  'Josh': ['xGHzefX0G70ObVhtULtS', 'cnHNqiEGjpOOWVzsZnJe'],
  'Chris': ['W02cGzjo8DOEvq3EnNH5', 'MH14SnZ7liJIMIBd2mge'],
  'Molly': ['40OKojJlHK1QGWxobiFB', 'OYwn6OtVac85ljn26qle'],
  'Scot': ['R2lQOlnfA2u3ozRUIA5a', 'qdkCS02nCbZhGmn0R8zE'],
  'Jake': ['dIYBT07Gjs2KnrHqSWiH', '1pShLvH7qVgRjaMVp80p'],
  'Blake': ['DRr7a8bJ3SYfc7Uaonle', 'drbfnr6OcLkSfSSxgev0'],
}

export function getSalespersonName(ghlUserId: string | null): string {
  if (!ghlUserId) return 'Unassigned'
  return GHL_USER_MAPPING[ghlUserId] || ghlUserId.slice(0, 8) + '...'
}
