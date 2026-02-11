import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  
  // Test 1: select * with clinic filter
  const { data: test1 } = await supabase
    .from('opportunities')
    .select('*')
    .eq('clinic', 'TR02')
    .eq('id', 'VPys1bsyugU2eNRjgLkK')
  
  // Test 2: explicit columns with clinic filter
  const { data: test2 } = await supabase
    .from('opportunities')
    .select('id, name, deal_type')
    .eq('clinic', 'TR02')
    .eq('id', 'VPys1bsyugU2eNRjgLkK')
  
  // Test 3: select * with id filter only
  const { data: test3 } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', 'VPys1bsyugU2eNRjgLkK')
  
  // Test 4: explicit columns with id filter only
  const { data: test4 } = await supabase
    .from('opportunities')
    .select('id, name, deal_type')
    .eq('id', 'VPys1bsyugU2eNRjgLkK')
  
  return NextResponse.json({
    test1_selectAll_clinicFilter: test1?.[0] ? { deal_type: test1[0].deal_type } : null,
    test2_explicit_clinicFilter: test2?.[0] ? { deal_type: test2[0].deal_type } : null,
    test3_selectAll_idOnly: test3?.[0] ? { deal_type: test3[0].deal_type } : null,
    test4_explicit_idOnly: test4?.[0] ? { deal_type: test4[0].deal_type } : null,
  })
}
