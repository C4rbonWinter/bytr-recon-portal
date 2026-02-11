import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Create the table using raw SQL via the query method
  // Note: This requires the service role key with execute permissions
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS pipeline_moves (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id TEXT NOT NULL,
      clinic TEXT NOT NULL,
      from_stage TEXT NOT NULL,
      to_stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      synced_at TIMESTAMPTZ
    );
  `

  try {
    // Try to insert a dummy record to check if table exists
    const { error: checkError } = await supabase
      .from('pipeline_moves')
      .select('id')
      .limit(1)

    if (checkError?.code === 'PGRST205') {
      // Table doesn't exist - return the SQL to run manually
      return NextResponse.json({
        success: false,
        message: 'Table does not exist. Please run this SQL in Supabase dashboard:',
        sql: createTableSQL,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'pipeline_moves table already exists',
    })
  } catch (error) {
    return NextResponse.json({ 
      error: String(error),
      sql: createTableSQL,
      message: 'Run this SQL in Supabase dashboard if table does not exist',
    }, { status: 500 })
  }
}
