'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { PipelineKanban } from '@/components/pipeline-kanban'
import { Header } from '@/components/header'

// Users with email mapping for auth
// role: 'Admin' = sees all opportunities + salesperson names on cards
// role: 'Salesperson' = sees only their opportunities, no SP name on cards
// isManager: true = can toggle between personal and admin view
const USERS = [
  { id: 'admin', name: 'Cole', role: 'Admin', isManager: false, ghlUserIds: [] as string[], emails: ['cole@bytr.ai', 'cole@teethandrobots.com'] },
  { id: 'rick', name: 'Rick', role: 'Admin', isManager: false, ghlUserIds: [] as string[], emails: ['rick@bytr.ai'] },
  { id: 'josh', name: 'Josh', role: 'Admin', isManager: true, ghlUserIds: ['xGHzefX0G70ObVhtULtS', 'cnHNqiEGjpOOWVzsZnJe'], emails: ['josh@bytr.ai', 'josh@teethandrobots.com'] },
  { id: 'chris', name: 'Chris', role: 'Admin', isManager: true, ghlUserIds: ['W02cGzjo8DOEvq3EnNH5', 'MH14SnZ7liJIMIBd2mge'], emails: ['chris@teethandrobots.com'] },
  { id: 'molly', name: 'Molly', role: 'Salesperson', isManager: false, ghlUserIds: ['40OKojJlHK1QGWxobiFB', 'OYwn6OtVac85ljn26qle'], emails: ['molly@teethandrobots.com'] },
  { id: 'scot', name: 'Scot', role: 'Salesperson', isManager: false, ghlUserIds: ['R2lQOlnfA2u3ozRUIA5a', 'qdkCS02nCbZhGmn0R8zE'], emails: ['scot@teethandrobots.com'] },
  { id: 'jake', name: 'Jake', role: 'Salesperson', isManager: false, ghlUserIds: ['dIYBT07Gjs2KnrHqSWiH', '1pShLvH7qVgRjaMVp80p'], emails: ['jake@teethandrobots.com'] },
  { id: 'blake', name: 'Blake', role: 'Salesperson', isManager: false, ghlUserIds: ['DRr7a8bJ3SYfc7Uaonle', 'drbfnr6OcLkSfSSxgev0'], emails: ['blake@teethandrobots.com'] },
]

const VIEW_AS_OPTIONS = USERS.map(u => ({ id: u.id, name: u.name }))

// Find user by email
function getUserByEmail(email: string | null | undefined) {
  if (!email) return null
  return USERS.find(u => u.emails.includes(email.toLowerCase()))
}

export default function PipelinePage() {
  const { data: session, status } = useSession()
  const sessionEmail = session?.user?.email
  
  // Default to logged-in user, or first user if not found (shouldn't happen with auth)
  const [currentUser, setCurrentUser] = useState(USERS[0])
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Set current user based on session when it loads
  useEffect(() => {
    if (sessionEmail) {
      const matchedUser = getUserByEmail(sessionEmail)
      if (matchedUser) {
        setCurrentUser(matchedUser)
      }
      // Debug log
      console.log('Session email:', sessionEmail, 'Matched user:', matchedUser?.name || 'NONE')
    }
  }, [sessionEmail])
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
          key={`${refreshKey}-${showMyView}-${currentUser.id}`}
          salespersonIds={isAdmin ? undefined : currentUser.ghlUserIds}
          salespersonName={isAdmin ? undefined : currentUser.name}
          isAdmin={isAdmin}
        />
      </main>
    </>
  )
}
