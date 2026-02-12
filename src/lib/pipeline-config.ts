// Pipeline Stage Configuration
// Maps GHL stage IDs and tags to our kanban columns

export const SUPER_STAGES = ['virtual', 'in_person', 'tx_plan', 'closing', 'financing', 'won', 'cold'] as const
export type SuperStage = typeof SUPER_STAGES[number]

export const STAGE_CONFIG: Record<SuperStage, { name: string; color: string; order: number }> = {
  virtual: { name: 'Virtual', color: 'bg-blue-100 dark:bg-blue-900/30', order: 0 },
  in_person: { name: 'In-Person', color: 'bg-purple-100 dark:bg-purple-900/30', order: 1 },
  tx_plan: { name: 'TX Plan', color: 'bg-amber-100 dark:bg-amber-900/30', order: 2 },
  closing: { name: 'Closing', color: 'bg-orange-100 dark:bg-orange-900/30', order: 3 },
  financing: { name: 'Financing', color: 'bg-cyan-100 dark:bg-cyan-900/30', order: 4 },
  won: { name: 'Won', color: 'bg-green-100 dark:bg-green-900/30', order: 5 },
  cold: { name: 'Cold', color: 'bg-gray-100 dark:bg-gray-800/50', order: 6 },
}

// Days without significant tag changes before marking as Cold
export const COLD_THRESHOLD_DAYS = 20

// Tags that indicate significant activity (resets the cold timer)
export const SIGNIFICANT_TAGS = new Set([
  'activelead',
  'contactreply',
  'inofficeappt',
  'fa-inofficeconsult',
  'fa-virtualconsult',
  'fa-closingconsult',
  'txready',
  'pt-agreement-signed',
  'confirm-call1',
  'confirm-call2',
  'cc-confirm',
])

// Tag → Super Stage mapping (takes precedence over stage)
export const TAG_TO_SUPER: Record<string, SuperStage> = {
  // Virtual
  'fa-virtualconsult': 'virtual',
  'followupschedulevirtual': 'virtual',
  
  // In-Person
  'fa-inofficeconsult': 'in_person',
  'inofficeappt': 'in_person',
  
  // TX Plan
  'txready': 'tx_plan',
  
  // Closing
  'fa-closingconsult': 'closing',
  
  // Financing
  'pt-agreement-signed': 'financing',
  'cherrydenial': 'financing',  // needs attention - financing fell through
  
  // Cold (no-shows and stalled)
  'vc-noshow': 'cold',
  'cc-noshow': 'cold',
  'stop bot': 'cold',
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
  'confirmation (day before appt)': 'in_person',
  'confirmation (2 days out)': 'in_person',
  'confirmation (4 days out)': 'in_person',
  'confirmed': 'in_person',
  'future appointment': 'in_person',
  'future appointments': 'in_person',
  
  // TX Plan
  'tx plan ready': 'tx_plan',
  'proposal sent': 'tx_plan',
  'agreement sent': 'tx_plan',
  
  // Closing
  'closing call': 'closing',
  'negotiation': 'closing',
  'signed': 'closing',
  'signed ': 'closing',  // Note: some have trailing space
  
  // Financing
  'finance link sent': 'financing',
  'approved': 'financing',
  'pp processing': 'financing',
  'pp approved': 'financing',
  'cash patient': 'financing',
  'finance option yes': 'financing',
  'patient preferred link': 'financing',
  'eligible': 'financing',
  'down payment': 'financing',
  'down payment ': 'financing',
  
  // Won (financials completed = truly closed)
  'financials completed': 'won',
  'won': 'won',
  'closed': 'won',
  'sold': 'won',
  'smile design': 'won',
  'pre surgery': 'won',
  'surgery': 'won',
  'surgery completed': 'won',
  'after care': 'won',
  'testimonial': 'won',
  
  // Cold (no-shows, stalled, lost)
  'no show': 'cold',
  'no show oc': 'cold',
  'no show cc': 'cold',
  'virtual no show': 'cold',
  'office no show': 'cold',
  'delayed follow up': 'cold',
  're engage': 'cold',
  're-engage': 'cold',
  'limbo': 'cold',
  'rescheduled': 'cold',
  'lost': 'cold',
  'not interested': 'cold',
  'fico dnq': 'cold',
  'pp dnq': 'cold',
  'un qualified': 'cold',
}

// Stage names to exclude completely (too early in funnel)
export const EXCLUDED_STAGE_NAMES = new Set([
  'activated', 'new lead from lp', 'new lead', 'lead created', 'un scheduled',
  'pre-qual', 'uncategorized', 'recall',
])

// Get super stage from tags - returns the FURTHEST stage found (later stages win)
export function getSuperStageByTags(tags: string[]): SuperStage | null {
  if (!tags || tags.length === 0) return null
  
  let bestStage: SuperStage | null = null
  let bestOrder = -1
  
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim()
    const stage = TAG_TO_SUPER[normalized]
    if (stage) {
      const order = STAGE_CONFIG[stage].order
      // Cold (order 6) should NOT override active stages - treat it as lowest priority for tag matching
      const effectiveOrder = stage === 'cold' ? -1 : order
      if (effectiveOrder > bestOrder) {
        bestStage = stage
        bestOrder = effectiveOrder
      }
    }
  }
  return bestStage
}

// Get super stage from stage NAME (case-insensitive)
export function getSuperStageByName(stageName: string): SuperStage | null {
  const normalized = stageName.toLowerCase().trim()
  if (EXCLUDED_STAGE_NAMES.has(normalized)) {
    return null
  }
  return STAGE_NAME_TO_SUPER[normalized] || null
}

// Check if a deal should be marked cold based on last activity
export function shouldBeCold(lastActivityDate: Date | string | null): boolean {
  if (!lastActivityDate) return true  // No activity = cold
  
  const lastActivity = typeof lastActivityDate === 'string' 
    ? new Date(lastActivityDate) 
    : lastActivityDate
  
  const now = new Date()
  const daysSinceActivity = Math.floor(
    (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
  )
  
  return daysSinceActivity > COLD_THRESHOLD_DAYS
}

// Won stage names - these ALWAYS map to won (tags don't override)
const WON_STAGE_NAMES = new Set([
  'smile design',
  'pre surgery',
  'surgery',
  'surgery completed',
  'after care',
  'testimonial',
  'financials completed',
  'won',
  'closed',
  'sold',
])

// Determine super stage: Won stages first, then tags, then other stages, then cold
export function determineSuperStage(
  stageName: string | null,
  tags: string[],
  lastActivityDate: Date | string | null,
  monetaryValue: number = 0
): SuperStage | null {
  // 1. Check if in a Won stage FIRST - these are authoritative, tags don't override
  if (stageName) {
    const normalizedStage = stageName.toLowerCase().trim()
    if (WON_STAGE_NAMES.has(normalizedStage)) {
      // Won stages with $0 invoice go to Financing (awaiting payment)
      // Won stages with invoice > 0 are truly Won
      return monetaryValue > 0 ? 'won' : 'financing'
    }
  }
  
  // 2. Check tags (for non-won stages, tags are most specific signal)
  const tagStage = getSuperStageByTags(tags)
  if (tagStage) return tagStage
  
  // 3. Check stage name for other stages
  if (stageName) {
    const stageResult = getSuperStageByName(stageName)
    
    if (stageResult) {
      // If deal is in an active stage but hasn't had activity in 20+ days, mark cold
      if (stageResult !== 'won' && stageResult !== 'cold' && shouldBeCold(lastActivityDate)) {
        return 'cold'
      }
      return stageResult
    }
  }
  
  // 4. No stage match and no recent activity = cold
  if (shouldBeCold(lastActivityDate)) {
    return 'cold'
  }
  
  return null
}

// Clinic configs with key pipeline IDs for fetching later-stage deals
export const CLINIC_CONFIG = {
  TR01: { 
    locationId: 'cl9YH8PZgv32HEz5pIXT', 
    name: 'San Gabriel', 
    tokenKey: 'ghl-api-sg',
    salesPipelineId: 'PI6UfhZ4zXZn9WsZMPtX',  // "2 Sales Stages"
  },
  TR02: { 
    locationId: 'DJfIuAH1tTxRRBEufitL', 
    name: 'Irvine', 
    tokenKey: 'ghl-api-irv',
    salesPipelineId: '90QnJLnT6TeD8EXF0er5',  // "2 Sales Stages"
  },
  TR04: { 
    locationId: '1isaYfEkvNkyLH3XepI5', 
    name: 'Las Vegas', 
    tokenKey: 'ghl-api-vegas',
    salesPipelineId: 'pMZ709aQj5aN3OgeQebh',  // "2 Sales Stages"
  },
} as const

// GHL User ID → Salesperson Name mapping
export const GHL_USER_MAPPING: Record<string, string> = {
  // Sales Jet instance (TR01 SG + TR02 Irvine)
  'xGHzefX0G70ObVhtULtS': 'Josh',
  'W02cGzjo8DOEvq3EnNH5': 'Chris',
  '40OKojJlHK1QGWxobiFB': 'Molly',
  'R2lQOlnfA2u3ozRUIA5a': 'Scot',
  'dIYBT07Gjs2KnrHqSWiH': 'Jake',
  'DRr7a8bJ3SYfc7Uaonle': 'Blake',
  
  // Teeth+Robots instance (TR04 Vegas)
  'cnHNqiEGjpOOWVzsZnJe': 'Josh',
  'MH14SnZ7liJIMIBd2mge': 'Chris',
  'OYwn6OtVac85ljn26qle': 'Molly',
  'qdkCS02nCbZhGmn0R8zE': 'Scot',
  '1pShLvH7qVgRjaMVp80p': 'Jake',
  'drbfnr6OcLkSfSSxgev0': 'Blake',
}

// Salesperson name → all their GHL user IDs
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
  return GHL_USER_MAPPING[ghlUserId] || 'Unassigned'
}
