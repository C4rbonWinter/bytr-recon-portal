'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { STAGE_CONFIG, SUPER_STAGES, SuperStage, getSalespersonName, SALESPERSON_IDS } from '@/lib/pipeline-config'
// SyncIndicator moved to header
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// Static list of salespeople for dropdown (doesn't change based on filtered data)
const ALL_SALESPEOPLE = Object.entries(SALESPERSON_IDS).map(([name, ids]) => ({
  name,
  ids: ids.join(','),
}))

// Deal type options for dropdown
const DEAL_TYPES = [
  'Full Arch',
  'Double Arch',
  'Single Arch',
  'Zygo',
  'Double Zygo',
  'Restorative',
  'U/L Onyx Upgrade',
  'Other',
]

// GHL Location IDs by clinic
const GHL_LOCATION_IDS: Record<string, string> = {
  'TR01': 'cl9YH8PZgv32HEz5pIXT',  // San Gabriel
  'TR02': 'DJfIuAH1tTxRRBEufitL',  // Irvine
  'TR04': '1isaYfEkvNkyLH3XepI5',  // Las Vegas
}

function getGhlContactUrl(clinic: string, contactId: string): string {
  const locationId = GHL_LOCATION_IDS[clinic] || GHL_LOCATION_IDS['TR01']
  return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`
}

interface PipelineCard {
  id: string
  name: string
  value: number
  clinic: string
  stage: SuperStage
  ghlStageId: string
  assignedTo: string
  source: string
  dealType: string
  daysInStage: number
  contactId: string
  email?: string
  phone?: string
  tags: string[]
  createdAt: string
}

interface Salesperson {
  id: string
  name: string
}

interface PipelineData {
  pipeline: Record<SuperStage, PipelineCard[]>
  totals: {
    count: number
    value: number
    byStage: Record<SuperStage, { count: number; value: number }>
  }
  salespersons: Salesperson[]
}

interface LeaderboardEntry {
  name: string
  value: number
  displayValue: string
}

interface LeaderboardStats {
  dealsWon: LeaderboardEntry
  totalCollections: LeaderboardEntry
  biggestPipeline: LeaderboardEntry
  fastestCloser: LeaderboardEntry
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

type SortOption = 'days_desc' | 'days_asc' | 'newest' | 'oldest' | 'name_asc' | 'value_desc'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'days_asc', label: 'Hottest' },
  { value: 'days_desc', label: 'Coldest' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name_asc', label: 'A-Z' },
  { value: 'value_desc', label: 'Value (High→Low)' },
]

function sortCards(cards: PipelineCard[], sortBy: SortOption): PipelineCard[] {
  return [...cards].sort((a, b) => {
    switch (sortBy) {
      case 'days_asc':
        return a.daysInStage - b.daysInStage
      case 'days_desc':
        return b.daysInStage - a.daysInStage
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case 'name_asc':
        return a.name.localeCompare(b.name)
      case 'value_desc':
        return b.value - a.value
      default:
        return 0
    }
  })
}

function DaysInStageBadge({ days }: { days: number }) {
  let color = 'bg-chart-6/10 text-chart-6'
  if (days > 14) color = 'bg-chart-1/10 text-chart-1'
  if (days > 30) color = 'bg-destructive/10 text-destructive'
  
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
      {days}d
    </span>
  )
}

function ClinicBadge({ clinic }: { clinic: string }) {
  const colors: Record<string, string> = {
    TR01: 'bg-chart-5/10 text-chart-5',
    TR02: 'bg-chart-4/10 text-chart-4',
    TR04: 'bg-chart-2/10 text-chart-2',
  }
  
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[clinic] || 'bg-secondary text-muted-foreground'}`}>
      {clinic}
    </span>
  )
}

function truncateName(name: string, maxLength: number = 24): string {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength) + '...'
}

// Draggable card component
function DraggableCard({ card, onClick, showSalesperson, isDragging }: { 
  card: PipelineCard
  onClick: () => void
  showSalesperson: boolean
  isDragging?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({ id: card.id })

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-card rounded-lg p-3 border border-border cursor-grab active:cursor-grabbing hover:border-zinc-400/50 focus-visible:ring-2 focus-visible:ring-zinc-400/30 focus-visible:border-zinc-400 transition-colors touch-none outline-none"
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium text-sm text-foreground truncate flex-1" title={card.name}>
          {truncateName(card.name)}
        </h4>
        <DaysInStageBadge days={card.daysInStage} />
      </div>
      
      <div className="flex justify-between items-center mb-2">
        <span className="text-lg font-bold text-foreground tracking-tight">{formatCurrency(card.value)}</span>
        <ClinicBadge clinic={card.clinic} />
      </div>
      
      <div className="flex justify-between items-center text-xs text-muted-foreground">
        {showSalesperson && <span className="truncate">{card.assignedTo}</span>}
        {card.dealType && <span className={`truncate ${showSalesperson ? 'ml-2' : ''}`}>{card.dealType}</span>}
      </div>
    </div>
  )
}

// Static card for drag overlay
function CardOverlay({ card, showSalesperson }: { card: PipelineCard; showSalesperson: boolean }) {
  return (
    <div className="bg-card rounded-lg p-3 border-2 border-zinc-400 shadow-lg w-[260px] opacity-95">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium text-sm text-foreground truncate flex-1">
          {truncateName(card.name)}
        </h4>
        <DaysInStageBadge days={card.daysInStage} />
      </div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-lg font-bold text-foreground tracking-tight">{formatCurrency(card.value)}</span>
        <ClinicBadge clinic={card.clinic} />
      </div>
      <div className="flex justify-between items-center text-xs text-muted-foreground">
        {showSalesperson && <span className="truncate">{card.assignedTo}</span>}
        {card.dealType && <span className={`truncate ${showSalesperson ? 'ml-2' : ''}`}>{card.dealType}</span>}
      </div>
    </div>
  )
}

// Droppable stage column
function DroppableColumn({ 
  stage, 
  cards, 
  totals,
  onCardClick,
  showSalesperson,
  sortBy,
  activeId,
}: { 
  stage: SuperStage
  cards: PipelineCard[]
  totals: { count: number; value: number }
  onCardClick: (card: PipelineCard) => void
  showSalesperson: boolean
  sortBy: SortOption
  activeId: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const config = STAGE_CONFIG[stage]
  const sortedCards = sortCards(cards, sortBy)
  
  return (
    <div 
      ref={setNodeRef}
      className={`flex-1 min-w-[240px] max-w-[300px] bg-secondary/50 rounded-lg p-2 transition-colors ${
        isOver ? 'ring-2 ring-zinc-400 bg-zinc-400/5' : ''
      }`}
    >
      <div className="flex justify-between items-center mb-3 px-1">
        <h3 className="font-semibold text-sm text-foreground">{config.name}</h3>
        <div className="text-xs text-muted-foreground">
          {totals.count} · {formatCurrency(totals.value)}
        </div>
      </div>
      
      <div className="space-y-2 min-h-[100px]">
        {sortedCards.map(card => (
          <DraggableCard 
            key={card.id} 
            card={card} 
            onClick={() => onCardClick(card)}
            showSalesperson={showSalesperson}
            isDragging={activeId === card.id}
          />
        ))}
        
        {cards.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {isOver ? 'Drop here' : 'No opportunities'}
          </div>
        )}
      </div>
    </div>
  )
}

interface PipelineKanbanProps {
  salespersonIds?: string[]
  salespersonName?: string
  isAdmin?: boolean
}

export function PipelineKanban({ salespersonIds, salespersonName, isAdmin = true }: PipelineKanbanProps) {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null)
  const [editingDealType, setEditingDealType] = useState<string>('')
  const [savingDealType, setSavingDealType] = useState(false)
  const [clinicFilter, setClinicFilter] = useState<string>('')
  const [salespersonFilter, setSalespersonFilter] = useState<string>(salespersonIds?.join(',') || '')
  const [monthFilter, setMonthFilter] = useState<string>('this_month')
  const [sortBy, setSortBy] = useState<SortOption>('days_asc')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardStats | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  )

  const fetchPipeline = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (clinicFilter) params.set('clinic', clinicFilter)
      if (salespersonName) params.set('salespersonName', salespersonName)
      else if (salespersonFilter) params.set('salespersonIds', salespersonFilter)
      const url = `/api/pipeline${params.toString() ? '?' + params.toString() : ''}`
      const response = await fetch(url)
      
      if (!response.ok) throw new Error('Failed to fetch pipeline')
      
      const result = await response.json()
      setData(result)
      // Note: Leaderboard is fetched separately with period filter (see monthFilter useEffect)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (salespersonIds && salespersonIds.length > 0) {
      setSalespersonFilter(salespersonIds.join(','))
    } else {
      setSalespersonFilter('') // Clear filter when switching back to admin view
    }
  }, [salespersonIds])
  
  useEffect(() => {
    fetchPipeline()
  }, [clinicFilter, salespersonFilter, salespersonName])
  
  // Fetch leaderboard with period filter for collections/fastest closer
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`/api/pipeline/leaderboard?period=${monthFilter}`)
        if (response.ok) {
          const result = await response.json()
          setLeaderboard(result)
        }
      } catch (err) {
        console.error('Leaderboard fetch error:', err)
      }
    }
    fetchLeaderboard()
  }, [monthFilter])

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = event.active.id as string
    // Find the card across all stages
    if (data) {
      for (const stage of SUPER_STAGES) {
        const card = data.pipeline[stage].find(c => c.id === cardId)
        if (card) {
          setActiveCard(card)
          break
        }
      }
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCard(null)
    
    if (!over || !data) return
    
    const cardId = active.id as string
    const targetStage = over.id as SuperStage
    
    // Find the card and its current stage
    let sourceCard: PipelineCard | null = null
    let sourceStage: SuperStage | null = null
    
    for (const stage of SUPER_STAGES) {
      const card = data.pipeline[stage].find(c => c.id === cardId)
      if (card) {
        sourceCard = card
        sourceStage = stage
        break
      }
    }
    
    if (!sourceCard || !sourceStage || sourceStage === targetStage) return
    
    // Optimistically update UI
    const newPipeline = { ...data.pipeline }
    newPipeline[sourceStage] = newPipeline[sourceStage].filter(c => c.id !== cardId)
    newPipeline[targetStage] = [...newPipeline[targetStage], { ...sourceCard, stage: targetStage }]
    
    setData({
      ...data,
      pipeline: newPipeline,
    })
    
    // Queue move for background sync (instead of real-time GHL update)
    setUpdating(cardId)
    try {
      const response = await fetch('/api/pipeline/queue-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId: cardId,
          clinic: sourceCard.clinic,
          fromStage: sourceStage,
          toStage: targetStage,
          dealName: sourceCard.name,
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to queue move')
      }
      
      // Don't refresh - keep optimistic UI, sync happens in background
    } catch (err) {
      console.error('Failed to queue move:', err)
      // Revert on error
      await fetchPipeline()
    } finally {
      setUpdating(null)
    }
  }

  // Initialize editingDealType when modal opens
  useEffect(() => {
    if (selectedCard) {
      setEditingDealType(selectedCard.dealType || '')
    }
  }, [selectedCard])

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCard) {
        setSelectedCard(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedCard])

  // Handle deal type change - update UI immediately, save in background
  const handleDealTypeChange = async (newDealType: string) => {
    if (!selectedCard) return
    
    // Update UI immediately
    setEditingDealType(newDealType)
    
    // Update local state immediately (optimistic update)
    if (data) {
      const newPipeline = { ...data.pipeline }
      for (const stage of SUPER_STAGES) {
        const cardIndex = newPipeline[stage].findIndex(c => c.id === selectedCard.id)
        if (cardIndex !== -1) {
          newPipeline[stage][cardIndex] = { ...newPipeline[stage][cardIndex], dealType: newDealType }
          break
        }
      }
      setData({ ...data, pipeline: newPipeline })
      setSelectedCard({ ...selectedCard, dealType: newDealType })
    }
    
    // Save to backend in background (don't reset on failure)
    setSavingDealType(true)
    try {
      const response = await fetch('/api/pipeline/deal-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedCard.contactId,
          clinic: selectedCard.clinic,
          dealType: newDealType,
        }),
      })
      
      if (!response.ok) {
        console.error('Failed to save deal type to server')
        // Don't reset - keep the local change, will sync on next load
      }
    } catch (err) {
      console.error('Failed to update deal type:', err)
      // Don't reset - keep the local change
    } finally {
      setSavingDealType(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading pipeline...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Error: {error}</div>
      </div>
    )
  }

  if (!data) return null

  // Get all cards
  const allCards = Object.values(data.pipeline).flat()
  
  // Time period filter options
  const TIME_PERIODS = [
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'last_30', label: 'Last 30 Days' },
    { value: 'last_90', label: 'Last 90 Days' },
    { value: 'this_year', label: 'This Year' },
    { value: 'last_year', label: 'Last Year' },
    { value: 'all', label: 'All Time' },
  ]
  
  // Get date range for filter
  const getDateRange = (period: string): { start: Date | null; end: Date | null } => {
    const now = new Date()
    const thisYear = now.getFullYear()
    const thisMonth = now.getMonth()
    
    switch (period) {
      case 'this_month':
        return { start: new Date(thisYear, thisMonth, 1), end: null }
      case 'last_month':
        return { 
          start: new Date(thisYear, thisMonth - 1, 1), 
          end: new Date(thisYear, thisMonth, 0, 23, 59, 59) 
        }
      case 'last_30':
        const d30 = new Date(now)
        d30.setDate(d30.getDate() - 30)
        return { start: d30, end: null }
      case 'last_90':
        const d90 = new Date(now)
        d90.setDate(d90.getDate() - 90)
        return { start: d90, end: null }
      case 'this_year':
        return { start: new Date(thisYear, 0, 1), end: null }
      case 'last_year':
        return { 
          start: new Date(thisYear - 1, 0, 1), 
          end: new Date(thisYear - 1, 11, 31, 23, 59, 59) 
        }
      default:
        return { start: null, end: null }
    }
  }
  
  const dateRange = getDateRange(monthFilter)
  
  // Filter pipeline data by search query and time period
  const filteredPipeline = Object.fromEntries(
    Object.entries(data.pipeline).map(([stage, cards]) => [
      stage,
      (cards as PipelineCard[]).filter(card => {
        // Search filter
        if (searchQuery && !card.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false
        }
        // Time period filter
        if (dateRange.start || dateRange.end) {
          const cardDate = card.createdAt ? new Date(card.createdAt) : null
          if (!cardDate) return false
          if (dateRange.start && cardDate < dateRange.start) return false
          if (dateRange.end && cardDate > dateRange.end) return false
        }
        return true
      })
    ])
  ) as Record<SuperStage, PipelineCard[]>

  // Always calculate totals from filtered data
  const filteredTotals = {
    count: Object.values(filteredPipeline).flat().length,
    value: Object.values(filteredPipeline).flat().reduce((sum, card) => sum + card.value, 0),
    byStage: Object.fromEntries(
      Object.entries(filteredPipeline).map(([stage, cards]) => [
        stage,
        { count: cards.length, value: cards.reduce((sum, card) => sum + card.value, 0) }
      ])
    ) as Record<SuperStage, { count: number; value: number }>
  }

  // Use team-wide leaderboard from API (not affected by View As filter)
  // Stats cards should always show team leaders regardless of who is viewing
  const teamLeaderboard = {
    dealsWon: leaderboard?.dealsWon || { name: '—', value: 0, displayValue: '0' },
    biggestPipeline: leaderboard?.biggestPipeline || { name: '—', value: 0, displayValue: '0' },
    totalCollections: leaderboard?.totalCollections || { name: '—', value: 0, displayValue: '$0' },
    fastestCloser: leaderboard?.fastestCloser || { name: '—', value: 0, displayValue: '—' },
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div>
        {/* Header */}
        {updating && (
          <div className="mb-4">
            <span className="text-xs text-muted-foreground animate-pulse">Updating...</span>
          </div>
        )}

        {/* Stats Cards */}
        {data && leaderboard && (
          <div className="grid grid-cols-5 gap-4 mb-4">
            <div className="bg-card p-4 rounded-lg border border-border hover:border-foreground/20 transition-colors">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Pipeline</div>
              <div className="text-2xl font-bold text-foreground tracking-tight">{formatCurrency(filteredTotals.value)}</div>
              <div className="text-sm text-muted-foreground font-medium mt-1">{filteredTotals.count} opportunities</div>
            </div>
            <div className="bg-card p-4 rounded-lg border border-border hover:border-chart-5/20 transition-colors">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Deals Won</div>
              <div className="text-2xl font-bold text-chart-5 tracking-tight">{teamLeaderboard.dealsWon.displayValue}</div>
              <div className="text-sm text-muted-foreground font-medium mt-1">{teamLeaderboard.dealsWon.name}</div>
            </div>
            <div className="bg-card p-4 rounded-lg border border-border hover:border-muted-foreground/20 transition-colors">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Total Collections</div>
              <div className="text-2xl font-bold text-success tracking-tight">{teamLeaderboard.totalCollections?.displayValue ?? '$0'}</div>
              <div className="text-sm text-muted-foreground font-medium mt-1">{teamLeaderboard.totalCollections?.name ?? '—'}</div>
            </div>
            <div className="bg-card p-4 rounded-lg border border-border hover:border-muted-foreground/20 transition-colors">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Biggest Pipeline</div>
              <div className="text-2xl font-bold text-chart-1 tracking-tight">{teamLeaderboard.biggestPipeline.displayValue}</div>
              <div className="text-sm text-muted-foreground font-medium mt-1">{teamLeaderboard.biggestPipeline.name}</div>
            </div>
            <div className="bg-card p-4 rounded-lg border border-border hover:border-primary/20 transition-colors">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Fastest Closer</div>
              <div className="text-2xl font-bold text-primary tracking-tight">{teamLeaderboard.fastestCloser?.displayValue ?? '—'}</div>
              <div className="text-sm text-muted-foreground font-medium mt-1">{teamLeaderboard.fastestCloser?.name ?? '—'}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-4 items-center justify-end">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient..."
            className="border border-border rounded-lg px-3 py-2 text-sm bg-secondary text-foreground placeholder:text-muted-foreground w-48 focus:ring-2 focus:ring-zinc-400/30 focus:border-zinc-400 outline-none"
          />
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border border-border rounded-lg pl-3 pr-8 py-2 text-sm bg-secondary text-foreground"
          >
            {TIME_PERIODS.map(period => (
              <option key={period.value} value={period.value}>{period.label}</option>
            ))}
          </select>
          <select
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
            className="border border-border rounded-lg pl-3 pr-8 py-2 text-sm bg-secondary text-foreground"
          >
            <option value="">All Clinics</option>
            <option value="TR01">TR01 (SG)</option>
            <option value="TR02">TR02 (IRV)</option>
            <option value="TR04">TR04 (LV)</option>
          </select>
          {isAdmin && (
            <select
              value={salespersonFilter}
              onChange={(e) => setSalespersonFilter(e.target.value)}
              className="border border-border rounded-lg pl-3 pr-8 py-2 text-sm bg-secondary text-foreground"
            >
              <option value="">All Salespeople</option>
              {ALL_SALESPEOPLE.map(sp => (
                <option key={sp.name} value={sp.ids}>{sp.name}</option>
              ))}
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border border-border rounded-lg pl-3 pr-8 py-2 text-sm bg-secondary text-foreground"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Kanban Board */}
        <div className="flex gap-3 overflow-x-auto pb-4">
          {SUPER_STAGES.map(stage => (
            <DroppableColumn
              key={stage}
              stage={stage}
              cards={filteredPipeline[stage]}
              totals={filteredTotals.byStage[stage]}
              onCardClick={setSelectedCard}
              showSalesperson={isAdmin}
              sortBy={sortBy}
              activeId={activeCard?.id || null}
            />
          ))}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeCard ? (
            <CardOverlay card={activeCard} showSalesperson={isAdmin} />
          ) : null}
        </DragOverlay>

        {/* Card Detail Modal */}
        {selectedCard && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 p-4 border border-border">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-foreground">{selectedCard.name}</h3>
                <button 
                  onClick={() => setSelectedCard(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Value</span>
                  <span className="font-bold text-foreground">{formatCurrency(selectedCard.value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Clinic</span>
                  <ClinicBadge clinic={selectedCard.clinic} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Stage</span>
                  <span className="text-foreground">{STAGE_CONFIG[selectedCard.stage].name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Days in Stage</span>
                  <DaysInStageBadge days={selectedCard.daysInStage} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Deal Type</span>
                  <select
                    value={editingDealType}
                    onChange={(e) => handleDealTypeChange(e.target.value)}
                    disabled={savingDealType}
                    className="bg-secondary border border-border rounded px-2 py-1 text-sm text-foreground cursor-pointer hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    <option value="">— Select —</option>
                    {DEAL_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Source</span>
                  <span className="text-foreground">{selectedCard.source}</span>
                </div>
                {selectedCard.email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Email</span>
                    <span className="text-foreground text-sm">{selectedCard.email}</span>
                  </div>
                )}
                {selectedCard.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Phone</span>
                    <span className="text-foreground">{selectedCard.phone}</span>
                  </div>
                )}
                {selectedCard.tags.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm">Tags</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedCard.tags.slice(0, 5).map(tag => (
                        <span key={tag} className="text-xs bg-secondary px-2 py-0.5 rounded text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                      {selectedCard.tags.length > 5 && (
                        <span className="text-xs text-muted-foreground">+{selectedCard.tags.length - 5} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-border flex gap-2">
                <a
                  href={getGhlContactUrl(selectedCard.clinic, selectedCard.contactId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-4 py-2 bg-secondary text-foreground border border-border rounded-lg hover:bg-secondary/80 transition-colors font-medium"
                >
                  Open in GHL
                </a>
                <button
                  onClick={() => setSelectedCard(null)}
                  className="flex-1 px-4 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndContext>
  )
}
