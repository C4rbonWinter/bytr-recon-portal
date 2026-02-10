'use client'

import { useState, useEffect } from 'react'
import { STAGE_CONFIG, SUPER_STAGES, SuperStage } from '@/lib/pipeline-config'

interface PipelineCard {
  id: string
  name: string
  value: number
  clinic: string
  stage: SuperStage
  ghlStageId: string
  assignedTo: string
  source: string
  daysInStage: number
  contactId: string
  email?: string
  phone?: string
  tags: string[]
  createdAt: string
}

interface PipelineData {
  pipeline: Record<SuperStage, PipelineCard[]>
  totals: {
    count: number
    value: number
    byStage: Record<SuperStage, { count: number; value: number }>
  }
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

function DaysInStageBadge({ days }: { days: number }) {
  let color = 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
  if (days > 14) color = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
  if (days > 30) color = 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
  
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>
      {days}d
    </span>
  )
}

function ClinicBadge({ clinic }: { clinic: string }) {
  const colors: Record<string, string> = {
    TR01: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400',
    TR02: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400',
    TR04: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400',
  }
  
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[clinic] || 'bg-gray-100'}`}>
      {clinic}
    </span>
  )
}

function PipelineCardComponent({ card, onClick }: { card: PipelineCard; onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-zinc-800 rounded-lg p-3 shadow-sm border dark:border-zinc-700 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium text-sm dark:text-zinc-100 truncate flex-1">{card.name}</h4>
        <DaysInStageBadge days={card.daysInStage} />
      </div>
      
      <div className="flex justify-between items-center mb-2">
        <span className="text-lg font-bold dark:text-zinc-100">{formatCurrency(card.value)}</span>
        <ClinicBadge clinic={card.clinic} />
      </div>
      
      <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">
        {card.source}
      </div>
    </div>
  )
}

function StageColumn({ 
  stage, 
  cards, 
  totals,
  onCardClick 
}: { 
  stage: SuperStage
  cards: PipelineCard[]
  totals: { count: number; value: number }
  onCardClick: (card: PipelineCard) => void
}) {
  const config = STAGE_CONFIG[stage]
  
  return (
    <div className={`flex-1 min-w-[240px] max-w-[300px] ${config.color} rounded-lg p-2`}>
      <div className="flex justify-between items-center mb-3 px-1">
        <h3 className="font-semibold text-sm dark:text-zinc-100">{config.name}</h3>
        <div className="text-xs text-gray-600 dark:text-zinc-400">
          {totals.count} • {formatCurrency(totals.value)}
        </div>
      </div>
      
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
        {cards.map(card => (
          <PipelineCardComponent 
            key={card.id} 
            card={card} 
            onClick={() => onCardClick(card)}
          />
        ))}
        
        {cards.length === 0 && (
          <div className="text-center py-8 text-gray-400 dark:text-zinc-500 text-sm">
            No opportunities
          </div>
        )}
      </div>
    </div>
  )
}

export function PipelineKanban() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null)
  const [clinicFilter, setClinicFilter] = useState<string>('')

  const fetchPipeline = async () => {
    try {
      setLoading(true)
      const url = clinicFilter 
        ? `/api/pipeline?clinic=${clinicFilter}`
        : '/api/pipeline'
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
    fetchPipeline()
  }, [clinicFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-zinc-400">Loading pipeline...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error: {error}</div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold dark:text-zinc-100">Pipeline</h2>
          <div className="text-sm text-gray-600 dark:text-zinc-400">
            {data.totals.count} opportunities • {formatCurrency(data.totals.value)} total value
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
            className="border dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All Clinics</option>
            <option value="TR01">TR01 (SG)</option>
            <option value="TR02">TR02 (IRV)</option>
            <option value="TR04">TR04 (LV)</option>
          </select>
          
          <button
            onClick={fetchPipeline}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {SUPER_STAGES.map(stage => (
          <StageColumn
            key={stage}
            stage={stage}
            cards={data.pipeline[stage]}
            totals={data.totals.byStage[stage]}
            onCardClick={setSelectedCard}
          />
        ))}
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold dark:text-zinc-100">{selectedCard.name}</h3>
              <button 
                onClick={() => setSelectedCard(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-zinc-400">Value</span>
                <span className="font-bold dark:text-zinc-100">{formatCurrency(selectedCard.value)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-zinc-400">Clinic</span>
                <ClinicBadge clinic={selectedCard.clinic} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-zinc-400">Stage</span>
                <span className="dark:text-zinc-100">{STAGE_CONFIG[selectedCard.stage].name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-zinc-400">Days in Stage</span>
                <DaysInStageBadge days={selectedCard.daysInStage} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-zinc-400">Source</span>
                <span className="dark:text-zinc-100">{selectedCard.source}</span>
              </div>
              {selectedCard.email && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-zinc-400">Email</span>
                  <span className="dark:text-zinc-100 text-sm">{selectedCard.email}</span>
                </div>
              )}
              {selectedCard.phone && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-zinc-400">Phone</span>
                  <span className="dark:text-zinc-100">{selectedCard.phone}</span>
                </div>
              )}
              {selectedCard.tags.length > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-zinc-400 text-sm">Tags</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedCard.tags.slice(0, 5).map(tag => (
                      <span key={tag} className="text-xs bg-gray-100 dark:bg-zinc-700 px-2 py-0.5 rounded dark:text-zinc-300">
                        {tag}
                      </span>
                    ))}
                    {selectedCard.tags.length > 5 && (
                      <span className="text-xs text-gray-400">+{selectedCard.tags.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t dark:border-zinc-700">
              <a
                href={`https://app.gohighlevel.com/contacts/${selectedCard.contactId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Open in GHL
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
