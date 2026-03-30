import { Skeleton } from '../ui/Skeleton'

export function MonitorSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-36" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <OverviewCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
          <Skeleton className="h-5 w-24 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CheckCardSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-1/2 p-4 overflow-y-auto bg-gray-900">
          <Skeleton className="h-5 w-20 mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 15 }).map((_, i) => (
              <LogLineSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function OverviewCardSkeleton() {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="w-5 h-5 rounded" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-6 w-12" />
    </div>
  )
}

function CheckCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  )
}

function LogLineSkeleton() {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Skeleton className="h-4 w-20 bg-gray-700" />
      <Skeleton className="h-4 flex-1 bg-gray-700" />
    </div>
  )
}
