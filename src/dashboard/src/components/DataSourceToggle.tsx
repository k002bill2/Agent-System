/**
 * Data Source Toggle component
 *
 * Allows switching between AOS Session and Claude Code as the data source
 * for Activity and Tasks pages.
 */

import { cn } from '../lib/utils'
import { Terminal, Cpu } from 'lucide-react'
import type { DataSource } from '../types/claudeCodeActivity'

interface DataSourceToggleProps {
  value: DataSource
  onChange: (value: DataSource) => void
  className?: string
}

export function DataSourceToggle({ value, onChange, className }: DataSourceToggleProps) {
  return (
    <div className={cn('flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg', className)}>
      <button
        onClick={() => onChange('aos')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
          value === 'aos'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        )}
      >
        <Cpu className="w-4 h-4" />
        <span>AOS Session</span>
      </button>
      <button
        onClick={() => onChange('claude-code')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
          value === 'claude-code'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        )}
      >
        <Terminal className="w-4 h-4" />
        <span>Claude Code</span>
      </button>
    </div>
  )
}
