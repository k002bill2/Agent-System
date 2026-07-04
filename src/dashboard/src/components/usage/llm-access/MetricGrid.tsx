import { formatCompactNumber, formatCost } from './utils'

export function MetricGrid({
  totalTokens,
  totalRequests,
  estimatedCost,
}: {
  totalTokens: number
  totalRequests: number
  estimatedCost: number | null | undefined
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg bg-gray-50 dark:bg-gray-900/60 p-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">Tokens</p>
        <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
          {formatCompactNumber(totalTokens)}
        </p>
      </div>
      <div className="rounded-lg bg-gray-50 dark:bg-gray-900/60 p-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">Requests</p>
        <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
          {totalRequests.toLocaleString()}
        </p>
      </div>
      <div className="rounded-lg bg-gray-50 dark:bg-gray-900/60 p-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">Cost</p>
        <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
          {formatCost(estimatedCost)}
        </p>
      </div>
    </div>
  )
}
