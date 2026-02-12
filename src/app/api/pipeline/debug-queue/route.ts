import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('pipeline_moves')
    .select('id, opportunity_id, clinic, from_stage, to_stage, status, attempts, last_error, created_at')
    .in('status', ['pending', 'failed'])
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ count: data?.length || 0, moves: data })
}
