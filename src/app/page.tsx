'use client'

import { useState } from 'react'

// Types
interface Payment {
  id: string
  amount: number
  method: 'Cash' | 'Credit Card' | 'Cherry' | 'CareCredit' | 'Proceed' | 'PPref' | 'Check'
  date: string
  verified: boolean
}

interface Deal {
  id: string
  patientName: string
  clinic: 'TR01' | 'TR02' | 'TR04'
  salesperson: string
  planTotal: number
  collected: number
  verified: boolean
  status: 'verified' | 'partial' | 'unpaid' | 'flagged'
  payments: Payment[]
}

interface User {
  name: string
  role: 'admin' | 'salesperson'
}

// Mock current user - will come from auth later
// Set to { name: 'Cole', role: 'admin' } for admin view
// Set to { name: 'Scot', role: 'salesperson' } for salesperson view
const currentUser: User = { name: 'Scot', role: 'salesperson' }

// Mock data - will be replaced with API calls
const mockDeals: Deal[] = [
  { id: '1', patientName: 'Brandon Tipton', clinic: 'TR02', salesperson: 'Scot', planTotal: 25600, collected: 25000, verified: true, status: 'verified', payments: [
    { id: 'p1', amount: 10000, method: 'Cherry', date: '2026-01-15', verified: true },
    { id: 'p2', amount: 15000, method: 'Credit Card', date: '2026-01-20', verified: true },
  ]},
  { id: '2', patientName: 'Lillie Jackson', clinic: 'TR02', salesperson: 'Scot', planTotal: 11760, collected: 9760, verified: false, status: 'partial', payments: [
    { id: 'p3', amount: 5000, method: 'CareCredit', date: '2026-01-18', verified: true },
    { id: 'p4', amount: 4760, method: 'Cash', date: '2026-01-25', verified: false },
  ]},
  { id: '3', patientName: 'John Alessi', clinic: 'TR04', salesperson: 'Chris', planTotal: 26700, collected: 0, verified: false, status: 'unpaid', payments: [] },
  { id: '4', patientName: 'Michael Preuett', clinic: 'TR01', salesperson: 'Scot', planTotal: 13250, collected: 13250, verified: true, status: 'verified', payments: [
    { id: 'p5', amount: 13250, method: 'Proceed', date: '2026-01-10', verified: true },
  ]},
]

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
  'PPref': '🏦',
  'Check': '📝',
}

export default function Dashboard() {
  const [allDeals, setAllDeals] = useState<Deal[]>(mockDeals)
  const [clinicFilter, setClinicFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  const isSalesperson = currentUser.role === 'salesperson'

  const handleAddPayment = (dealId: string, payment: Omit<Payment, 'id' | 'verified'>) => {
    setAllDeals(prev => prev.map(deal => {
      if (deal.id !== dealId) return deal
      const newPayment: Payment = {
        ...payment,
        id: `p${Date.now()}`,
        verified: payment.method !== 'Cash', // Cash needs verification
      }
      const newPayments = [...deal.payments, newPayment]
      const newCollected = newPayments.reduce((sum, p) => sum + p.amount, 0)
      const allVerified = newPayments.every(p => p.verified)
      let newStatus: Deal['status'] = 'unpaid'
      if (newCollected >= deal.planTotal && allVerified) newStatus = 'verified'
      else if (newCollected > 0 && newCollected < deal.planTotal) newStatus = 'partial'
      else if (newCollected >= deal.planTotal && !allVerified) newStatus = 'partial'
      return { ...deal, payments: newPayments, collected: newCollected, status: newStatus, verified: allVerified && newCollected >= deal.planTotal }
    }))
    // Update selectedDeal if it's the one we modified
    setSelectedDeal(prev => {
      if (!prev || prev.id !== dealId) return prev
      const updated = allDeals.find(d => d.id === dealId)
      return updated || prev
    })
  }

  // Filter to user's deals only for salespeople
  const deals = isSalesperson 
    ? allDeals.filter(d => d.salesperson === currentUser.name)
    : allDeals

  // Stats (based on user's visible deals)
  const totalPlanned = deals.reduce((sum, d) => sum + d.planTotal, 0)
  const totalCollected = deals.reduce((sum, d) => sum + d.collected, 0)
  const totalPending = totalPlanned - totalCollected
  const flaggedCount = deals.filter(d => d.status === 'flagged' || d.status === 'partial').length

  // Filtered deals
  const filteredDeals = deals.filter(d => {
    if (clinicFilter !== 'all' && d.clinic !== clinicFilter) return false
    if (statusFilter !== 'all' && d.status !== statusFilter) return false
    return true
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
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
            <span className="text-gray-600">{currentUser.name} {isSalesperson ? '' : '▼'}</span>
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
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Plan Total</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Collected</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Balance</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDeals.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedDeal(deal)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{deal.patientName}</td>
                  <td className="px-4 py-3 text-gray-600">{deal.clinic} ({clinicNames[deal.clinic]})</td>
                  {!isSalesperson && <td className="px-4 py-3 text-gray-600">{deal.salesperson}</td>}
                  <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(deal.planTotal)}</td>
                  <td className="px-4 py-3 text-right">
                    <span 
                      className="text-green-600 cursor-help relative group"
                    >
                      {formatCurrency(deal.collected)}
                      {deal.payments.length > 0 && (
                        <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-10">
                          <span className="bg-gray-900 text-white text-xs rounded py-2 px-3 whitespace-nowrap shadow-lg">
                            {deal.payments.map((p, i) => (
                              <span key={p.id} className="block">
                                {p.method}: {formatCurrency(p.amount)}
                                {!p.verified && <span className="text-yellow-400 ml-1">⏳</span>}
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-orange-500">{formatCurrency(deal.planTotal - deal.collected)}</td>
                  <td className="px-4 py-3 text-center text-xl">{statusIcons[deal.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* New Deal Modal */}
      {showNewDeal && (
        <NewDealModal onClose={() => setShowNewDeal(false)} currentUser={currentUser} />
      )}

      {/* Deal Detail Modal */}
      {selectedDeal && (
        <DealDetailModal 
          deal={selectedDeal} 
          onClose={() => setSelectedDeal(null)} 
          onAddPayment={(payment) => handleAddPayment(selectedDeal.id, payment)}
          isSalesperson={isSalesperson}
        />
      )}
    </div>
  )
}

function NewDealModal({ onClose, currentUser }: { onClose: () => void; currentUser: User }) {
  const isSalesperson = currentUser.role === 'salesperson'
  
  const [formData, setFormData] = useState({
    patientName: '',
    clinic: '',
    salesperson: isSalesperson ? currentUser.name : '', // Auto-assign for salespeople
    planTotal: '',
    invoiceLink: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: API call to create deal
    console.log('Creating deal:', formData)
    onClose()
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name</label>
            <input
              type="text"
              value={formData.patientName}
              onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
            <select
              value={formData.clinic}
              onChange={(e) => setFormData({ ...formData, clinic: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="">Select clinic...</option>
              <option value="TR01">TR01 (SG)</option>
              <option value="TR02">TR02 (IRV)</option>
              <option value="TR04">TR04 (LV)</option>
            </select>
          </div>
          {/* Only show salesperson dropdown for admins - salespeople auto-assigned */}
          {!isSalesperson && (
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
          )}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Link (optional)</label>
            <input
              type="url"
              value={formData.invoiceLink}
              onChange={(e) => setFormData({ ...formData, invoiceLink: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="https://docs.google.com/..."
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
  isSalesperson 
}: { 
  deal: Deal
  onClose: () => void
  onAddPayment: (payment: Omit<Payment, 'id' | 'verified'>) => void
  isSalesperson: boolean
}) {
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: '' as Payment['method'] | '',
    date: new Date().toISOString().split('T')[0],
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
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
            <p className="text-sm text-gray-500">{deal.clinic} ({clinicNames[deal.clinic]}){!isSalesperson && ` • ${deal.salesperson}`}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-lg font-bold">{formatCurrency(deal.planTotal)}</div>
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
                  <option value="Cash">💵 Cash</option>
                  <option value="Credit Card">💳 Credit Card</option>
                  <option value="Cherry">🍒 Cherry</option>
                  <option value="CareCredit">💙 CareCredit</option>
                  <option value="Proceed">📄 Proceed</option>
                  <option value="PPref">🏦 PPref</option>
                  <option value="Check">📝 Check</option>
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
