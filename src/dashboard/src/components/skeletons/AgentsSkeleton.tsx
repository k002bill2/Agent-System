import { Skeleton } from '../ui/Skeleton'

export function AgentsSkeleton() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <Skeleton className="h-7 w-24 mb-6" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <AgentCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

function AgentCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div>
            <Skeleton className="h-4 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="w-4 h-4 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Current Task */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
        <Skeleton className="h-3 w-20 mb-1" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  )
}
