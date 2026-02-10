// Pipeline Stage Configuration
// Maps GHL stage IDs to our simplified super stages

export const SUPER_STAGES = ['leads', 'virtual', 'in_person', 'tx_plan', 'closing', 'financing', 'won'] as const
export type SuperStage = typeof SUPER_STAGES[number]

export const STAGE_CONFIG: Record<SuperStage, { name: string; color: string; order: number }> = {
  leads: { name: 'Leads', color: 'bg-slate-100 dark:bg-slate-800', order: 0 },
  virtual: { name: 'Virtual', color: 'bg-blue-100 dark:bg-blue-900/30', order: 1 },
  in_person: { name: 'In-Person', color: 'bg-purple-100 dark:bg-purple-900/30', order: 2 },
  tx_plan: { name: 'TX Plan', color: 'bg-amber-100 dark:bg-amber-900/30', order: 3 },
  closing: { name: 'Closing', color: 'bg-orange-100 dark:bg-orange-900/30', order: 4 },
  financing: { name: 'Financing', color: 'bg-cyan-100 dark:bg-cyan-900/30', order: 5 },
  won: { name: 'Won', color: 'bg-green-100 dark:bg-green-900/30', order: 6 },
}

// GHL Stage ID → Super Stage mapping
// This needs to be populated per-clinic since stage IDs differ
export const GHL_STAGE_MAPPINGS: Record<string, SuperStage> = {
  // San Gabriel (SG) - cl9YH8PZgv32HEz5pIXT
  'c3f43cd5-ae49-419f-8f38-9e2497ac2826': 'leads',      // Pre-qual
  'b2a7b4ea-acee-4d33-ba79-0f2abee91715': 'leads',      // Qualified
  '3548c59c-8ffb-4533-b676-716409100228': 'leads',      // Hotlist
  '169e71e1-3e58-484c-873f-68fdaaf1d011': 'leads',      // Contacted
  
  '9a72e736-2b10-4edb-913d-a624a0c162f3': 'virtual',    // Virtual
  'a060de1d-fa56-466a-92a2-b2751791b2f9': 'virtual',    // Virtual Consult
  'f639e20d-fd15-4a85-844d-aa0880a464e6': 'virtual',    // Virtual Show
  'a8f44b12-6b7e-4966-a906-0827d758629a': 'virtual',    // Approved Virtual
  
  '26859b28-9a60-4074-96de-762d09d9d9d0': 'in_person',  // In Office
  '0a74f236-be22-484f-81c8-8ec4b28aa38e': 'in_person',  // Office Appt
  '99c06341-9f9d-46fb-8c3b-2a784229fafb': 'in_person',  // Office Show
  '78272a35-f8cc-4ee8-9d4d-c11c8b11bbdb': 'in_person',  // Office consult
  
  '77960452-0a95-4773-af67-0ba5ea6c8b65': 'tx_plan',    // TX Plan Ready
  '325fccdb-e585-453b-85cb-97f602f11e49': 'tx_plan',    // Proposal Sent
  'd5af8b71-2e75-4405-80bb-823e5a2441f2': 'tx_plan',    // Agreement sent
  
  '26c4fa44-bf1e-485e-982f-cc9892d14d1d': 'closing',    // Closing Call
  '9f97641a-8995-4fbd-a733-8153d371f978': 'closing',    // Closing call (dupe)
  '8a928955-88e9-44a2-a1fd-c0e9f92fa226': 'closing',    // Negotiation
  
  'cf7caec1-e577-4d8b-adfa-a59a1b4b4800': 'financing',  // Finance Link Sent
  '6afb56f1-7e71-4157-ad03-2aa7bc0b9438': 'financing',  // Approved
  'f463d207-685b-40ed-899a-5fee39cab430': 'financing',  // PP Processing
  '3e91bfc8-0fb8-47ba-a9f4-64421623a1f0': 'financing',  // PP Approved
  '7d2c9304-2fd8-4ede-940f-cb36de680509': 'financing',  // Cash Patient
  '8fb6bfc7-7394-4f14-a9c3-ac63a7f983dc': 'financing',  // Finance option Yes
  
  '0913ce28-3ca7-48c1-87c9-f074cd207492': 'won',        // Signed
  'f766dcff-9729-4ff6-a33e-e2b745285965': 'won',        // Signed (dupe)
  '78b58d05-dd05-45ef-96e7-45e0131d54e6': 'won',        // Down payment
  '41c61579-a292-4593-a7e3-11147c42168c': 'won',        // Won
  'de3f6c5a-57a9-449a-a4a1-2bfb30162954': 'won',        // Won (dupe)
  'e11c973b-ccde-480f-9d5d-cd747f91feec': 'won',        // Closed
  '1f00ffc3-80d5-4cb6-8fb3-8d681c1c6d4d': 'won',        // Sold
}

// Stages that mean "lost" or "stalled" - filter these out of main pipeline
export const LOST_STAGES = new Set([
  'a23014fe-5324-4bb9-ba8f-48d7b744b0a7', // Lost
  '206450e2-1a33-4dd8-942b-e550b84bbe04', // Lost (dupe)
  '11e00296-e999-44a1-b54c-4514c7416fc4', // Not Interested
  '8b96738b-bc02-467c-b38d-c81e6bc05b80', // FICO DNQ
  '51db2eaa-965a-47bb-ba2c-069e7c4c0543', // PP DNQ
  '98e197cc-5627-4b4c-b21f-94641ec2955a', // Un Qualified
  '50b29a17-c8a6-465e-845b-7c95c10813a1', // Limbo
])

// Stages that are "too early" - not in pipeline yet
export const PRE_PIPELINE_STAGES = new Set([
  '10d8444e-8ca3-41aa-ab4a-cd1fc3c37e48', // Activated
  '03e85f81-6dbf-450e-86b8-a0a01ad94787', // New Lead From LP
  '9a38a50d-201a-4970-9281-f98f4cabcdc1', // New Lead
  'a219aba4-38ee-466b-babd-b61f94a95799', // Lead Created
])

// Stages that are "post-close" - already a Deal
export const POST_CLOSE_STAGES = new Set([
  '4d75b14c-926e-4627-a1c0-c7aed6b779f9', // Smile Design
  'e77231ac-8b3c-4f77-8861-c38061a0a6f2', // Smile design (dupe)
  'e659d806-e4ce-4d45-8b6c-eed0067eb427', // Financials Completed
  'b8151c4f-2c98-4508-8cac-091015c17c41', // Pre surgery
  '35d73d58-9c51-4b91-b29d-613dda7ccdeb', // Surgery
  '13f4c53b-0813-4486-a9c7-a92d9eb3238d', // Surgery completed
  '06368307-57f2-44c6-b0d5-3ae4b30741ab', // After Care
  '8f1a2e65-92ec-4c65-abc7-09fd98c45821', // Recall
])

// Get super stage from GHL stage ID
export function getSuperStage(ghlStageId: string): SuperStage | null {
  if (LOST_STAGES.has(ghlStageId) || PRE_PIPELINE_STAGES.has(ghlStageId) || POST_CLOSE_STAGES.has(ghlStageId)) {
    return null
  }
  return GHL_STAGE_MAPPINGS[ghlStageId] || null
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
