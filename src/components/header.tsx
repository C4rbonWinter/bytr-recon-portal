'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { Bell, RefreshCw, Activity } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Logo } from '@/components/logo'
import { SyncIndicator } from '@/components/sync-indicator'
import { ActivityDrawer } from '@/components/activity-drawer'

interface ViewAsOption {
  id: string
  name: string
}

interface UnverifiedPayment {
  paymentId: string
  dealId: string
  patientName: string
  amount: number
  date: string
}

interface HeaderProps {
  onNewDeal?: () => void
  onRefresh?: () => void
  viewAsOptions?: ViewAsOption[]
  currentViewAs?: string
  onViewAsChange?: (id: string) => void
  unverifiedPayments?: UnverifiedPayment[]
  onPaymentClick?: (dealId: string) => void
}

export function Header({ onNewDeal, onRefresh, viewAsOptions, currentViewAs, onViewAsChange, unverifiedPayments = [], onPaymentClick }: HeaderProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showActivityDrawer, setShowActivityDrawer] = useState(false)
  
  const isDeals = pathname === '/'
  const isPipeline = pathname === '/pipeline'
  const isActivity = pathname === '/activity'
  
  // Admin-only navigation (activity log)
  const ADMIN_EMAILS = ['cole@bytr.ai', 'rick@bytr.ai', 'cole@teethandrobots.com', 'josh@bytr.ai', 'chris@teethandrobots.com']
  const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email)
  
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)

  return (
    <header className="bg-card border-b border-border">
      <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-2">
          <Logo className="h-5 w-auto" />
          <span className="font-semibold text-foreground tracking-tight">Teeth+Robots</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-sm text-muted-foreground">Sales Recon</span>
        </div>
        
        {/* Center: Navigation */}
        <nav className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          <Link 
            href="/" 
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isDeals 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            Deals
          </Link>
          <Link 
            href="/pipeline" 
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isPipeline 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            Pipeline
          </Link>
          {isAdmin && (
            <Link 
              href="/activity" 
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActivity 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              Activity
            </Link>
          )}
        </nav>
        
        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Activity drawer button - admin only */}
          {isAdmin && (
            <button
              onClick={() => setShowActivityDrawer(true)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary"
              title="Activity Log"
            >
              <Activity className="h-5 w-5" />
            </button>
          )}
          
          <ThemeToggle />
          
          {/* Notifications Bell - unverified cash payments */}
          {unverifiedPayments.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center font-medium">
                  {unverifiedPayments.length}
                </span>
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-lg shadow-lg border border-border z-30">
                  <div className="px-4 py-2 border-b border-border">
                    <span className="text-sm font-medium text-foreground">Cash Payments to Verify</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {unverifiedPayments.map((payment) => (
                      <button
                        key={payment.paymentId}
                        onClick={() => {
                          onPaymentClick?.(payment.dealId)
                          setShowNotifications(false)
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border last:border-b-0"
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-sm text-foreground">{payment.patientName}</span>
                          <span className="text-sm font-bold text-chart-1">{formatCurrency(payment.amount)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{payment.date}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* View As Dropdown - shown on Pipeline */}
          {viewAsOptions && onViewAsChange && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">View as:</span>
              <select
                value={currentViewAs}
                onChange={(e) => onViewAsChange(e.target.value)}
                className="border border-border rounded-lg pl-3 pr-6 py-1.5 text-sm bg-secondary text-foreground"
              >
                {viewAsOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            </div>
          )}
          
          {/* New Deal Button - shown on Deals page */}
          {onNewDeal && isDeals && (
            <button
              onClick={onNewDeal}
              className="bg-foreground text-background px-4 py-1.5 rounded-lg hover:bg-foreground/90 transition text-sm font-medium"
            >
              + New Deal
            </button>
          )}
          
          {/* Refresh Button - shown on Pipeline page */}
          {onRefresh && isPipeline && (
            <button
              onClick={onRefresh}
              className="bg-foreground text-background px-4 py-1.5 rounded-lg hover:bg-foreground/90 transition text-sm font-medium flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          )}
          
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            Log Out
          </button>
          
          {/* Sync Status Indicator - far right */}
          {isPipeline && <SyncIndicator />}
        </div>
      </div>
      
      {/* Activity Drawer */}
      {isAdmin && (
        <ActivityDrawer 
          open={showActivityDrawer} 
          onClose={() => setShowActivityDrawer(false)} 
        />
      )}
    </header>
  )
}
