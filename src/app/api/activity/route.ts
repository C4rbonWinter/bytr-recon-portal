import { NextRequest, NextResponse } from 'next/server'
import { getActivityHistory, logActivity, ActivityAction } from '@/lib/activity-log'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// GET - Fetch activity history
export async function GET(request: NextRequest) {
  // Get session from cookie
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('recon_session')
  
  if (!sessionCookie?.value) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  let session
  try {
    session = JSON.parse(sessionCookie.value)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  
  const viewerRole = session.role
  const viewerId = session.id
  const isSuperAdmin = session.email === 'cole@bytr.ai'
  
  // Salespeople can't see activity log
  if (viewerRole === 'salesperson' && !isSuperAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  
  // Parse query params
  const params = request.nextUrl.searchParams
  const limit = parseInt(params.get('limit') || '50')
  const offset = parseInt(params.get('offset') || '0')
  const action = params.get('action') as ActivityAction | null
  const userId = params.get('userId')
  const entityType = params.get('entityType')
  const entityId = params.get('entityId')
  const clinic = params.get('clinic')
  const since = params.get('since')
  
  const result = await getActivityHistory({
    viewerRole: isSuperAdmin ? 'superadmin' : viewerRole,
    viewerId,
    limit,
    offset,
    action: action || undefined,
    userId: userId || undefined,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    clinic: clinic || undefined,
    since: since || undefined,
  })
  
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  
  return NextResponse.json({ 
    data: result.data,
    viewerRole: isSuperAdmin ? 'superadmin' : viewerRole,
  })
}

// POST - Log a new activity (internal use)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate required fields
    if (!body.userId || !body.userName || !body.userRole || !body.action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const result = await logActivity({
      userId: body.userId,
      userName: body.userName,
      userRole: body.userRole,
      action: body.action,
      entityType: body.entityType,
      entityId: body.entityId,
      entityName: body.entityName,
      details: body.details,
      clinic: body.clinic,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
