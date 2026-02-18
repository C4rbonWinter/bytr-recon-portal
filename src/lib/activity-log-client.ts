// Activity log client utilities - safe for client-side use

export type ActivityAction = 
  | 'login'
  | 'logout'
  | 'deal_move'
  | 'deal_update'
  | 'deal_type_change'
  | 'payment_add'
  | 'payment_added'
  | 'payment_deleted'
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
      return `${name}: Logged in`
    case 'logout':
      return `${name}: Logged out`
    case 'deal_move':
      const from = activity.details.from_stage as string || '?'
      const to = activity.details.to_stage as string || '?'
      return `${name}: Moved ${entity} from ${from} to ${to}`
    case 'deal_update':
      return `${name}: Updated ${entity}`
    case 'deal_type_change':
      const newType = activity.details.deal_type as string || '?'
      return `${name}: Changed ${entity} to ${newType}`
    case 'payment_add':
    case 'payment_added':
      const addAmount = activity.details.amount as number
      const addMethod = activity.details.method as string || ''
      return `${name}: Added $${addAmount?.toLocaleString()} ${addMethod} payment for ${entity}`
    case 'payment_deleted':
      const delAmount = activity.details.amount as number
      const delMethod = activity.details.method as string || ''
      return `${name}: Deleted $${delAmount?.toLocaleString()} ${delMethod} payment from ${entity}`
    case 'payment_verify':
      return `${name}: Verified payment for ${entity}`
    case 'note_add':
      return `${name}: Added note to ${entity}`
    case 'export':
      return `${name}: Exported data`
    default:
      return `${name}: ${(activity.action as string).replace(/_/g, ' ')}`
  }
}

// Get action icon name (Lucide icon names)
export function getActivityIcon(action: ActivityAction): string {
  switch (action) {
    case 'login': return 'log-in'
    case 'logout': return 'log-out'
    case 'deal_move': return 'arrow-right-left'
    case 'deal_update': return 'pencil'
    case 'deal_type_change': return 'tag'
    case 'payment_add':
    case 'payment_added': return 'plus-circle'
    case 'payment_deleted': return 'minus-circle'
    case 'payment_verify': return 'check-circle'
    case 'note_add': return 'message-square'
    case 'export': return 'download'
    default: return 'activity'
  }
}
