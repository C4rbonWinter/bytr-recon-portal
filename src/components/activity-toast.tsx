'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSession } from 'next-auth/react'
import { ActivityEntry, formatActivity, getActivityIcon } from '@/lib/activity-log-client'

interface Toast {
  id: string
  activity: ActivityEntry
  visible: boolean
}

// Admin emails that can see activity
const ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai', 'cole@teethandrobots.com', 'josh@bytr.ai', 'chris@teethandrobots.com']
const SUPER_ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai']

export function ActivityToast() {
  const { data: session } = useSession()
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const userEmail = session?.user?.email || ''
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail)
  const isAdmin = ADMIN_EMAILS.includes(userEmail)
  const viewerRole = isSuperAdmin ? 'superadmin' : isAdmin ? 'admin' : 'salesperson'
  
  useEffect(() => {
    // Salespeople don't see toasts
    if (viewerRole === 'salesperson') {
      return
    }
    
    // Skip during SSR/build
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      return
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Subscribe to realtime activity
    const channel = supabase
      .channel('activity-feed')
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
          // Admins only see salesperson activity
          if (!isSuperAdmin && viewerRole === 'admin' && activity.user_role !== 'salesperson') {
            return
          }
          
          // Don't show own activity
          if (activity.details?.email === userEmail) {
            return
          }
          
          // Add toast
          const toast: Toast = {
            id: activity.id,
            activity,
            visible: true,
          }
          
          setToasts(prev => [toast, ...prev].slice(0, 5)) // Keep max 5 toasts
          
          // Auto-dismiss after 5 seconds
          setTimeout(() => {
            setToasts(prev => 
              prev.map(t => t.id === toast.id ? { ...t, visible: false } : t)
            )
            // Remove from DOM after animation
            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.id !== toast.id))
            }, 300)
          }, 5000)
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [viewerRole, isSuperAdmin, userEmail])
  
  const dismissToast = (id: string) => {
    setToasts(prev => 
      prev.map(t => t.id === id ? { ...t, visible: false } : t)
    )
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 300)
  }
  
  if (toasts.length === 0) return null
  
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto
            bg-white dark:bg-zinc-800
            rounded-xl shadow-lg
            border border-zinc-200 dark:border-zinc-700
            p-4 min-w-[300px] max-w-[400px]
            transform transition-all duration-300 ease-out
            ${toast.visible 
              ? 'translate-x-0 opacity-100' 
              : 'translate-x-full opacity-0'
            }
          `}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">{getActivityIcon(toast.activity.action)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {formatActivity(toast.activity)}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {new Date(toast.activity.created_at).toLocaleTimeString()}
                {toast.activity.clinic && ` • ${toast.activity.clinic}`}
              </p>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
