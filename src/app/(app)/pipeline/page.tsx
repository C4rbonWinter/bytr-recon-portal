'use client'

import { useState } from 'react'
import { PipelineKanban } from '@/components/pipeline-kanban'
import { Header } from '@/components/header'

// Simulated users for "View As" feature
// Each salesperson has multiple GHL user IDs (one per GHL instance)
// role: 'Admin' = sees all opportunities + salesperson names on cards
// role: 'Salesperson' = sees only their opportunities, no SP name on cards
// Josh and Chris have both admin (All) and personal (Mine) views since they're manager-salespeople
// filterName is used for database matching (without the suffix)
const USERS = [
  { id: 'admin', name: 'Cole', filterName: 'Cole', role: 'Admin', ghlUserIds: [] as string[] },
  { id: 'josh-all', name: 'Josh (All)', filterName: 'Josh', role: 'Admin', ghlUserIds: [] as string[] },
  { id: 'josh-mine', name: 'Josh (Mine)', filterName: 'Josh', role: 'Salesperson', ghlUserIds: ['xGHzefX0G70ObVhtULtS', 'cnHNqiEGjpOOWVzsZnJe'] },
  { id: 'chris-all', name: 'Chris (All)', filterName: 'Chris', role: 'Admin', ghlUserIds: [] as string[] },
  { id: 'chris-mine', name: 'Chris (Mine)', filterName: 'Chris', role: 'Salesperson', ghlUserIds: ['W02cGzjo8DOEvq3EnNH5', 'MH14SnZ7liJIMIBd2mge'] },
  { id: 'molly', name: 'Molly', filterName: 'Molly', role: 'Salesperson', ghlUserIds: ['40OKojJlHK1QGWxobiFB', 'OYwn6OtVac85ljn26qle'] },
  { id: 'scot', name: 'Scot', filterName: 'Scot', role: 'Salesperson', ghlUserIds: ['R2lQOlnfA2u3ozRUIA5a', 'qdkCS02nCbZhGmn0R8zE'] },
  { id: 'jake', name: 'Jake', filterName: 'Jake', role: 'Salesperson', ghlUserIds: ['dIYBT07Gjs2KnrHqSWiH', '1pShLvH7qVgRjaMVp80p'] },
  { id: 'blake', name: 'Blake', filterName: 'Blake', role: 'Salesperson', ghlUserIds: ['DRr7a8bJ3SYfc7Uaonle', 'drbfnr6OcLkSfSSxgev0'] },
]

const VIEW_AS_OPTIONS = USERS.map(u => ({ id: u.id, name: u.name }))

export default function PipelinePage() {
  const [currentUser, setCurrentUser] = useState(USERS[0])
  const [refreshKey, setRefreshKey] = useState(0)
  
  const isAdmin = currentUser.role === 'Admin'

  const handleViewAsChange = (id: string) => {
    setCurrentUser(USERS.find(u => u.id === id) || USERS[0])
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
        {!isAdmin && (
          <div className="mb-4 px-4 py-2 bg-chart-5/10 rounded-lg text-sm text-chart-5">
            Viewing as <strong>{currentUser.name}</strong> — showing only their assigned opportunities
          </div>
        )}
        <PipelineKanban 
          key={refreshKey}
          salespersonIds={isAdmin ? undefined : currentUser.ghlUserIds}
          salespersonName={isAdmin ? undefined : currentUser.filterName}
          isAdmin={isAdmin}
        />
      </main>
    </>
  )
}
