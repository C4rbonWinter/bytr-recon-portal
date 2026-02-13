// Activity logging system - SERVER ONLY
import { getSupabase } from './supabase'

// Re-export types from client module
export type { ActivityAction, ActivityEntry } from './activity-log-client'
export { formatActivity, getActivityIcon } from './activity-log-client'

import type { ActivityAction, ActivityEntry } from './activity-log-client'

export interface LogActivityParams {
  userId: string
  userName: string
  userRole: string
  action: ActivityAction
  entityType?: string
  entityId?: string
  entityName?: string
  details?: Record<string, unknown>
  clinic?: string
  ipAddress?: string
  userAgent?: string
}

// Log an activity
export async function logActivity(params: LogActivityParams): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('activity_log')
      .insert({
        user_id: params.userId,
        user_name: params.userName,
        user_role: params.userRole,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        entity_name: params.entityName,
        details: params.details || {},
        clinic: params.clinic,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
      })
    
    if (error) {
      console.error('Failed to log activity:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (err) {
    console.error('Activity log error:', err)
    return { success: false, error: String(err) }
  }
}

// Fetch activity history with role-based filtering
export async function getActivityHistory(params: {
  viewerRole: string
  viewerId: string
  limit?: number
  offset?: number
  action?: ActivityAction
  userId?: string
  entityType?: string
  entityId?: string
  clinic?: string
  since?: string
}): Promise<{ data: ActivityEntry[]; error?: string }> {
  try {
    const supabase = getSupabase()
    let query = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(params.limit || 50)
    
    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 50) - 1)
    }
    
    // Role-based filtering
    // SuperAdmin (Cole) sees all
    // Admin sees salesperson activity only (not other admins)
    // Salesperson sees nothing (handled in API route)
    if (params.viewerRole === 'admin') {
      // Admins only see salesperson activity
      query = query.eq('user_role', 'salesperson')
    }
    // SuperAdmin sees everything (no filter)
    
    // Optional filters
    if (params.action) {
      query = query.eq('action', params.action)
    }
    if (params.userId) {
      query = query.eq('user_id', params.userId)
    }
    if (params.entityType) {
      query = query.eq('entity_type', params.entityType)
    }
    if (params.entityId) {
      query = query.eq('entity_id', params.entityId)
    }
    if (params.clinic) {
      query = query.eq('clinic', params.clinic)
    }
    if (params.since) {
      query = query.gte('created_at', params.since)
    }
    
    const { data, error } = await query
    
    if (error) {
      return { data: [], error: error.message }
    }
    
    return { data: data || [] }
  } catch (err) {
    return { data: [], error: String(err) }
  }
}
