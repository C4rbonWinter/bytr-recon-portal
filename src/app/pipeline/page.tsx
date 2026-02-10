'use client'

import { useState } from 'react'
import { PipelineKanban } from '@/components/pipeline-kanban'
import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'

// Simulated users for "View As" feature
// Each salesperson has multiple GHL user IDs (one per GHL instance)
// role: 'Admin' = sees all opportunities + salesperson names on cards
// role: 'Salesperson' = sees only their opportunities, no SP name on cards
const USERS = [
  { id: 'admin', name: 'Cole', role: 'Admin', ghlUserIds: [] },
  { id: 'josh', name: 'Josh', role: 'Admin', ghlUserIds: [] },
  { id: 'chris', name: 'Chris', role: 'Admin', ghlUserIds: [] },
  { id: 'molly', name: 'Molly', role: 'Salesperson', ghlUserIds: ['40OKojJlHK1QGWxobiFB', 'OYwn6OtVac85ljn26qle'] },
  { id: 'scot', name: 'Scot', role: 'Salesperson', ghlUserIds: ['R2lQOlnfA2u3ozRUIA5a', 'qdkCS02nCbZhGmn0R8zE'] },
  { id: 'jake', name: 'Jake', role: 'Salesperson', ghlUserIds: ['dIYBT07Gjs2KnrHqSWiH', '1pShLvH7qVgRjaMVp80p'] },
  { id: 'blake', name: 'Blake', role: 'Salesperson', ghlUserIds: ['DRr7a8bJ3SYfc7Uaonle', 'drbfnr6OcLkSfSSxgev0'] },
]

export default function PipelinePage() {
  const [currentUser, setCurrentUser] = useState(USERS[0])
  
  const isAdmin = currentUser.role === 'Admin'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-800 shadow-sm border-b dark:border-zinc-700">
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold dark:text-zinc-100">T+R Recon Portal</h1>
              <nav className="flex gap-4">
                <Link 
                  href="/" 
                  className="text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100"
                >
                  Deals
                </Link>
                <Link 
                  href="/pipeline" 
                  className="text-blue-600 dark:text-blue-400 font-medium"
                >
                  Pipeline
                </Link>
              </nav>
            </div>
            
            <div className="flex items-center gap-3">
              <ThemeToggle />
              
              {/* View As Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-zinc-400">View as:</span>
                <select
                  value={currentUser.id}
                  onChange={(e) => setCurrentUser(USERS.find(u => u.id === e.target.value) || USERS[0])}
                  className="border dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {USERS.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {!isAdmin && (
          <div className="mb-4 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            Viewing as <strong>{currentUser.name}</strong> — showing only their assigned opportunities
          </div>
        )}
        <PipelineKanban 
          salespersonIds={isAdmin ? undefined : currentUser.ghlUserIds}
          isAdmin={isAdmin}
        />
      </main>
    </div>
  )
}
