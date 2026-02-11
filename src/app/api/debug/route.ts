import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  
  // Test exact same query as pipeline route (select *)
  const { data: allData, error: allError } = await supabase
    .from('opportunities')
    .select('*')
    .eq('clinic', 'TR02')
    .order('name')
  
  const marilu = (allData || []).find(o => o.name?.toLowerCase().includes('marilu'))
  
  // Also test specific select
  const { data: specificData, error: specificError } = await supabase
    .from('opportunities')
    .select('id, name, deal_type, contact_id, clinic')
    .eq('contact_id', 'YGXx7OjLoHgMJh9Q4rmk')
  
  return NextResponse.json({
    mariluFromSelectAll: marilu ? { id: marilu.id, name: marilu.name, deal_type: marilu.deal_type } : null,
    mariluFromSpecificSelect: specificData?.[0],
    allError: allError?.message,
    specificError: specificError?.message,
  })
}
