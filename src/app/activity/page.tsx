'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ActivityEntry, formatActivity, getActivityIcon, ActivityAction } from '@/lib/activity-log-client'
import { createClient } from '@supabase/supabase-js'

const ACTION_FILTERS: { value: ActivityAction | ''; label: string }[] = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Logins' },
  { value: 'deal_move', label: 'Deal Moves' },
  { value: 'deal_update', label: 'Deal Updates' },
  { value: 'deal_type_change', label: 'Type Changes' },
  { value: 'payment_add', label: 'Payments Added' },
  { value: 'payment_verify', label: 'Payments Verified' },
  { value: 'note_add', label: 'Notes Added' },
  { value: 'export', label: 'Exports' },
]

const CLINIC_FILTERS = [
  { value: '', label: 'All Clinics' },
  { value: 'TR01', label: 'San Gabriel' },
  { value: 'TR02', label: 'Irvine' },
  { value: 'TR04', label: 'Las Vegas' },
]

export default function ActivityPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewerRole, setViewerRole] = useState<string>('')
  
  // Filters
  const [actionFilter, setActionFilter] = useState('')
  const [clinicFilter, setClinicFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  
  const fetchActivities = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set('limit', '100')
      if (actionFilter) params.set('action', actionFilter)
      if (clinicFilter) params.set('clinic', clinicFilter)
      
      const res = await fetch(`/api/activity?${params}`)
      const data = await res.json()
      
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login')
          return
        }
        if (res.status === 403) {
          setError('You do not have permission to view the activity log')
          return
        }
        throw new Error(data.error || 'Failed to fetch activities')
      }
      
      setActivities(data.data)
      setViewerRole(data.viewerRole)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [actionFilter, clinicFilter, router])
  
  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])
  
  // Real-time subscription
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const channel = supabase
      .channel('activity-page')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_log',
        },
        (payload) => {
          const activity = payload.new as ActivityEntry
          
          // Apply current filters
          if (actionFilter && activity.action !== actionFilter) return
          if (clinicFilter && activity.clinic !== clinicFilter) return
          
          // Role-based filtering (client-side backup)
          if (viewerRole === 'admin' && activity.user_role !== 'salesperson') return
          
          setActivities(prev => [activity, ...prev].slice(0, 100))
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [actionFilter, clinicFilter, viewerRole])
  
  // Filter by search query
  const filteredActivities = activities.filter(a => {
    if (!searchQuery) return true
    const searchLower = searchQuery.toLowerCase()
    return (
      a.user_name.toLowerCase().includes(searchLower) ||
      a.entity_name?.toLowerCase().includes(searchLower) ||
      formatActivity(a).toLowerCase().includes(searchLower)
    )
  })
  
  // Group by date
  const groupedActivities = filteredActivities.reduce((groups, activity) => {
    const date = new Date(activity.created_at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    if (!groups[date]) groups[date] = []
    groups[date].push(activity)
    return groups
  }, {} as Record<string, ActivityEntry[]>)
  
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-6 py-4 rounded-lg">
          {error}
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/pipeline')}
                className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Activity Log
              </h1>
              {viewerRole === 'superadmin' && (
                <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full">
                  All Activity
                </span>
              )}
              {viewerRole === 'admin' && (
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full">
                  Team Activity
                </span>
              )}
            </div>
            
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {filteredActivities.length} events
            </div>
          </div>
          
          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            >
              {ACTION_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            
            <select
              value={clinicFilter}
              onChange={(e) => setClinicFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            >
              {CLINIC_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
      </header>
      
      {/* Timeline */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {Object.entries(groupedActivities).map(([date, dayActivities]) => (
          <div key={date} className="mb-8">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3 sticky top-[120px] bg-zinc-50 dark:bg-zinc-900 py-2">
              {date}
            </h2>
            
            <div className="space-y-2">
              {dayActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{getActivityIcon(activity.action)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-900 dark:text-zinc-100">
                        {formatActivity(activity)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {new Date(activity.created_at).toLocaleTimeString()}
                        </span>
                        {activity.clinic && (
                          <>
                            <span className="text-zinc-300 dark:text-zinc-600">•</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {activity.clinic}
                            </span>
                          </>
                        )}
                        <span className="text-zinc-300 dark:text-zinc-600">•</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          activity.user_role === 'admin' 
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                            : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}>
                          {activity.user_role}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        {filteredActivities.length === 0 && (
          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
            No activity found
          </div>
        )}
      </main>
    </div>
  )
}
