import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  
  // Test via Supabase JS client
  const { data: clientData, error: clientError } = await supabase
    .from('opportunities')
    .select('id, name, deal_type')
    .eq('id', 'VPys1bsyugU2eNRjgLkK')
  
  // Also test with select('*')
  const { data: clientDataAll, error: clientErrorAll } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', 'VPys1bsyugU2eNRjgLkK')
  
  // Test via direct fetch (bypass client)
  const directRes = await fetch(
    `${supabaseUrl}/rest/v1/opportunities?id=eq.VPys1bsyugU2eNRjgLkK&select=id,name,deal_type`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  )
  const directData = await directRes.json()
  
  return NextResponse.json({
    viaClient: clientData?.[0] ? { deal_type: clientData[0].deal_type } : { error: clientError?.message || 'no data' },
    viaClientAll: clientDataAll?.[0] ? { deal_type: clientDataAll[0].deal_type } : { error: clientErrorAll?.message || 'no data' },
    clientRaw: clientData,
    viaDirectFetch: directData?.[0] ? { deal_type: directData[0].deal_type } : null,
    directRaw: directData,
    keyPrefix: supabaseKey.slice(0, 15),
    url: supabaseUrl,
  })
}
