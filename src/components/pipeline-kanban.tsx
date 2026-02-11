'use client'

import { useState, useEffect } from 'react'
import { STAGE_CONFIG, SUPER_STAGES, SuperStage, getSalespersonName, SALESPERSON_IDS } from '@/lib/pipeline-config'
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
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// Static list of salespeople for dropdown (doesn't change based on filtered data)
const ALL_SALESPEOPLE = Object.entries(SALESPERSON_IDS).map(([name, ids]) => ({
  name,
  ids: ids.join(','),
}))

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
    transition,
  } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
        <span className={`truncate ${showSalesperson ? 'ml-2' : ''}`}>{card.dealType || card.source}</span>
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
        <span className={`truncate ${showSalesperson ? 'ml-2' : ''}`}>{card.dealType || card.source}</span>
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
  isAdmin?: boolean
}

export function PipelineKanban({ salespersonIds, isAdmin = true }: PipelineKanbanProps) {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null)
  const [clinicFilter, setClinicFilter] = useState<string>('')
  const [salespersonFilter, setSalespersonFilter] = useState<string>(salespersonIds?.join(',') || '')
  const [sortBy, setSortBy] = useState<SortOption>('days_asc')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

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
      if (salespersonFilter) params.set('salesperson', salespersonFilter)
      const url = `/api/pipeline${params.toString() ? '?' + params.toString() : ''}`
      const response = await fetch(url)
      
      if (!response.ok) throw new Error('Failed to fetch pipeline')
      
      const result = await response.json()
      setData(result)
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
    }
  }, [salespersonIds])
  
  useEffect(() => {
    fetchPipeline()
  }, [clinicFilter, salespersonFilter])

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
    
    // Update GHL
    setUpdating(cardId)
    try {
      const response = await fetch('/api/pipeline/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId: cardId,
          clinic: sourceCard.clinic,
          targetStage,
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update stage')
      }
      
      // Refresh to get accurate data
      await fetchPipeline()
    } catch (err) {
      console.error('Failed to move card:', err)
      // Revert on error
      await fetchPipeline()
    } finally {
      setUpdating(null)
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

  // Filter pipeline data by search query
  const filteredPipeline = searchQuery
    ? Object.fromEntries(
        Object.entries(data.pipeline).map(([stage, cards]) => [
          stage,
          (cards as PipelineCard[]).filter(card => 
            card.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
        ])
      ) as Record<SuperStage, PipelineCard[]>
    : data.pipeline

  // Recalculate totals
  const filteredTotals = searchQuery
    ? {
        count: Object.values(filteredPipeline).flat().length,
        value: Object.values(filteredPipeline).flat().reduce((sum, card) => sum + card.value, 0),
        byStage: Object.fromEntries(
          Object.entries(filteredPipeline).map(([stage, cards]) => [
            stage,
            { count: cards.length, value: cards.reduce((sum, card) => sum + card.value, 0) }
          ])
        ) as Record<SuperStage, { count: number; value: number }>
      }
    : data.totals

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Pipeline</h2>
            <div className="text-sm text-muted-foreground">
              {filteredTotals.count} opportunities · {formatCurrency(filteredTotals.value)} total
            </div>
            {updating && (
              <span className="text-xs text-muted-foreground animate-pulse">Updating...</span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient..."
              className="border border-border rounded-lg px-3 py-2 text-sm bg-secondary text-foreground placeholder:text-muted-foreground w-40 focus:ring-2 focus:ring-zinc-400/30 focus:border-zinc-400 outline-none"
            />
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
            
            <button
              onClick={fetchPipeline}
              className="px-3 py-2 text-sm bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors font-medium"
            >
              Refresh
            </button>
          </div>
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
                  ✕
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Deal Type</span>
                  <span className="text-foreground">{selectedCard.dealType || '—'}</span>
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
              
              <div className="mt-4 pt-4 border-t border-border">
                <a
                  href={`https://app.gohighlevel.com/contacts/${selectedCard.contactId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                >
                  Open in GHL
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndContext>
  )
}
