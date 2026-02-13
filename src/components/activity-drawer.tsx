'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { X, ExternalLink } from 'lucide-react'
import { ActivityEntry, formatActivity, getActivityIcon } from '@/lib/activity-log-client'

// Admin emails that can see activity
const ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai', 'cole@teethandrobots.com', 'josh@bytr.ai', 'chris@teethandrobots.com']
const SUPER_ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai']

interface ActivityDrawerProps {
  open: boolean
  onClose: () => void
}

export function ActivityDrawer({ open, onClose }: ActivityDrawerProps) {
  const { data: session } = useSession()
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  
  const userEmail = session?.user?.email || ''
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail)
  const isAdmin = ADMIN_EMAILS.includes(userEmail)
  const viewerRole = isSuperAdmin ? 'superadmin' : isAdmin ? 'admin' : 'salesperson'
  
  const fetchActivities = useCallback(async () => {
    if (!isAdmin && !isSuperAdmin) return
    
    try {
      const res = await fetch('/api/activity?limit=15')
      const data = await res.json()
      if (res.ok) {
        setActivities(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err)
    } finally {
      setLoading(false)
    }
  }, [isAdmin, isSuperAdmin])
  
  useEffect(() => {
    if (open) {
      fetchActivities()
    }
  }, [open, fetchActivities])
  
  // Real-time subscription
  useEffect(() => {
    if (!open || viewerRole === 'salesperson') return
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const channel = supabase
      .channel('activity-drawer')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_log',
        },
        (payload) => {
          const activity = payload.new as ActivityEntry
          
          // Role-based filtering
          if (!isSuperAdmin && viewerRole === 'admin' && activity.user_role !== 'salesperson') {
            return
          }
          
          setActivities(prev => [activity, ...prev].slice(0, 15))
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [open, viewerRole, isSuperAdmin])
  
  // Don't render for non-admins
  if (!isAdmin && !isSuperAdmin) return null
  
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/20 dark:bg-black/40 z-40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={`fixed right-0 top-0 h-full w-96 bg-card border-l border-border shadow-xl z-50 transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Activity</span>
            {viewerRole === 'superadmin' && (
              <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">
                All
              </span>
            )}
            {viewerRole === 'admin' && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                Team
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link 
              href="/activity" 
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={onClose}
            >
              View all <ExternalLink className="h-3 w-3" />
            </Link>
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-56px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No recent activity
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activities.map((activity) => (
                <div key={activity.id} className="px-4 py-3 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{getActivityIcon(activity.action)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        {formatActivity(activity)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(activity.created_at)}
                        </span>
                        {activity.clinic && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="text-xs text-muted-foreground">
                              {activity.clinic}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
