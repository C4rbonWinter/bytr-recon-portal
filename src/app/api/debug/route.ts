import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  
  // Query directly for the Marilu record
  const { data, error } = await supabase
    .from('opportunities')
    .select('id, name, deal_type, contact_id, clinic')
    .eq('contact_id', 'YGXx7OjLoHgMJh9Q4rmk')
  
  return NextResponse.json({
    raw: data,
    error: error?.message,
    supabaseUrl: process.env.SUPABASE_URL?.slice(0, 30),
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10),
  })
}
