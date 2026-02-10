'use client'

import { useState } from 'react'
import { PipelineKanban } from '@/components/pipeline-kanban'
import { ThemeToggle } from '@/components/theme-toggle'
import { Logo } from '@/components/logo'
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Logo className="h-7 w-auto" />
              <span className="font-semibold text-foreground tracking-tight">Recon</span>
            </div>
            <nav className="flex gap-4 ml-4">
              <Link 
                href="/" 
                className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                Deals
              </Link>
              <Link 
                href="/pipeline" 
                className="text-foreground font-medium text-sm"
              >
                Pipeline
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            <ThemeToggle />
            
            {/* View As Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">View as:</span>
              <select
                value={currentUser.id}
                onChange={(e) => setCurrentUser(USERS.find(u => u.id === e.target.value) || USERS[0])}
                className="border border-border rounded-lg px-3 py-1.5 text-sm bg-secondary text-foreground"
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
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        {!isAdmin && (
          <div className="mb-4 px-4 py-2 bg-chart-5/10 rounded-lg text-sm text-chart-5">
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
