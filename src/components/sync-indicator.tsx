'use client'

import { useState, useEffect } from 'react'
import { SyncState } from '@/lib/sync-queue'

interface SyncIndicatorProps {
  className?: string
}

export function SyncIndicator({ className = '' }: SyncIndicatorProps) {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'synced',
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
  })
  const [isHovered, setIsHovered] = useState(false)

  // Poll sync state every 10 seconds
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('/api/pipeline/sync-state')
        if (res.ok) {
          const data = await res.json()
          setSyncState(data)
        }
      } catch (err) {
        console.error('Failed to fetch sync state:', err)
      }
    }

    fetchState()
    const interval = setInterval(fetchState, 10000)
    return () => clearInterval(interval)
  }, [])

  const colors = {
    synced: 'bg-green-500',
    pending: 'bg-yellow-500 animate-pulse',
    failed: 'bg-red-500',
  }

  const labels = {
    synced: 'All changes synced',
    pending: `${syncState.pendingCount} change${syncState.pendingCount !== 1 ? 's' : ''} pending`,
    failed: `Sync failed: ${syncState.lastError || 'Unknown error'}`,
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div 
      className={`relative ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* The dot */}
      <div 
        className={`w-3 h-3 rounded-full ${colors[syncState.status]} cursor-help transition-all`}
        title={labels[syncState.status]}
      />
      
      {/* Tooltip on hover */}
      {isHovered && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg p-3 z-50 text-xs">
          <div className="font-medium text-foreground mb-1">
            {labels[syncState.status]}
          </div>
          <div className="text-muted-foreground">
            Last sync: {formatTime(syncState.lastSyncAt)}
          </div>
          {syncState.status === 'failed' && syncState.lastError && (
            <div className="text-red-400 mt-1 truncate" title={syncState.lastError}>
              {syncState.lastError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
