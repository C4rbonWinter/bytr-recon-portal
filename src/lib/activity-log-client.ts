// Activity log client utilities - safe for client-side use

export type ActivityAction = 
  | 'login'
  | 'logout'
  | 'deal_move'
  | 'deal_update'
  | 'deal_type_change'
  | 'payment_add'
  | 'payment_verify'
  | 'note_add'
  | 'export'

export interface ActivityEntry {
  id: string
  created_at: string
  user_id: string
  user_name: string
  user_role: string
  action: ActivityAction
  entity_type?: string
  entity_id?: string
  entity_name?: string
  details: Record<string, unknown>
  clinic?: string
}

// Format activity for display
export function formatActivity(activity: ActivityEntry): string {
  const name = activity.user_name
  const entity = activity.entity_name || activity.entity_id || ''
  
  switch (activity.action) {
    case 'login':
      return `${name} logged in`
    case 'logout':
      return `${name} logged out`
    case 'deal_move':
      const from = activity.details.from_stage as string || '?'
      const to = activity.details.to_stage as string || '?'
      return `${name} moved ${entity} from ${from} to ${to}`
    case 'deal_update':
      return `${name} updated ${entity}`
    case 'deal_type_change':
      const newType = activity.details.deal_type as string || '?'
      return `${name} changed ${entity} to ${newType}`
    case 'payment_add':
      const amount = activity.details.amount as number
      return `${name} added $${amount?.toLocaleString()} payment for ${entity}`
    case 'payment_verify':
      return `${name} verified payment for ${entity}`
    case 'note_add':
      return `${name} added a note to ${entity}`
    case 'export':
      return `${name} exported data`
    default:
      return `${name} performed ${activity.action}`
  }
}

// Get action icon/emoji
export function getActivityIcon(action: ActivityAction): string {
  switch (action) {
    case 'login': return '🔓'
    case 'logout': return '🔒'
    case 'deal_move': return '↔️'
    case 'deal_update': return '✏️'
    case 'deal_type_change': return '🏷️'
    case 'payment_add': return '💰'
    case 'payment_verify': return '✅'
    case 'note_add': return '📝'
    case 'export': return '📊'
    default: return '📋'
  }
}
