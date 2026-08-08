/**
 * 추정 비용 대 실제 과금 비교 카드 — AnalyticsPage 내부 전용.
 */

import { DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from './utils'

interface CostComparisonCardProps {
  estimatedCost: number
  estimatedTokens: number
  actualCost: number | null
}

export function CostComparisonCard({ estimatedCost, estimatedTokens, actualCost }: CostComparisonCardProps) {
  const formatCostValue = (cost: number): string => {
    if (cost === 0) return 'FREE'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(2)}`
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">Total Cost</span>
        <div className={cn('p-2 rounded-lg', 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400')}>
          <DollarSign className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {formatCostValue(estimatedCost)}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {formatNumber(estimatedTokens)} tokens
        {actualCost !== null && (
          <span className="ml-1 text-amber-600 dark:text-amber-400">
            (실제 과금: {formatCostValue(actualCost)})
          </span>
        )}
      </div>
    </div>
  )
}
