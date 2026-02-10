'use client'

import { PipelineKanban } from '@/components/pipeline-kanban'
import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'

export default function PipelinePage() {
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
              <div className="relative group">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700">
                  <span className="text-sm font-medium dark:text-zinc-100">Cole</span>
                  <span className="text-xs text-gray-500 dark:text-zinc-400">(Admin)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        <PipelineKanban />
      </main>
    </div>
  )
}
