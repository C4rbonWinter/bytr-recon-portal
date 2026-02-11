'use client'

import { useState } from 'react'
import { PipelineKanban } from '@/components/pipeline-kanban'
import { Header } from '@/components/header'

// Simulated users for "View As" feature
// Each salesperson has multiple GHL user IDs (one per GHL instance)
// role: 'Admin' = sees all opportunities + salesperson names on cards
// role: 'Salesperson' = sees only their opportunities, no SP name on cards
const USERS = [
  { id: 'admin', name: 'Cole', role: 'Admin', ghlUserIds: [] as string[] },
  { id: 'josh', name: 'Josh', role: 'Admin', ghlUserIds: [] as string[] },
  { id: 'chris', name: 'Chris', role: 'Admin', ghlUserIds: [] as string[] },
  { id: 'molly', name: 'Molly', role: 'Salesperson', ghlUserIds: ['40OKojJlHK1QGWxobiFB', 'OYwn6OtVac85ljn26qle'] },
  { id: 'scot', name: 'Scot', role: 'Salesperson', ghlUserIds: ['R2lQOlnfA2u3ozRUIA5a', 'qdkCS02nCbZhGmn0R8zE'] },
  { id: 'jake', name: 'Jake', role: 'Salesperson', ghlUserIds: ['dIYBT07Gjs2KnrHqSWiH', '1pShLvH7qVgRjaMVp80p'] },
  { id: 'blake', name: 'Blake', role: 'Salesperson', ghlUserIds: ['DRr7a8bJ3SYfc7Uaonle', 'drbfnr6OcLkSfSSxgev0'] },
]

const VIEW_AS_OPTIONS = USERS.map(u => ({ id: u.id, name: u.name }))

export default function PipelinePage() {
  const [currentUser, setCurrentUser] = useState(USERS[0])
  
  const isAdmin = currentUser.role === 'Admin'

  const handleViewAsChange = (id: string) => {
    setCurrentUser(USERS.find(u => u.id === id) || USERS[0])
  }

  return (
    <>
      <Header 
        viewAsOptions={VIEW_AS_OPTIONS}
        currentViewAs={currentUser.id}
        onViewAsChange={handleViewAsChange}
      />

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
    </>
  )
}
