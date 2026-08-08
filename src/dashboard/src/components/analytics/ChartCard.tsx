/**
 * 차트 래퍼 카드 — AnalyticsPage 내부 전용.
 */

import type React from 'react'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartCardProps {
  title: string
  icon: typeof BarChart3
  children: React.ReactNode
  className?: string
  headerExtra?: React.ReactNode
}

export function ChartCard({ title, icon: Icon, children, className, headerExtra }: ChartCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          {title}
        </h3>
        {headerExtra}
      </div>
      {children}
    </div>
  )
}
