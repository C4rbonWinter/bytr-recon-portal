import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Simple auth check
  const authHeader = request.headers.get('x-api-key')
  if (authHeader !== 'recon-sync-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabase()
    const url = new URL(request.url)
    const action = url.searchParams.get('action') || 'reset'
    
    if (action === 'delete') {
      // Delete all failed items (use for stuck items that can't be fixed)
      const { data, error } = await supabase
        .from('pipeline_moves')
        .delete()
        .eq('status', 'failed')
        .select('id')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true, 
        deleted: data?.length || 0,
        message: `Deleted ${data?.length || 0} failed items`
      })
    }
    
    if (action === 'delete-deal-type') {
      // Delete all deal_type_change items (these need contacts.write scope we don't have)
      const { data, error } = await supabase
        .from('pipeline_moves')
        .delete()
        .eq('from_stage', 'deal_type_change')
        .select('id')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true, 
        deleted: data?.length || 0,
        message: `Deleted ${data?.length || 0} deal_type_change items`
      })
    }
    
    // Default: Reset all failed items to pending with 0 attempts
    const { data, error } = await supabase
      .from('pipeline_moves')
      .update({ status: 'pending', attempts: 0 })
      .eq('status', 'failed')
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      reset: data?.length || 0,
      message: `Reset ${data?.length || 0} failed items to pending`
    })
  } catch (error) {
    console.error('Reset failed error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
