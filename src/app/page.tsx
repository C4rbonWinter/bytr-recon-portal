'use client'

import { useState } from 'react'

// Types
interface Deal {
  id: string
  patientName: string
  clinic: 'TR01' | 'TR02' | 'TR04'
  salesperson: string
  planTotal: number
  collected: number
  verified: boolean
  status: 'verified' | 'partial' | 'unpaid' | 'flagged'
}

interface User {
  name: string
  role: 'admin' | 'salesperson'
}

// Mock current user - will come from auth later
// Set to null or { name: 'Cole', role: 'admin' } for admin view
// Set to { name: 'Scot', role: 'salesperson' } for salesperson view
const currentUser: User = { name: 'Cole', role: 'admin' }

// Mock data - will be replaced with API calls
const mockDeals: Deal[] = [
  { id: '1', patientName: 'Brandon Tipton', clinic: 'TR02', salesperson: 'Scot', planTotal: 25600, collected: 25000, verified: true, status: 'verified' },
  { id: '2', patientName: 'Lillie Jackson', clinic: 'TR02', salesperson: 'Scot', planTotal: 11760, collected: 9760, verified: false, status: 'partial' },
  { id: '3', patientName: 'John Alessi', clinic: 'TR04', salesperson: 'Chris', planTotal: 26700, collected: 0, verified: false, status: 'unpaid' },
  { id: '4', patientName: 'Michael Preuett', clinic: 'TR01', salesperson: 'Scot', planTotal: 13250, collected: 13250, verified: true, status: 'verified' },
]

const clinicNames: Record<string, string> = {
  TR01: 'San Gabriel',
  TR02: 'Irvine', 
  TR04: 'Las Vegas',
}

const statusIcons: Record<string, string> = {
  verified: '✅',
  partial: '⚠️',
  unpaid: '🔴',
  flagged: '🚩',
}

export default function Dashboard() {
  const [deals] = useState<Deal[]>(mockDeals)
  const [clinicFilter, setClinicFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showNewDeal, setShowNewDeal] = useState(false)

  // Stats
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
          <h1 className="text-xl font-bold text-gray-900">T+R Reconciliation Portal</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowNewDeal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              + New Deal
            </button>
            <span className="text-gray-600">Cole ▼</span>
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
            <option value="TR01">TR01 - San Gabriel</option>
            <option value="TR02">TR02 - Irvine</option>
            <option value="TR04">TR04 - Las Vegas</option>
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
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Salesperson</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Plan Total</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Collected</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Balance</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDeals.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 font-medium text-gray-900">{deal.patientName}</td>
                  <td className="px-4 py-3 text-gray-600">{deal.clinic} - {clinicNames[deal.clinic]}</td>
                  <td className="px-4 py-3 text-gray-600">{deal.salesperson}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(deal.planTotal)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatCurrency(deal.collected)}</td>
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
              <option value="TR01">TR01 - San Gabriel</option>
              <option value="TR02">TR02 - Irvine</option>
              <option value="TR04">TR04 - Las Vegas</option>
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
