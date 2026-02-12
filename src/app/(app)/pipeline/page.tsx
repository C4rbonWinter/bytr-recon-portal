'use client'

import { useState } from 'react'
import { PipelineKanban } from '@/components/pipeline-kanban'
import { Header } from '@/components/header'

// Simulated users for "View As" feature
// Each salesperson has multiple GHL user IDs (one per GHL instance)
// role: 'Admin' = sees all opportunities + salesperson names on cards
// role: 'Salesperson' = sees only their opportunities, no SP name on cards
// isManager: true = can toggle between personal and admin view
const USERS = [
  { id: 'admin', name: 'Cole', role: 'Admin', isManager: false, ghlUserIds: [] as string[] },
  { id: 'josh', name: 'Josh', role: 'Admin', isManager: true, ghlUserIds: ['xGHzefX0G70ObVhtULtS', 'cnHNqiEGjpOOWVzsZnJe'] },
  { id: 'chris', name: 'Chris', role: 'Admin', isManager: true, ghlUserIds: ['W02cGzjo8DOEvq3EnNH5', 'MH14SnZ7liJIMIBd2mge'] },
  { id: 'molly', name: 'Molly', role: 'Salesperson', isManager: false, ghlUserIds: ['40OKojJlHK1QGWxobiFB', 'OYwn6OtVac85ljn26qle'] },
  { id: 'scot', name: 'Scot', role: 'Salesperson', isManager: false, ghlUserIds: ['R2lQOlnfA2u3ozRUIA5a', 'qdkCS02nCbZhGmn0R8zE'] },
  { id: 'jake', name: 'Jake', role: 'Salesperson', isManager: false, ghlUserIds: ['dIYBT07Gjs2KnrHqSWiH', '1pShLvH7qVgRjaMVp80p'] },
  { id: 'blake', name: 'Blake', role: 'Salesperson', isManager: false, ghlUserIds: ['DRr7a8bJ3SYfc7Uaonle', 'drbfnr6OcLkSfSSxgev0'] },
]

const VIEW_AS_OPTIONS = USERS.map(u => ({ id: u.id, name: u.name }))

export default function PipelinePage() {
  const [currentUser, setCurrentUser] = useState(USERS[0])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showMyView, setShowMyView] = useState(false) // Toggle for managers: false = All, true = Mine

  // For managers with toggle: if showMyView is true, act as salesperson
  const effectiveRole = currentUser.isManager && showMyView ? 'Salesperson' : currentUser.role
  const isAdmin = effectiveRole === 'Admin'

  const handleViewAsChange = (id: string) => {
    const user = USERS.find(u => u.id === id) || USERS[0]
    setCurrentUser(user)
    // Reset toggle when switching users
    setShowMyView(false)
  }

  const handleRefresh = () => {
    setRefreshKey(k => k + 1)
  }

  return (
    <>
      <Header 
        viewAsOptions={VIEW_AS_OPTIONS}
        currentViewAs={currentUser.id}
        onViewAsChange={handleViewAsChange}
        onRefresh={handleRefresh}
      />

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        {/* Manager toggle */}
        {currentUser.isManager && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">View:</span>
            <button
              onClick={() => setShowMyView(false)}
              className={`px-3 py-1 text-sm rounded-l-md border transition-colors ${
                !showMyView 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-card border-border hover:bg-secondary'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setShowMyView(true)}
              className={`px-3 py-1 text-sm rounded-r-md border-t border-r border-b -ml-px transition-colors ${
                showMyView 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-card border-border hover:bg-secondary'
              }`}
            >
              Mine
            </button>
          </div>
        )}

        {/* Salesperson info banner */}
        {!isAdmin && (
          <div className="mb-4 px-4 py-2 bg-chart-5/10 rounded-lg text-sm text-chart-5">
            Viewing as <strong>{currentUser.name}</strong> — showing only their assigned opportunities
          </div>
        )}
        <PipelineKanban 
          key={refreshKey}
          salespersonIds={isAdmin ? undefined : currentUser.ghlUserIds}
          salespersonName={isAdmin ? undefined : currentUser.name}
          isAdmin={isAdmin}
        />
      </main>
    </>
  )
}
