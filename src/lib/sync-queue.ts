// Sync queue for batching GHL updates
import { getSupabase } from './supabase'

export type SyncStatus = 'synced' | 'pending' | 'failed'

export interface PendingMove {
  id: string
  opportunityId: string
  clinic: string
  fromStage: string
  toStage: string
  createdAt: string
  attempts: number
  lastError?: string
  status: 'pending' | 'failed'
}

export interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: string | null
  lastError: string | null
}

// Queue a move for sync
export async function queueMove(move: Omit<PendingMove, 'id' | 'createdAt' | 'attempts' | 'status'>): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('pipeline_moves')
      .insert({
        opportunity_id: move.opportunityId,
        clinic: move.clinic,
        from_stage: move.fromStage,
        to_stage: move.toStage,
        status: 'pending',
        attempts: 0,
      })
    
    if (error) {
      console.error('Failed to queue move:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// Get current sync state
export async function getSyncState(): Promise<SyncState> {
  try {
    const supabase = getSupabase()
    
    // Count pending moves
    const { count: pendingCount, error: countError } = await supabase
      .from('pipeline_moves')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    
    // Count failed moves
    const { count: failedCount } = await supabase
      .from('pipeline_moves')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
    
    // Get last successful sync
    const { data: lastSync } = await supabase
      .from('pipeline_moves')
      .select('synced_at')
      .eq('status', 'synced')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()
    
    let status: SyncStatus = 'synced'
    if ((failedCount || 0) > 0) status = 'failed'
    else if ((pendingCount || 0) > 0) status = 'pending'
    
    return {
      status,
      pendingCount: (pendingCount || 0) + (failedCount || 0),
      lastSyncAt: lastSync?.synced_at || null,
      lastError: null,
    }
  } catch (err) {
    return {
      status: 'failed',
      pendingCount: 0,
      lastSyncAt: null,
      lastError: String(err),
    }
  }
}

// Get pending moves for processing
export async function getPendingMoves(limit = 10): Promise<PendingMove[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pipeline_moves')
    .select('*')
    .in('status', ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit)
  
  if (error || !data) return []
  
  return data.map(row => ({
    id: row.id,
    opportunityId: row.opportunity_id,
    clinic: row.clinic,
    fromStage: row.from_stage,
    toStage: row.to_stage,
    createdAt: row.created_at,
    attempts: row.attempts,
    lastError: row.last_error,
    status: row.status,
  }))
}

// Mark move as synced
export async function markSynced(id: string): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('pipeline_moves')
    .update({ status: 'synced', synced_at: new Date().toISOString() })
    .eq('id', id)
}

// Mark move as failed
export async function markFailed(id: string, error: string, attempts: number): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('pipeline_moves')
    .update({ 
      status: attempts >= 3 ? 'failed' : 'pending', 
      last_error: error,
      attempts,
    })
    .eq('id', id)
}
