'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { CheckCircle2, AlertTriangle, XCircle, Flag, FileSpreadsheet } from 'lucide-react'
import { Header } from '@/components/header'

// GHL User ID → Name mapping for display fallback
const GHL_USER_MAPPING: Record<string, string> = {
  'xGHzefX0G70ObVhtULtS': 'Josh',
  'W02cGzjo8DOEvq3EnNH5': 'Chris',
  '40OKojJlHK1QGWxobiFB': 'Molly',
  'R2lQOlnfA2u3ozRUIA5a': 'Scot',
  'dIYBT07Gjs2KnrHqSWiH': 'Jake',
  'DRr7a8bJ3SYfc7Uaonle': 'Blake',
  'cnHNqiEGjpOOWVzsZnJe': 'Josh',
  'MH14SnZ7liJIMIBd2mge': 'Chris',
  'OYwn6OtVac85ljn26qle': 'Molly',
  'qdkCS02nCbZhGmn0R8zE': 'Scot',
  '1pShLvH7qVgRjaMVp80p': 'Jake',
  'drbfnr6OcLkSfSSxgev0': 'Blake',
  // Setters (map to Unassigned since they're not closers)
  'MIiKkoPZmR9h4ueKFjoY': 'Unassigned', // Monica (setter)
}

function getSalespersonDisplay(value: string | null): string {
  if (!value) return 'Unassigned'
  // If it's a known name, return as-is
  if (['Chris', 'Josh', 'Molly', 'Scot', 'Jake', 'Blake', 'TBD', 'Unassigned'].includes(value)) {
    return value
  }
  // If it's a GHL ID, map it
  return GHL_USER_MAPPING[value] || 'Unassigned'
}

// Types
interface Payment {
  id: string
  amount: number
  method: 'Cash' | 'Credit Card' | 'Cherry' | 'CareCredit' | 'Proceed' | 'Patient Preferred' | 'Check' | 'Alphaeon' | 'Sunbit' | 'HFD' | 'LendingClub' | 'Insurance' | 'ACH/Wire'
  date: string
  verified: boolean
}

interface Deal {
  id: string
  patientName: string
  clinic: 'TR01' | 'TR02' | 'TR04'
  salesperson: string
  sharedWith: string | null
  dealType: 'Double O' | 'Double Z' | 'Single L' | 'Onyx' | 'Other'
  planTotal: number
  collected: number
  verified: boolean
  status: 'verified' | 'partial' | 'unpaid' | 'flagged'
  payments: Payment[]
  dealMonth: string // Format: "2026-01" for January 2026
  notes: string
  invoiceLink: string
}

interface User {
  name: string
  role: 'admin' | 'salesperson'
}

// User comes from session now (see Dashboard component)

// Transform API response to frontend format
function transformDeal(apiDeal: any): Deal {
  return {
    id: apiDeal.id,
    patientName: apiDeal.patient_name,
    clinic: apiDeal.clinic,
    salesperson: apiDeal.salesperson,
    sharedWith: apiDeal.shared_with || null,
    dealType: apiDeal.deal_type,
    planTotal: apiDeal.plan_total,
    collected: apiDeal.collected || 0,
    verified: apiDeal.status === 'verified',
    status: apiDeal.status,
    dealMonth: apiDeal.deal_month,
    notes: apiDeal.notes || '',
    invoiceLink: apiDeal.invoice_link || '',
    payments: (apiDeal.payments || []).map((p: any) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      date: p.payment_date,
      verified: p.verified,
    })),
  }
}

const clinicNames: Record<string, string> = {
  TR01: 'SG',
  TR02: 'IRV', 
  TR04: 'LV',
}

const clinicColors: Record<string, string> = {
  TR01: 'bg-chart-5/10 text-chart-5',
  TR02: 'bg-chart-4/10 text-chart-4',
  TR04: 'bg-chart-2/10 text-chart-2',
}

const ClinicBadge = ({ clinic }: { clinic: string }) => (
  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${clinicColors[clinic] || 'bg-secondary text-muted-foreground'}`}>
    {clinic} ({clinicNames[clinic]})
  </span>
)

// Format deal type for display (snake_case → Title Case, remove "Implants")
function formatDealType(raw: string | null | undefined): string {
  if (!raw) return ''
  // Convert snake_case to spaces, then title case
  const spaced = raw.replace(/_/g, ' ')
  const titled = spaced.replace(/\b\w/g, c => c.toUpperCase())
  // Remove "Implants" suffix as it's implied
  return titled.replace(/\s*Implants?$/i, '').trim()
}

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'verified':
      return <CheckCircle2 className="h-5 w-5 text-success" />
    case 'partial':
      return <AlertTriangle className="h-5 w-5 text-[#fc5707]" />
    case 'unpaid':
      return <XCircle className="h-5 w-5 text-primary" />
    case 'flagged':
      return <Flag className="h-5 w-5 text-primary" />
    default:
      return null
  }
}

const methodIcons: Record<string, string> = {
  'Cash': '💵',
  'Credit Card': '💳',
  'Cherry': '🍒',
  'CareCredit': '💙',
  'Proceed': '📄',
  'Patient Preferred': '🏦',
  'Check': '📝',
  'Alphaeon': '🅰️',
  'Sunbit': '☀️',
  'HFD': '🏥',
  'LendingClub': '🏛️',
  'Insurance': '🛡️',
  'ACH/Wire': '🔌',
}

export default function Dashboard() {
  const { data: session } = useSession()
  const [allDeals, setAllDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [clinicFilter, setClinicFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  // Get user from session (default to Cole's admin view for dev/testing)
  const currentUser: User = {
    name: session?.user?.name || 'Cole',
    role: (session?.user as any)?.role || 'admin',
  }

  const isSalesperson = currentUser.role === 'salesperson'

  // Fetch deals from API
  const fetchDeals = async () => {
    try {
      const response = await fetch('/api/deals')
      const data = await response.json()
      if (data.deals) {
        setAllDeals(data.deals.map(transformDeal))
      }
    } catch (error) {
      console.error('Failed to fetch deals:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeals()
  }, [])

  const handleAddPayment = async (dealId: string, payment: Omit<Payment, 'id' | 'verified'>) => {
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          amount: payment.amount,
          method: payment.method,
          paymentDate: payment.date,
          source: 'manual',
        }),
      })
      
      if (response.ok) {
        // Refresh deals to get updated totals
        await fetchDeals()
        // Update selectedDeal
        setSelectedDeal(prev => {
          if (!prev || prev.id !== dealId) return prev
          const updated = allDeals.find(d => d.id === dealId)
          return updated || prev
        })
      }
    } catch (error) {
      console.error('Failed to add payment:', error)
    }
  }

  const handleDeletePayment = async (dealId: string, paymentId: string) => {
    if (!confirm('Delete this payment?')) return
    try {
      const response = await fetch(`/api/payments?id=${paymentId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        await fetchDeals()
        setSelectedDeal(prev => {
          if (!prev || prev.id !== dealId) return prev
          return { ...prev, payments: prev.payments.filter(p => p.id !== paymentId) }
        })
      }
    } catch (error) {
      console.error('Failed to delete payment:', error)
    }
  }

  const handleVerifyPayment = async (dealId: string, paymentId: string) => {
    try {
      const response = await fetch('/api/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: paymentId,
          verified: true,
          verifiedBy: session?.user?.email || 'admin',
        }),
      })
      
      if (response.ok) {
        await fetchDeals()
        setSelectedDeal(prev => {
          if (!prev || prev.id !== dealId) return prev
          return { 
            ...prev, 
            payments: prev.payments.map(p => 
              p.id === paymentId ? { ...p, verified: true } : p
            ) 
          }
        })
      }
    } catch (error) {
      console.error('Failed to verify payment:', error)
    }
  }

  const handleCreateDeal = async (dealData: any) => {
    try {
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealData),
      })
      
      if (response.ok) {
        await fetchDeals()
        setShowNewDeal(false)
      }
    } catch (error) {
      console.error('Failed to create deal:', error)
    }
  }

  const handleUpdateDeal = async (id: string, updates: { sharedWith?: string | null; salesperson?: string }) => {
    try {
      const response = await fetch('/api/deals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      
      if (response.ok) {
        await fetchDeals()
        setSelectedDeal(prev => {
          if (!prev || prev.id !== id) return prev
          return { 
            ...prev, 
            ...(updates.sharedWith !== undefined && { sharedWith: updates.sharedWith }),
            ...(updates.salesperson !== undefined && { salesperson: updates.salesperson || null }),
          }
        })
      } else {
        const data = await response.json()
        alert('Save failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to update deal:', error)
      alert('Save failed: ' + error)
    }
  }

  // Filter to user's deals only for salespeople (include shared deals)
  const deals = isSalesperson 
    ? allDeals.filter(d => d.salesperson === currentUser.name || d.sharedWith === currentUser.name)
    : allDeals

  // Stats (based on user's visible deals)
  const totalPlanned = deals.reduce((sum, d) => sum + d.planTotal, 0)
  const totalCollected = deals.reduce((sum, d) => sum + d.collected, 0)
  const totalPending = totalPlanned - totalCollected
  const flaggedCount = deals.filter(d => d.status === 'flagged' || d.status === 'partial').length

  // Unverified cash payments for notifications
  const unverifiedPayments = allDeals.flatMap(deal => 
    deal.payments
      .filter(p => p.method === 'Cash' && !p.verified)
      .map(p => ({
        paymentId: p.id,
        dealId: deal.id,
        patientName: deal.patientName,
        amount: p.amount,
        date: p.date,
      }))
  )

  // Handle clicking a notification to open the deal
  const handlePaymentNotificationClick = (dealId: string) => {
    const deal = allDeals.find(d => d.id === dealId)
    if (deal) {
      setSelectedDeal(deal)
    }
  }

  // Get unique months from deals for filter dropdown
  // Normalize months to YYYY-MM format, dedupe, and sort newest first
  const normalizeMonth = (month: string): string => {
    if (!month) return ''
    // Already in YYYY-MM format
    if (/^\d{4}-\d{2}$/.test(month)) return month
    // Try parsing "Month Year" or "Mon Year" format
    const parsed = new Date(month + ' 1')
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
    }
    return month
  }
  
  const availableMonths = Array.from(
    new Set(deals.map(d => normalizeMonth(d.dealMonth)).filter(Boolean))
  ).sort().reverse()

  // Filtered deals
  const filteredDeals = deals.filter(d => {
    if (clinicFilter !== 'all' && d.clinic !== clinicFilter) return false
    if (statusFilter !== 'all' && d.status !== statusFilter) return false
    if (monthFilter !== 'all' && normalizeMonth(d.dealMonth) !== monthFilter) return false
    if (searchQuery && !d.patientName.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const formatCurrency = (amount: number) => {
    const hasDecimals = amount % 1 !== 0
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-zinc-400">Loading deals...</div>
      </div>
    )
  }

  return (
    <>
      <Header 
        onNewDeal={() => setShowNewDeal(true)} 
        unverifiedPayments={unverifiedPayments}
        onPaymentClick={handlePaymentNotificationClick}
      />

      <main className="max-w-[1800px] mx-auto px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-card p-5 rounded-lg border border-border hover:border-primary/20 transition-colors">
            <div className="text-2xl font-bold text-foreground tracking-tight">{formatCurrency(totalPlanned)}</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Total Planned</div>
          </div>
          <div className="bg-card p-5 rounded-lg border border-border hover:border-success/20 transition-colors">
            <div className="text-2xl font-bold text-success tracking-tight">{formatCurrency(totalCollected)}</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Verified Collected</div>
          </div>
          <div className="bg-card p-5 rounded-lg border border-border hover:border-chart-1/20 transition-colors">
            <div className="text-2xl font-bold text-chart-1 tracking-tight">{formatCurrency(totalPending)}</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Pending Balance</div>
          </div>
          <div className="bg-card p-5 rounded-lg border border-border hover:border-primary/20 transition-colors">
            <div className="text-2xl font-bold text-primary tracking-tight">{flaggedCount}</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Need Attention</div>
          </div>
        </div>

        {/* Filters - right justified */}
        <div className="flex gap-3 mb-4 justify-end">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient..."
            className="border border-border rounded-lg px-3 py-2 bg-secondary text-foreground placeholder:text-muted-foreground w-48 text-sm focus:ring-2 focus:ring-zinc-400/30 focus:border-zinc-400 outline-none"
          />
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border border-border rounded-lg pl-3 pr-8 py-2 bg-secondary text-foreground text-sm"
          >
            <option value="all">All Months</option>
            {availableMonths.map(month => {
              // Handle both "2026-01" and "Jan 2026" formats
              let displayName = month
              if (month.includes('-')) {
                const [year, m] = month.split('-')
                displayName = new Date(Number(year), Number(m) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
              }
              return <option key={month} value={month}>{displayName}</option>
            })}
          </select>
          <select
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
            className="border border-border rounded-lg pl-3 pr-8 py-2 bg-secondary text-foreground text-sm"
          >
            <option value="all">All Clinics</option>
            <option value="TR01">TR01 (SG)</option>
            <option value="TR02">TR02 (IRV)</option>
            <option value="TR04">TR04 (LV)</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-border rounded-lg pl-3 pr-8 py-2 bg-secondary text-foreground text-sm"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>

        {/* Deals Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-secondary border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Clinic</th>
                {!isSalesperson && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Salesperson</th>}
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Plan Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Collected</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Balance</th>
                <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDeals.map((deal) => (
                <tr key={deal.id} className="hover:bg-secondary/50 cursor-pointer transition-colors" onClick={() => setSelectedDeal(deal)}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {deal.patientName}
                    {deal.sharedWith && (
                      <span 
                        className="ml-2 cursor-help text-chart-5" 
                        title={`Shared with ${deal.sharedWith === currentUser.name ? deal.salesperson : deal.sharedWith}`}
                      >⊕</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><ClinicBadge clinic={deal.clinic} /></td>
                  {!isSalesperson && <td className="px-4 py-3 text-muted-foreground text-sm">{getSalespersonDisplay(deal.salesperson)}</td>}
                  <td className="px-4 py-3 text-left text-foreground">
                    {formatCurrency(deal.planTotal)}
                    {deal.invoiceLink && (
                      <a 
                        href={deal.invoiceLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1.5 text-chart-5 hover:text-chart-5/70 transition-colors inline-flex"
                        title="View invoice"
                      ><FileSpreadsheet className="h-4 w-4" /></a>
                    )}
                  </td>
                  <td 
                    className={`px-4 py-3 text-left cursor-help ${(deal.planTotal - deal.collected) === 0 ? 'text-success' : 'text-muted-foreground'}`}
                    title={deal.payments.length > 0 ? deal.payments.map(p => `${p.method}: ${formatCurrency(p.amount)}${!p.verified ? ' (pending)' : ''}`).join('\n') : ''}
                  >
                    {formatCurrency(deal.collected)}
                  </td>
                  <td className={`px-4 py-3 text-left ${(deal.planTotal - deal.collected) === 0 ? 'text-success' : 'text-chart-1'}`}>{formatCurrency(deal.planTotal - deal.collected)}</td>
                  <td className="px-4 py-3 flex justify-center"><StatusIcon status={deal.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* New Deal Modal */}
      {showNewDeal && (
        <NewDealModal onClose={() => setShowNewDeal(false)} currentUser={currentUser} onCreate={handleCreateDeal} />
      )}

      {/* Deal Detail Modal */}
      {selectedDeal && (
        <DealDetailModal 
          deal={selectedDeal} 
          onClose={() => setSelectedDeal(null)} 
          onAddPayment={(payment) => handleAddPayment(selectedDeal.id, payment)}
          onDeletePayment={(paymentId) => handleDeletePayment(selectedDeal.id, paymentId)}
          onVerifyPayment={(paymentId) => handleVerifyPayment(selectedDeal.id, paymentId)}
          onUpdateDeal={handleUpdateDeal}
          isSalesperson={isSalesperson}
        />
      )}
    </>
  )
}

interface GHLSearchResult {
  id: string
  name: string
  clinic: string
  clinicName: string
  email?: string
  phone?: string
  invoiceLink?: string
}

function NewDealModal({ onClose, currentUser, onCreate }: { onClose: () => void; currentUser: User; onCreate: (data: any) => Promise<void> }) {
  const isSalesperson = currentUser.role === 'salesperson'
  
  const [formData, setFormData] = useState({
    patientName: '',
    clinic: '',
    salesperson: isSalesperson ? currentUser.name : '', // Auto-assign for salespeople
    sharedWith: '',
    dealType: '',
    planTotal: '',
    invoiceLink: '',
    notes: '',
  })
  
  const [searchResults, setSearchResults] = useState<GHLSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Search GHL as user types - only search selected clinic
  const searchPatients = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    
    if (!formData.clinic) {
      setSearchResults([])
      return
    }
    
    setIsSearching(true)
    try {
      const response = await fetch(`/api/ghl/search?q=${encodeURIComponent(query)}&clinic=${formData.clinic}`)
      const data = await response.json()
      setSearchResults(data.results || [])
      setShowResults(true)
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Debounced search
  const handleNameChange = (value: string) => {
    setFormData({ ...formData, patientName: value })
    // Simple debounce
    const timeoutId = setTimeout(() => searchPatients(value), 300)
    return () => clearTimeout(timeoutId)
  }

  // Select a patient from search results
  const selectPatient = (patient: GHLSearchResult) => {
    setFormData({
      ...formData,
      patientName: patient.name,
      clinic: patient.clinic,
      invoiceLink: patient.invoiceLink || '',
    })
    setShowResults(false)
    setSearchResults([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onCreate({
      patientName: formData.patientName,
      clinic: formData.clinic,
      salesperson: formData.salesperson,
      sharedWith: formData.sharedWith || null,
      dealType: formData.dealType,
      planTotal: formData.planTotal,
      invoiceLink: formData.invoiceLink,
      notes: formData.notes,
      dealMonth: new Date().toISOString().slice(0, 7),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 border border-border">
        <div className="flex justify-between items-center p-4 border-b dark:border-zinc-700">
          <h2 className="text-lg font-semibold dark:text-zinc-100">New Deal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Clinic</label>
            <select
              value={formData.clinic}
              onChange={(e) => {
                setFormData({ ...formData, clinic: e.target.value, patientName: '' })
                setSearchResults([])
              }}
              className="w-full border dark:border-zinc-600 rounded-lg px-3 py-2 dark:bg-zinc-700 dark:text-zinc-100"
              required
            >
              <option value="">Select clinic first...</option>
              <option value="TR01">TR01 (SG)</option>
              <option value="TR02">TR02 (IRV)</option>
              <option value="TR04">TR04 (LV)</option>
            </select>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Patient Name</label>
            <input
              type="text"
              value={formData.patientName}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              className="w-full border dark:border-zinc-600 rounded-lg px-3 py-2 dark:bg-zinc-700 dark:text-zinc-100"
              placeholder={formData.clinic ? "Start typing..." : "Select clinic first"}
              disabled={!formData.clinic}
              required
            />
            {isSearching && (
              <span className="absolute right-3 top-9 text-gray-400 dark:text-zinc-500 text-sm">Searching...</span>
            )}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-700 border dark:border-zinc-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => selectPatient(result)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-zinc-600 border-b dark:border-zinc-600 last:border-b-0 dark:text-zinc-100"
                  >
                    <div className="font-medium">{result.name}</div>
                    <div className="text-xs text-gray-500 dark:text-zinc-400">
                      {result.invoiceLink && '📋 Has invoice'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showResults && searchResults.length === 0 && formData.patientName.length >= 2 && !isSearching && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-700 border dark:border-zinc-600 rounded-lg shadow-lg p-3 text-sm text-gray-500 dark:text-zinc-400">
                No patients found in GHL. You can still create a new deal.
              </div>
            )}
            {formData.invoiceLink && (
              <div className="mt-1 text-xs text-success">Invoice linked from GHL</div>
            )}
          </div>
          {/* Only show salesperson dropdown for admins - salespeople auto-assigned */}
          {!isSalesperson && (
            <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salesperson</label>
              <select
                value={formData.salesperson}
                onChange={(e) => setFormData({ ...formData, salesperson: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
                required
              >
                <option value="">Select salesperson...</option>
                <option value="">Unassigned</option>
                <option value="Chris">Chris</option>
                <option value="Josh">Josh</option>
                <option value="Molly">Molly</option>
                <option value="Scot">Scot</option>
                <option value="Jake">Jake</option>
                <option value="Blake">Blake</option>
              </select>
            </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deal Type</label>
            <select
              value={formData.dealType}
              onChange={(e) => setFormData({ ...formData, dealType: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="">Select type...</option>
              <option value="Double O">Double O (Double Onyx)</option>
              <option value="Double Z">Double Z (Double Zirconia)</option>
              <option value="Single L">Single L</option>
              <option value="Onyx">Onyx</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Treatment Plan Total</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                value={formData.planTotal}
                onChange={(e) => setFormData({ ...formData, planTotal: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 pl-7"
                placeholder="0"
                required
              />
            </div>
          </div>
          {/* Invoice link auto-populated from GHL when patient selected */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              rows={2}
              placeholder="Any additional notes..."
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              className="w-full px-4 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors"
            >
              Create Deal
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DealDetailModal({ 
  deal, 
  onClose, 
  onAddPayment,
  onDeletePayment,
  onVerifyPayment,
  onUpdateDeal,
  isSalesperson 
}: { 
  deal: Deal
  onClose: () => void
  onAddPayment: (payment: Omit<Payment, 'id' | 'verified'>) => void
  onDeletePayment: (paymentId: string) => void
  onVerifyPayment: (paymentId: string) => void
  onUpdateDeal: (id: string, updates: { sharedWith?: string | null; salesperson?: string }) => Promise<void>
  isSalesperson: boolean
}) {
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [sharedWith, setSharedWith] = useState(deal.sharedWith || '')
  const [salesperson, setSalesperson] = useState(deal.salesperson)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: '' as Payment['method'] | '',
    date: new Date().toISOString().split('T')[0],
  })

  // Track if there are unsaved changes
  const hasChanges = sharedWith !== (deal.sharedWith || '') || (salesperson || '') !== (deal.salesperson || '')

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [hasChanges, sharedWith, salesperson])

  // Smart save on close - check for changes and save them
  const handleClose = async () => {
    if (hasChanges) {
      const changes: { sharedWith?: string | null; salesperson?: string } = {}
      if (sharedWith !== (deal.sharedWith || '')) {
        changes.sharedWith = sharedWith || null
      }
      if ((salesperson || '') !== (deal.salesperson || '')) {
        changes.salesperson = salesperson || ''
      }
      await onUpdateDeal(deal.id, changes)
    }
    onClose()
  }

  const formatCurrency = (amount: number) => {
    const hasDecimals = amount % 1 !== 0
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 }).format(amount)
  }

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentForm.method) return
    onAddPayment({
      amount: Number(paymentForm.amount),
      method: paymentForm.method as Payment['method'],
      date: paymentForm.date,
    })
    setPaymentForm({ amount: '', method: '', date: new Date().toISOString().split('T')[0] })
    setShowAddPayment(false)
  }

  const balance = deal.planTotal - deal.collected

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col border border-border">
        <div className="flex justify-between items-center p-4 border-b dark:border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold dark:text-zinc-100">{deal.patientName}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-zinc-400">
              {deal.dealType && <span>{formatDealType(deal.dealType)}</span>}
              <ClinicBadge clinic={deal.clinic} />
              {!isSalesperson && <span>{getSalespersonDisplay(deal.salesperson)}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 dark:bg-zinc-700 rounded-lg">
              <div className="text-lg font-bold dark:text-zinc-100">
                {formatCurrency(deal.planTotal)}
                {deal.invoiceLink && (
                  <a 
                    href={deal.invoiceLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-1 hover:opacity-70 text-chart-5 inline-flex"
                    title="View invoice"
                  ><FileSpreadsheet className="h-4 w-4" /></a>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-zinc-400">Plan Total</div>
            </div>
            <div className="text-center p-3 bg-success/10 rounded-lg">
              <div className="text-lg font-bold text-success">{formatCurrency(deal.collected)}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400">Collected</div>
            </div>
            <div className={`text-center p-3 rounded-lg ${
              balance === 0 ? 'bg-purple-500/10' : deal.collected === 0 ? 'bg-primary/10' : 'bg-chart-1/10'
            }`}>
              <div className={`text-lg font-bold ${
                balance === 0 ? 'text-purple-500' : deal.collected === 0 ? 'text-primary' : 'text-chart-1'
              }`}>{formatCurrency(balance)}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400">Balance</div>
            </div>
          </div>

          {/* Notes */}
          {deal.notes && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-zinc-300">{deal.notes}</p>
            </div>
          )}

          {/* Salesperson (admin only) */}
          {!isSalesperson && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-zinc-700 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Salesperson:</span>
                <select
                  value={salesperson}
                  onChange={(e) => setSalesperson(e.target.value)}
                  className="border dark:border-zinc-600 rounded px-2 py-1 text-sm dark:bg-zinc-600 dark:text-zinc-100"
                >
                  <option value="">Unassigned</option>
                  <option value="Chris">Chris</option>
                  <option value="Josh">Josh</option>
                  <option value="Molly">Molly</option>
                  <option value="Scot">Scot</option>
                  <option value="Jake">Jake</option>
                  <option value="Blake">Blake</option>
                  <option value="TBD">TBD</option>
                </select>
              </div>
            </div>
          )}

          {/* Shared With */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-zinc-700 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Shared With:</span>
                <select
                  value={sharedWith}
                  onChange={(e) => setSharedWith(e.target.value)}
                  className="border dark:border-zinc-600 rounded px-2 py-1 text-sm dark:bg-zinc-600 dark:text-zinc-100"
                >
                  <option value="">None</option>
                  <option value="Chris">Chris</option>
                  <option value="Josh">Josh</option>
                  <option value="Molly">Molly</option>
                  <option value="Scot">Scot</option>
                  <option value="Jake">Jake</option>
                  <option value="Blake">Blake</option>
                </select>
              </div>
            </div>

          {/* Payments */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium dark:text-zinc-100">Payments</h3>
              <button
                onClick={() => setShowAddPayment(true)}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                + Add Payment
              </button>
            </div>

            {deal.payments.length === 0 ? (
              <p className="text-gray-400 dark:text-zinc-500 text-sm italic">No payments recorded</p>
            ) : (
              <div className="space-y-2">
                {deal.payments.map((payment) => (
                  <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-zinc-700 rounded-lg">
                    <div>
                      <span className="font-medium dark:text-zinc-100">{formatCurrency(payment.amount)}</span>
                      <span className="text-gray-500 dark:text-zinc-400 text-sm ml-2">{payment.method}</span>
                      {payment.method === 'Cash' && !payment.verified && (
                        <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">Pending Verification</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
                      {payment.date}
                      {payment.verified && <span>✅</span>}
                      {!isSalesperson && payment.method === 'Cash' && !payment.verified && (
                        <button
                          onClick={() => onVerifyPayment(payment.id)}
                          className="text-xs bg-success/10 text-success px-2 py-1 rounded hover:bg-success/20 transition-colors font-medium"
                          title="Verify payment"
                        >
                          Verify
                        </button>
                      )}
                      {!isSalesperson && (
                        <button
                          onClick={() => onDeletePayment(payment.id)}
                          className="text-red-400 hover:text-red-600 ml-2"
                          title="Delete payment"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Payment Form */}
          {showAddPayment && (
            <form onSubmit={handleAddPayment} className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg space-y-3">
              <h4 className="font-medium text-sm dark:text-zinc-100">Add Payment</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-2 top-2 text-gray-500 dark:text-zinc-400 text-sm">$</span>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="w-full border dark:border-zinc-600 rounded px-2 py-1.5 pl-5 text-sm dark:bg-zinc-700 dark:text-zinc-100"
                      placeholder="0"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className="w-full border dark:border-zinc-600 rounded px-2 py-1.5 text-sm dark:bg-zinc-700 dark:text-zinc-100"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">Method</label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as Payment['method'] })}
                  className="w-full border dark:border-zinc-600 rounded px-2 py-1.5 text-sm dark:bg-zinc-700 dark:text-zinc-100"
                  required
                >
                  <option value="">Select method...</option>
                  <optgroup label="Financing">
                    <option value="Cherry">Cherry</option>
                    <option value="CareCredit">CareCredit</option>
                    <option value="Proceed">Proceed</option>
                    <option value="Patient Preferred">Patient Preferred</option>
                    <option value="Alphaeon">Alphaeon</option>
                    <option value="Sunbit">Sunbit</option>
                    <option value="HFD">HFD</option>
                    <option value="LendingClub">LendingClub</option>
                  </optgroup>
                  <optgroup label="Direct Payment">
                    <option value="Credit Card">Credit Card</option>
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                    <option value="ACH/Wire">ACH/Wire</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="Insurance">Insurance</option>
                  </optgroup>
                </select>
              </div>
              {paymentForm.method === 'Cash' && (
                <p className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/50 p-2 rounded">
                  ⚠️ Cash payments require admin verification
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPayment(false)}
                  className="flex-1 px-3 py-1.5 border dark:border-zinc-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-zinc-600 dark:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 bg-foreground text-background rounded text-sm hover:bg-foreground/90 transition-colors"
                >
                  Add Payment
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="p-4 border-t dark:border-zinc-700">
          <button
            onClick={handleClose}
            className={`w-full px-4 py-2 rounded-lg transition-colors ${hasChanges ? 'bg-foreground text-background hover:bg-foreground/90' : 'border dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-700 dark:text-zinc-100'}`}
          >
            {hasChanges ? 'Save' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
