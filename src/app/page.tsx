'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'

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

const statusIcons: Record<string, string> = {
  verified: '✅',
  partial: '⚠️',
  unpaid: '🔴',
  flagged: '🚩',
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
        // Update the selected deal with new data
        setSelectedDeal(prev => {
          if (!prev || prev.id !== id) return prev
          return { 
            ...prev, 
            ...(updates.sharedWith !== undefined && { sharedWith: updates.sharedWith }),
            ...(updates.salesperson && { salesperson: updates.salesperson }),
          }
        })
      }
    } catch (error) {
      console.error('Failed to update deal:', error)
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

  // Get unique months from deals for filter dropdown
  const availableMonths = Array.from(new Set(deals.map(d => d.dealMonth))).sort().reverse()

  // Filtered deals
  const filteredDeals = deals.filter(d => {
    if (clinicFilter !== 'all' && d.clinic !== clinicFilter) return false
    if (statusFilter !== 'all' && d.status !== statusFilter) return false
    if (monthFilter !== 'all' && d.dealMonth !== monthFilter) return false
    return true
  })

  const formatCurrency = (amount: number) => {
    const hasDecimals = amount % 1 !== 0
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading deals...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">T+R Reconciliation Portal</h1>
            {isSalesperson && <p className="text-sm text-gray-500">My Deals</p>}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowNewDeal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              + New Deal
            </button>
            <div className="relative group">
              <span className="text-gray-600 cursor-pointer">{currentUser.name} ▼</span>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border hidden group-hover:block z-20">
                <div className="px-4 py-2 text-sm text-gray-500 border-b">
                  {session?.user?.email}
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalPlanned)}</div>
            <div className="text-sm text-gray-500">Total Planned</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalCollected)}</div>
            <div className="text-sm text-gray-500">Verified Collected</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-orange-500">{formatCurrency(totalPending)}</div>
            <div className="text-sm text-gray-500">Pending Balance</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-red-500">{flaggedCount}</div>
            <div className="text-sm text-gray-500">Need Attention</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 bg-white"
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
            className="border rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All Clinics</option>
            <option value="TR01">TR01 (SG)</option>
            <option value="TR02">TR02 (IRV)</option>
            <option value="TR04">TR04 (LV)</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All Status</option>
            <option value="verified">✅ Verified</option>
            <option value="partial">⚠️ Partial</option>
            <option value="unpaid">🔴 Unpaid</option>
            <option value="flagged">🚩 Flagged</option>
          </select>
        </div>

        {/* Deals Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Patient</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Clinic</th>
                {!isSalesperson && <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Salesperson</th>}
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plan Total</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Collected</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Balance</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDeals.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedDeal(deal)}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {deal.patientName}
                    {deal.sharedWith && (
                      <span 
                        className="ml-2 cursor-help" 
                        title={`Shared with ${deal.sharedWith === currentUser.name ? deal.salesperson : deal.sharedWith}`}
                      >🤝</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{deal.clinic} ({clinicNames[deal.clinic]})</td>
                  {!isSalesperson && <td className="px-4 py-3 text-gray-600">{deal.salesperson}</td>}
                  <td className="px-4 py-3 text-left text-gray-900">
                    {formatCurrency(deal.planTotal)}
                    {deal.invoiceLink && (
                      <a 
                        href={deal.invoiceLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1 hover:opacity-70"
                        title="View invoice"
                      >📋</a>
                    )}
                  </td>
                  <td 
                    className="px-4 py-3 text-left text-green-600 cursor-help"
                    title={deal.payments.length > 0 ? deal.payments.map(p => `${p.method}: ${formatCurrency(p.amount)}${!p.verified ? ' (pending)' : ''}`).join('\n') : ''}
                  >
                    {formatCurrency(deal.collected)}
                  </td>
                  <td className="px-4 py-3 text-left text-orange-500">{formatCurrency(deal.planTotal - deal.collected)}</td>
                  <td className="px-4 py-3 text-center text-xl">{statusIcons[deal.status]}</td>
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
          onUpdateDeal={handleUpdateDeal}
          isSalesperson={isSalesperson}
        />
      )}
    </div>
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">New Deal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
            <select
              value={formData.clinic}
              onChange={(e) => {
                setFormData({ ...formData, clinic: e.target.value, patientName: '' })
                setSearchResults([])
              }}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="">Select clinic first...</option>
              <option value="TR01">TR01 (SG)</option>
              <option value="TR02">TR02 (IRV)</option>
              <option value="TR04">TR04 (LV)</option>
            </select>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name</label>
            <input
              type="text"
              value={formData.patientName}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder={formData.clinic ? "Start typing..." : "Select clinic first"}
              disabled={!formData.clinic}
              required
            />
            {isSearching && (
              <span className="absolute right-3 top-9 text-gray-400 text-sm">Searching...</span>
            )}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => selectPatient(result)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0"
                  >
                    <div className="font-medium">{result.name}</div>
                    <div className="text-xs text-gray-500">
                      {result.invoiceLink && '📋 Has invoice'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showResults && searchResults.length === 0 && formData.patientName.length >= 2 && !isSearching && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-gray-500">
                No patients found in GHL. You can still create a new deal.
              </div>
            )}
            {formData.invoiceLink && (
              <div className="mt-1 text-xs text-green-600">Invoice linked from GHL</div>
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
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
  onUpdateDeal,
  isSalesperson 
}: { 
  deal: Deal
  onClose: () => void
  onAddPayment: (payment: Omit<Payment, 'id' | 'verified'>) => void
  onUpdateDeal: (id: string, updates: { sharedWith?: string | null; salesperson?: string }) => Promise<void>
  isSalesperson: boolean
}) {
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [editingShared, setEditingShared] = useState(false)
  const [editingSalesperson, setEditingSalesperson] = useState(false)
  const [sharedWith, setSharedWith] = useState(deal.sharedWith || '')
  const [salesperson, setSalesperson] = useState(deal.salesperson)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: '' as Payment['method'] | '',
    date: new Date().toISOString().split('T')[0],
  })

  const handleSaveShared = async () => {
    await onUpdateDeal(deal.id, { sharedWith: sharedWith || null })
    setEditingShared(false)
  }

  const handleSaveSalesperson = async () => {
    await onUpdateDeal(deal.id, { salesperson })
    setEditingSalesperson(false)
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{deal.patientName}</h2>
            <p className="text-sm text-gray-500">
              {deal.dealType} • {deal.clinic} ({clinicNames[deal.clinic]}){!isSalesperson && ` • ${deal.salesperson}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-lg font-bold">
                {formatCurrency(deal.planTotal)}
                {deal.invoiceLink && (
                  <a 
                    href={deal.invoiceLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-1 hover:opacity-70"
                    title="View invoice"
                  >📋</a>
                )}
              </div>
              <div className="text-xs text-gray-500">Plan Total</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-lg font-bold text-green-600">{formatCurrency(deal.collected)}</div>
              <div className="text-xs text-gray-500">Collected</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-lg font-bold text-orange-500">{formatCurrency(balance)}</div>
              <div className="text-xs text-gray-500">Balance</div>
            </div>
          </div>

          {/* Notes */}
          {deal.notes && (
            <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
              <p className="text-sm text-gray-700">{deal.notes}</p>
            </div>
          )}

          {/* Salesperson (admin only) */}
          {!isSalesperson && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  Salesperson: {editingSalesperson ? '' : deal.salesperson}
                </span>
                {!editingSalesperson ? (
                  <button
                    onClick={() => setEditingSalesperson(true)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={salesperson}
                      onChange={(e) => setSalesperson(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      <option value="Chris">Chris</option>
                      <option value="Josh">Josh</option>
                      <option value="Molly">Molly</option>
                      <option value="Scot">Scot</option>
                      <option value="Jake">Jake</option>
                      <option value="Blake">Blake</option>
                      <option value="TBD">TBD</option>
                    </select>
                    <button
                      onClick={handleSaveSalesperson}
                      className="text-sm text-green-600 hover:text-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingSalesperson(false); setSalesperson(deal.salesperson) }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shared With */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  Shared With: {editingShared ? '' : (deal.sharedWith || 'None')}
                </span>
                {!editingShared ? (
                  <button
                    onClick={() => setEditingShared(true)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {deal.sharedWith ? 'Edit' : 'Add'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={sharedWith}
                      onChange={(e) => setSharedWith(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      <option value="">None</option>
                      <option value="Chris">Chris</option>
                      <option value="Josh">Josh</option>
                      <option value="Molly">Molly</option>
                      <option value="Scot">Scot</option>
                      <option value="Jake">Jake</option>
                      <option value="Blake">Blake</option>
                    </select>
                    <button
                      onClick={handleSaveShared}
                      className="text-sm text-green-600 hover:text-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingShared(false); setSharedWith(deal.sharedWith || '') }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

          {/* Payments */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium">Payments</h3>
              <button
                onClick={() => setShowAddPayment(true)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add Payment
              </button>
            </div>

            {deal.payments.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No payments recorded</p>
            ) : (
              <div className="space-y-2">
                {deal.payments.map((payment) => (
                  <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium">{formatCurrency(payment.amount)}</span>
                      <span className="text-gray-500 text-sm ml-2">{payment.method}</span>
                      {payment.method === 'Cash' && !payment.verified && (
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Pending Verification</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {payment.date}
                      {payment.verified && <span className="ml-2">✅</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Payment Form */}
          {showAddPayment && (
            <form onSubmit={handleAddPayment} className="p-4 bg-blue-50 rounded-lg space-y-3">
              <h4 className="font-medium text-sm">Add Payment</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-2 top-2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="w-full border rounded px-2 py-1.5 pl-5 text-sm"
                      placeholder="0"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Method</label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as Payment['method'] })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
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
                <p className="text-xs text-yellow-700 bg-yellow-100 p-2 rounded">
                  ⚠️ Cash payments require admin verification
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPayment(false)}
                  className="flex-1 px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Add Payment
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
